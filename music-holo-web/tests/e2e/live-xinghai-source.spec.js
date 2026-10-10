import { createHash } from 'node:crypto'
import { test, expect } from '@playwright/test'

/**
 * 真实第三方音源的在线解析旅程（@live）。
 *
 * 与其余 e2e 的区别：这里用的不是夹具，而是**真实的星海音源脚本 + 真实平台曲目 ID**，
 * 脚本从它的公开地址下载，解析请求打到它自己的后端，因此结果依赖第三方服务是否在线。
 * 所以这个用例单独放在非阻断的 CI job 里（见 .github/workflows/ci.yml 的 live-source）。
 *
 * 断言的是几段确定性行为，不管第三方给出什么结果都必须成立：
 *   1. 脚本内容与已验证版本一致（sha256 钉死，防止上游换文件而我们还以为是同一份）；
 *   2. 解析如果落地成 https 直链，浏览器必须真的解码（currentTime 前进）；
 *   3. 如果落到明文 http 直链 / 第三方报错 / 直链无法加载，界面必须给出明确提示而不是静默失败。
 * 实际结果写进 testInfo 注解并打成 LIVE_OUTCOME= 日志行，由 workflow 转成 job 注解，
 * 这样即使 CI 日志主机不在白名单里，也能通过 API 读到结论。
 *
 * 候选曲目取自 docs/xinghai-validation.md 的真实解析记录：
 *   - mg（咪咕）songmid=1135162566 / 320k：实测返回 **https** 直链，是唯一有机会在网页端真播的组合；
 *   - wy（网易）songmid=347230 / 320k：聚合后端实测返回明文 http 直链（会被 HTTPS 安全边界拒绝），
 *     降级到 GD 时可能拿到 https，因此作为第二个候选。
 * 按顺序尝试，第一个真正播起来的就作为结论；都没播起来时，逐个核对「必须有明确提示」。
 *
 * 与真实脚本相关的两个额外交互（夹具旅程里不会出现）：
 * - 初始化阶段脚本会立即联网（IP 查询、版本检查），每个新域名都会弹「仅本次允许」；
 * - 版本检查还可能弹「音源更新提示」，用例会选「稍后处理」（不会擅自打开作者链接）；
 * - 解析阶段可能再经过聚合后端 → GD 等多跳，同样逐个域名授权。
 * 因此这里不是点一次就完事，而是**每一次点击都要先清一遍授权弹窗**——
 * 模态遮罩会把解析对话框挡住，让 click 一直重试到超时（第一轮就是这么红的）。
 */

const SOURCE_URL = 'https://zrcdy.dpdns.org/lx/xinghai-music-sourcev2.3.15.js'
const SOURCE_SHA256 = '807d6157e4fd7cdd05b8727efd73778b54a3b05a0b5e4c6bb28dedc0668e94e9'

const CANDIDATES = [
  { platform: 'mg', platformIds: '{"songmid":"1135162566"}', quality: '320k', why: 'mg 实测返回 https 直链' },
  { platform: 'wy', platformIds: '{"songmid":"347230"}', quality: '320k', why: 'wy 后端多为明文 http，GD 降级可能给 https' }
]

const FAILURE_HINT = /失败|不安全|拒绝|不支持|http|错误|超时|无法|未能/

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } })

test('@live 榜单曲目用真实星海音源在线解析（第三方依赖，非阻断）', async ({ page }, testInfo) => {
  test.slow()

  // 结论必须**无论如何**都能打印出来（包括用例中途失败）：
  // CI 日志主机不在出网白名单里，workflow 会把这行转成 job 注解，靠 API 读取。
  let outcome = 'INCOMPLETE 用例在得出结论前就结束了（见 CI 日志）'
  try {
    outcome = await runLiveJourney(page, testInfo)
  } catch (error) {
    outcome = `ERROR ${String(error && error.message ? error.message : error).split('\n')[0].slice(0, 300)}`
    throw error
  } finally {
    testInfo.annotations.push({ type: 'live-outcome', description: outcome })
    console.log(`LIVE_OUTCOME=${outcome.replace(/\n/g, ' ')}`)
  }
})

