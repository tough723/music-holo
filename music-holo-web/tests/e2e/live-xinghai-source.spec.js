import { createHash } from 'node:crypto'
import { test, expect } from '@playwright/test'

/**
 * 真实第三方音源的在线解析旅程（@live）。
 *
 * 与其余 e2e 的区别：这里用的不是夹具，而是**真实的星海音源脚本 + 真实平台曲目 ID**，
 * 脚本从它的公开地址下载，解析请求打到它自己的后端，因此结果依赖第三方服务是否在线。
 * 所以这个用例单独放在非阻断的 CI job 里（见 .github/workflows/ci.yml 的 live-source）。
 *
 * 断言的是两段确定性行为，不管第三方给出什么结果都必须成立：
 *   1. 脚本内容与已验证版本一致（sha256 钉死，防止上游换文件而我们还以为是同一份）；
 *   2. 解析要么落地成 https 直链并且浏览器真的解码（currentTime 前进），
 *      要么落到明文 http 直链 / 第三方报错，此时界面必须给出明确提示而不是静默失败。
 * 实际结果写进 testInfo 注解，能在 CI 日志与 job 摘要里看到。
 *
 * 平台曲目 ID 取自 docs/xinghai-validation.md 的真实解析记录（wy songmid 347230 / 320k）。
 * 榜单页的曲目只是宿主侧的载体：自定义源对话框允许显式指定平台 ID，
 * 因此这里验证的是「宿主 → 真实音源 → 真实平台」这条往返链路。
 */

const SOURCE_URL = 'https://zrcdy.dpdns.org/lx/xinghai-music-sourcev2.3.15.js'
const SOURCE_SHA256 = '807d6157e4fd7cdd05b8727efd73778b54a3b05a0b5e4c6bb28dedc0668e94e9'
const PLATFORM_ID_JSON = '{"songmid":"347230"}'
const QUALITY = '320k'

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } })

test('@live 榜单曲目用真实星海音源在线解析（第三方依赖，非阻断）', async ({ page }, testInfo) => {
  test.slow()

  // 1. 下载真实脚本并核对指纹（Node 侧请求，CI runner 有公网出口）
  const response = await page.request.get(SOURCE_URL, { timeout: 30_000 })
  expect(response.status(), '音源脚本地址应可访问').toBe(200)
  const script = await response.text()
  const sha256 = createHash('sha256').update(script, 'utf8').digest('hex')
  expect(sha256, '音源脚本应与已验证版本逐字节一致').toBe(SOURCE_SHA256)
  testInfo.annotations.push({ type: 'live-source', description: `脚本 ${script.length} 字节 sha256=${sha256.slice(0, 12)}…` })

  const source = {
    id: 'source-live-xinghai',
    fileName: 'xinghai-music-sourcev2.3.15.js',
    name: '星海音乐源',
    version: 'v3.2.15',
    description: '真实第三方音源（@live 旅程）',
    author: '星海音乐源作者',
    homepage: 'https://zddyr.top/',
    importedAt: new Date().toISOString(),
    script
  }

  await page.goto('/')
  await page.evaluate((saved) => {
    localStorage.setItem('mh_custom_sources_v1:local', JSON.stringify([saved]))
  }, source)

  // 2. 榜单页 → 使用自定义源播放
  await page.goto('/charts')
  const firstRow = page.locator('.el-table__row').first()
  await expect(firstRow).toBeVisible()
  const sourceButton = firstRow.locator('[data-testid^="custom-source-play-"]')
  const title = String(await sourceButton.getAttribute('aria-label') || '')
    .replace(/^使用自定义源播放《/, '').replace(/》$/, '')
  expect(title).not.toBe('')
  await sourceButton.click()

  const playbackDialog = page.getByRole('dialog', { name: `自定义源解析 · ${title}` })
  await expect(playbackDialog.locator('.source-playback-source .el-select')).toContainText('星海音乐源')
  await playbackDialog.getByRole('textbox', { name: '平台专属曲目字段 JSON' }).fill(PLATFORM_ID_JSON)
  await playbackDialog.getByRole('button', { name: '信任并初始化自定义音源' }).click()
  await page.getByRole('button', { name: '我信任并继续' }).click()
  await expect(playbackDialog.getByLabel('选择自定义音源平台')).toBeVisible()

  await playbackDialog.locator('.source-playback-fields .el-select').nth(1).click()
  await page.getByRole('option', { name: QUALITY }).click()
  await playbackDialog.getByRole('button', { name: '隔离解析并播放歌曲' }).click()
  await page.getByRole('button', { name: '允许并播放' }).click()

  // 3. 收集结果：媒体元素地址与界面提示（提示会自动消失，所以边轮询边收）
  const audio = page.locator('.player-bar audio').first()
  const notices = new Set()
  let mediaSrc = ''
  await expect.poll(async () => {
    const texts = await page.locator('.el-message').allInnerTexts().catch(() => [])
    for (const text of texts) notices.add(String(text).trim())
    const dialogText = await playbackDialog.innerText().catch(() => '')
    if (dialogText) notices.add(dialogText.trim())
    mediaSrc = (await audio.getAttribute('src').catch(() => '')) || ''
    return mediaSrc || notices.size > 0
  }, { timeout: 60_000, message: '解析既没有产出地址也没有任何提示（静默失败）' }).toBeTruthy()

  const noticeText = [...notices].join(' | ')
  let outcome = ''
  if (mediaSrc.startsWith('https://')) {
    // 真实直链落地：无头 Chromium 也会真解码，进度必须往前走
    await expect.poll(() => audio.evaluate((element) => element.currentTime), { timeout: 20_000 })
      .toBeGreaterThan(0)
    const position = await audio.evaluate((element) => element.currentTime)
    outcome = `PLAYED https 直链已解码播放，进度 ${position.toFixed(2)}s，主机 ${new URL(mediaSrc).host}`
  } else {
    // 明文 http 直链按既有安全边界被拒，或第三方/网络失败：都必须有明确提示
    expect(noticeText, '解析没落地时必须给出明确提示，不能静默').toMatch(/失败|不安全|拒绝|不支持|http|错误|超时|无法/)
    outcome = `BLOCKED 未落地（地址=${mediaSrc ? mediaSrc.slice(0, 60) : '空'}），界面提示：${noticeText.slice(0, 160)}`
  }
  testInfo.annotations.push({ type: 'live-outcome', description: outcome })
  // CI 日志主机不在白名单时也能拿到结论：打成一行标记，由 workflow 转成 job 注解。
  console.log(`LIVE_OUTCOME=${outcome.replace(/\n/g, ' ')}`)
})