async function runLiveJourney(page, testInfo) {
  // 1. 下载真实脚本并核对指纹（Node 侧请求，CI runner 有公网出口）
  const response = await page.request.get(SOURCE_URL, { timeout: 30_000 })
  expect(response.status(), '音源脚本地址应可访问').toBe(200)
  const script = await response.text()
  const sha256 = createHash('sha256').update(script, 'utf8').digest('hex')
  expect(sha256, '音源脚本应与已验证版本逐字节一致').toBe(SOURCE_SHA256)
  testInfo.annotations.push({ type: 'live-source', description: `脚本 ${script.length} 字节 sha256=${sha256.slice(0, 12)}…` })
  console.log(`LIVE_STEP 脚本已核对 ${script.length} 字节 sha256=${sha256.slice(0, 12)}…`)

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

  const results = []
  for (const candidate of CANDIDATES) {
    const result = await attemptCandidate(page, candidate)
    console.log(`LIVE_STEP ${candidate.platform}/${candidate.quality} → ${compactText(result.summary, 240)}`)
    testInfo.annotations.push({ type: `live-${candidate.platform}`, description: result.summary })
    results.push({ candidate, ...result })
    if (result.played) break
  }

  // 汇总：只要有一个候选真的播起来就算 PLAYED；否则每个候选都必须给出明确提示。
  const played = results.find((item) => item.played)
  if (played) {
    return `PLAYED ${played.candidate.platform}/${played.candidate.quality} https 直链已解码播放，` +
      `进度 ${played.position.toFixed(2)}s，主机 ${hostOf(played.src)}（${results.length} 个候选中第 ${results.indexOf(played) + 1} 个成功）`
  }

  const details = results.map((item) => {
    const label = `${item.candidate.platform}/${item.candidate.quality}`
    if (item.src) return `${label} 直链已到播放器但没播起来（${compactText(item.playError || '进度未前进', 120)}，主机 ${hostOf(item.src)}）`
    return `${label} 未落地（${compactText(item.notices || '无提示', 180)}）`
  })
  // 没播起来的每个候选，界面都必须有明确提示，不允许静默失败
  for (const item of results) {
    expect(item.notices + (item.playError || ''), `${item.candidate.platform} 没播起来时必须给出明确提示`).toMatch(FAILURE_HINT)
  }
  return `BLOCKED 所有候选都没播起来：${details.join('；')}`
}

async function attemptCandidate(page, candidate) {
  // 2. 榜单页 → 使用自定义源播放
  await page.goto('/charts')
  const firstRow = page.locator('.el-table__row').first()
  await expect(firstRow).toBeVisible()
  const sourceButton = firstRow.locator('[data-testid^="custom-source-play-"]')
  const title = String(await sourceButton.getAttribute('aria-label') || '')
    .replace(/^使用自定义源播放《/, '').replace(/》$/, '')
  expect(title).not.toBe('')
  await sourceButton.click()

  const dialog = page.getByRole('dialog', { name: `自定义源解析 · ${title}` })
  await expect(dialog.locator('.source-playback-source .el-select')).toContainText('星海音乐源')
  await dialog.getByRole('textbox', { name: '平台专属曲目字段 JSON' }).fill(candidate.platformIds)

  // 3. 初始化（真实脚本这一步就会联网，逐个域名授权）
  const approvals = await initializeSource(page, dialog)

  // 4. 显式选平台（脚本声明多个平台，默认选第一个，不是我们要的那个）
  const platformSelect = dialog.locator('.source-playback-fields .el-select').nth(0)
  const currentPlatform = (await platformSelect.innerText()).trim()
  // 星海默认首项为 wy。若当前值已是本候选平台，就保留该值；Element Plus 对已选中的
  // option 会在某些版本/焦点状态下关闭 popper，Playwright 再点它会等到超时。
  const platform = currentPlatform.includes(`(${candidate.platform})`)
    ? { picked: currentPlatform, labels: [], alreadySelected: true }
    : await pickFromSelect(page, dialog, 0, (labels) => labels.find((label) => label.includes(`(${candidate.platform})`)))
  const quality = await pickFromSelect(page, dialog, 1, (labels) => (labels.includes(candidate.quality) ? candidate.quality : labels[0]))
  console.log(`LIVE_STEP 平台=${platform.picked} 可选=${platform.labels.join('/') || '已是目标值'}｜音质=${quality.picked} 可选=${quality.labels.join('/')}`)
  expect(platform.picked, `音源应声明 ${candidate.platform} 平台`).toContain(`(${candidate.platform})`)

  // 5. 解析（可能多跳：聚合后端 → GD，逐域名授权）
  const audio = page.locator('.player-bar audio').first()
  const resolution = await resolveAndCollect(page, dialog, audio, 90_000)

  let played = false
  let position = 0
  let playError = ''
  if (resolution.src.startsWith('https://')) {
    const playback = await waitForPlayback(audio, 25_000)
    played = playback.played
    position = playback.position || 0
    playError = playback.error || ''
  }

  const summary = played
    ? `PLAYED 进度 ${position.toFixed(2)}s，主机 ${hostOf(resolution.src)}`
    : `未播放（地址=${resolution.src ? hostOf(resolution.src) : '空'}，授权 ${approvals} 次，${compactText(playError || resolution.notices, 220)}）`
  return {
    src: resolution.src,
    notices: resolution.notices,
    played,
    position,
    playError,
    summary
  }
}

/** 点「信任并初始化」→「我信任并继续」，再把初始化期间冒出来的域名授权逐个点掉。 */
async function initializeSource(page, dialog) {
  await clickWithApprovals(page, dialog.getByRole('button', { name: '信任并初始化自定义音源' }), '信任并初始化')
  await clickWithApprovals(page, page.getByRole('button', { name: '我信任并继续' }), '确认隔离初始化')
  const platformSelect = dialog.getByLabel('选择自定义音源平台')
  const deadline = Date.now() + 60_000
  let approvals = 0
  while (Date.now() < deadline) {
    approvals += await drainApprovals(page)
    if (await platformSelect.isVisible().catch(() => false)) return approvals
    const error = await dialog.locator('.source-playback-error').innerText().catch(() => '')
    if (error.trim()) throw new Error(`初始化失败：${error.trim().slice(0, 200)}`)
    await page.waitForTimeout(300)
  }
  throw new Error('初始化超时：60 秒内既没出现平台选择，也没有明确错误')
}

/** 打开第 index 个下拉框，读出候选，按 picker 选一个（选不到就用第一个）。 */
async function pickFromSelect(page, dialog, index, picker) {
  const selectLabel = index === 0 ? '音源平台下拉框' : '音质下拉框'
  const select = dialog.locator('.source-playback-fields .el-select').nth(index)
  console.log(`LIVE_ACTION 开始：点击${selectLabel}`)
  await clickWithApprovals(page, select, selectLabel)
  const options = page.locator('.el-select-dropdown__item:visible')
  const opened = Date.now() + 15_000
  while (Date.now() < opened) {
    if (await options.first().isVisible().catch(() => false)) break
    await drainApprovals(page)
    await page.waitForTimeout(200)
  }
  const labels = (await options.allInnerTexts()).map((text) => text.trim()).filter(Boolean)
  if (!labels.length) throw new Error(`第 ${index + 1} 个下拉框没有任何可选项`)
  const picked = picker(labels) || labels[0]
  console.log(`LIVE_ACTION 下拉项：${labels.join(' / ')}，准备选择「${picked}」`)
  await clickWithApprovals(page, page.getByRole('option', { name: picked, exact: true }).first(), `下拉选项 ${picked}`)
  await page.waitForTimeout(200)
  return { picked, labels }
}

/** 点「隔离解析并播放」，边等结果边处理授权弹窗，直到拿到媒体地址或出现明确失败提示。 */
async function resolveAndCollect(page, dialog, audio, timeoutMs) {
  console.log('LIVE_ACTION 开始：按所选平台发起真实 musicUrl 解析')
  await clickWithApprovals(page, dialog.getByRole('button', { name: '隔离解析并播放歌曲' }), '隔离解析并播放')
  const notices = new Set()
  const deadline = Date.now() + timeoutMs
  let src = ''
  while (Date.now() < deadline) {
    await drainApprovals(page)
    await clickVisible(page, '允许并播放')
    const error = await dialog.locator('.source-playback-error').innerText().catch(() => '')
    if (error.trim()) notices.add(error.trim())
    for (const text of await page.locator('.el-message').allInnerTexts().catch(() => [])) {
      if (String(text).trim()) notices.add(String(text).trim())
    }
    src = (await audio.getAttribute('src').catch(() => '')) || ''
    if (src) break
    if (error.trim()) {
      // 已经给出明确失败：再等一下确认没有后发的地址，然后收尾
      await page.waitForTimeout(1_000)
      src = (await audio.getAttribute('src').catch(() => '')) || ''
      break
    }
    await page.waitForTimeout(400)
  }
  return { src, notices: [...notices].join(' | ') }
}

/** 真实直链落地后，无头 Chromium 也会真解码：等进度前进；出错就把错误带回去。 */
async function waitForPlayback(audio, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = await audio.evaluate((element) => ({
      time: element.currentTime,
      error: element.error ? `media error ${element.error.code}:${element.error.message}` : ''
    })).catch(() => null)
    if (state) {
      if (state.error) return { played: false, error: state.error }
      if (state.time > 0) return { played: true, position: state.time }
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  return { played: false, error: `${timeoutMs}ms 内进度没有前进` }
}

/** 出现就点掉一个按钮（用于不影响判定、只影响进度的确认框）。 */
async function clickVisible(page, name) {
  const button = page.getByRole('button', { name }).first()
  if (!(await button.isVisible().catch(() => false))) return false
  try {
    await button.click({ timeout: 1_500 })
    return true
  } catch {
    return false
  }
}

/**
 * 真实脚本在**整个旅程期间**都会断断续续联网（IP 查询、版本检查、后端多跳），
 * 每次新域名都弹「仅本次允许」，模态遮罩会把对话框挡住、让点击一直重试到超时。
 * 所以每次点击都先清一遍授权弹窗，被挡住就再来一轮。
 */
async function drainApprovals(page) {
  let handled = 0
  for (let round = 0; round < 8; round += 1) {
    // 优先关闭版本提醒：若它压在授权窗之上，先点底下的「仅本次允许」会一直被遮罩拦截。
    if (await clickVisible(page, '稍后处理')) {
      handled += 1
      console.log('LIVE_ACTION 已选择「稍后处理」关闭星海版本更新提醒（未打开任何外部地址）')
      await page.waitForTimeout(200)
      continue
    }
    if (await clickVisible(page, '仅本次允许')) {
      handled += 1
      console.log('LIVE_ACTION 已批准星海音源本次单域名请求')
      await page.waitForTimeout(200)
      continue
    }
    break
  }
  return handled
}

async function clickWithApprovals(page, locator, label = '', timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let lastError = ''
  let attempts = 0
  while (Date.now() < deadline) {
    await drainApprovals(page)
    attempts += 1
    try {
      await locator.click({ timeout: 2_000 })
      console.log(`LIVE_ACTION 点击成功：${label || '未命名动作'}（尝试 ${attempts} 次）`)
      return
    } catch (error) {
      lastError = String(error && error.message ? error.message : error).split('\n')[0]
      if (!/intercepts pointer events|not stable|not visible|not enabled|element is not|timeout/i.test(lastError)) throw error
      await page.waitForTimeout(300)
    }
  }
  const blocker = await summarizeBlockers(page)
  throw new Error(`点击「${label || '未命名动作'}」失败（${timeoutMs}ms，${attempts} 次）：${lastError.slice(0, 180)}；当前 UI：${blocker}`)
}

async function summarizeBlockers(page) {
  const dialogs = await page.locator('.el-message-box:visible').allInnerTexts().catch(() => [])
  const sourceDialogs = await page.locator('.el-dialog:visible').allInnerTexts().catch(() => [])
  const buttons = await page.locator('button:visible').allInnerTexts().catch(() => [])
  return [
    `messageBox=${JSON.stringify(dialogs.map((text) => text.trim().slice(0, 100)))}`,
    `dialogs=${JSON.stringify(sourceDialogs.map((text) => text.trim().slice(0, 100)))}`,
    `buttons=${JSON.stringify(buttons.map((text) => text.trim()).filter(Boolean).slice(-12))}`
  ].join(' ')
}

function compactText(value, maxLength = 240) {
  return String(value || '').replace(/\\s+/g, ' ').trim().slice(0, maxLength)
}

function hostOf(value) {
  try {
    return new URL(value).host
  } catch {
    return value ? String(value).slice(0, 40) : '空'
  }
}
