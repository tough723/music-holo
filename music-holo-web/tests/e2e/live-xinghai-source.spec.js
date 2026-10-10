import { createHash } from 'node:crypto'
import { test, expect } from '@playwright/test'

/**
 * 真实平台搜索 → 真实星海音源 → 真实媒体解码的在线旅程（@live）。
 *
 * Music Holo 的 /charts 是本站 Mock/业务曲库榜单，不是第三方实时榜；本旅程不再从该页借用
 * 一首无关的演示歌名。它打开设置中的隔离试听台，使用 Music Holo 的网易平台适配器实时搜索，
 * 只接受搜索响应中歌名、歌手、ID 都匹配的同一条曲目，再将该响应填入并交给真实星海脚本解析。
 * 已验证的网易 ID 只用于匹配真实搜索响应，不会被直接手工填入；结果来自响应后再断言三项一致。
 *
 * 脚本 SHA-256 固定，第三方服务依赖因此单独放入非阻断 CI job。解析若返回 HTTPS 地址，
 * Chromium 必须真正解码并推进 currentTime；否则必须记录界面明确给出的失败/安全提示。
 * 网页端 HTTPS-only、匿名 CORS、逐域名授权均保持原样。
 */

const SOURCE_URL = 'https://zrcdy.dpdns.org/lx/xinghai-music-sourcev2.3.15.js'
const SOURCE_SHA256 = '807d6157e4fd7cdd05b8727efd73778b54a3b05a0b5e4c6bb28dedc0668e94e9'
const LIVE_TRACK = {
  platform: 'wy',
  query: '海阔天空',
  name: '海阔天空',
  singerPattern: /beyond/i,
  id: '347230',
  quality: '320k'
}

const FAILURE_HINT = /失败|不安全|拒绝|不支持|http|错误|超时|无法|未能|error|aborted|blocked|denied/i

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } })

test('@live 网易实时搜索曲目用真实星海音源解析并播放（第三方依赖，非阻断）', async ({ page }, testInfo) => {
  test.slow()
  test.setTimeout(8 * 60_000)

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
  // 1. 下载真实脚本并核对指纹（Node 侧请求，CI runner 有公网出口）。
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

  // 使用登录页公开列出的普通用户演示账号，避免在 E2E 源码里重复存储密码。
  await page.goto('/login')
  const publicDemoAccount = await page.locator('.auth-tip').innerText()
  const demoAccountText = publicDemoAccount.slice(publicDemoAccount.lastIndexOf('或') + 1).split('（')[0]
  const [username, password] = demoAccountText.split('/').map((value) => value.trim())
  expect(username, '登录页应公开提供普通用户演示账号').toBeTruthy()
  expect(password, '演示账号密码应由登录页展示，而非写入 E2E 源码').toBeTruthy()
  await page.getByPlaceholder('用户名').fill(username)
  await page.getByPlaceholder('密码').fill(password)
  await page.getByRole('button', { name: /登\s*录/ }).click()
  await expect(page).toHaveURL(/\/home$/)
  await page.evaluate((saved) => {
    const account = JSON.parse(localStorage.getItem('mh_user') || 'null')
    if (!account?.id) throw new Error('演示账号登录后没有可用的本机源库归属 ID')
    localStorage.setItem(`mh_custom_sources_v1:${account.id}`, JSON.stringify([saved]))
  }, source)
  await page.locator('.sidebar .app-nav-menu').getByRole('menuitem', { name: '设置', exact: true }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await page.getByRole('tab', { name: '自定义源' }).click()

  const sourceCard = page.locator(`[data-source-id="${source.id}"]`)
  await expect(sourceCard).toBeVisible()
  const compatibilityApprovals = await initializeSourceManager(page, sourceCard, source.name)
  const result = await attemptCandidate(page, sourceCard, source, LIVE_TRACK, compatibilityApprovals)

  const trackSummary = `平台搜索结果《${result.track.name}》/ ${result.track.singer} / ${result.track.id}`
  testInfo.annotations.push({ type: 'live-track', description: `${trackSummary}（${result.track.platform}，来自同一条实时搜索响应）` })
  console.log(`LIVE_STEP ${trackSummary}（来自网易平台实时搜索响应）`)
  console.log(`LIVE_STEP wy/${LIVE_TRACK.quality} → ${compactText(result.summary, 240)}`)
  testInfo.annotations.push({ type: 'live-wy', description: result.summary })

  if (result.played) {
    return `PLAYED ${result.track.platform}/${LIVE_TRACK.quality} 《${result.track.name}》/${result.track.singer} ` +
      `(平台 ID ${result.track.id}，同一条实时搜索结果)；https 直链已解码，进度 ` +
      `${result.position.toFixed(2)}s，paused=${result.paused}，readyState=${result.readyState}，` +
      `媒体主机 ${hostOf(result.src)}`
  }

  // 解析未能起播时必须给出安全/网络/媒体错误，不接受静默失败。
  expect(result.notices + (result.playError || ''), '真实搜索曲目没播起来时必须有明确提示').toMatch(FAILURE_HINT)
  return `BLOCKED ${trackSummary} 已从实时搜索选中，但没有完成 HTTPS 媒体播放：` +
    `${compactText(result.playError || result.notices, 220)}（媒体主机 ${hostOf(result.src)}）`
}

async function initializeSourceManager(page, sourceCard, sourceName) {
  await clickWithApprovals(
    page,
    sourceCard.getByRole('button', { name: `隔离兼容检测 ${sourceName}` }),
    '隔离兼容检测'
  )
  await clickWithApprovals(page, page.getByRole('button', { name: '我信任并检测' }), '确认隔离兼容检测')

  const auditionButton = sourceCard.getByRole('button', { name: `打开试听台 ${sourceName}` })
  const failure = sourceCard.locator('.source-runtime-result.is-error')
  const deadline = Date.now() + 90_000
  let approvals = 0
  while (Date.now() < deadline) {
    approvals += await drainApprovals(page)
    if (await auditionButton.isVisible().catch(() => false)) return approvals
    const message = await failure.innerText().catch(() => '')
    if (message.trim()) throw new Error(`真实音源隔离初始化失败：${compactText(message, 220)}`)
    await page.waitForTimeout(300)
  }
  throw new Error('真实音源隔离初始化超时：未出现可用的「打开试听台」入口')
}

async function attemptCandidate(page, sourceCard, source, candidate, initialApprovals) {
  await clickWithApprovals(
    page,
    sourceCard.getByRole('button', { name: `打开试听台 ${source.name}` }),
    '打开真实音源试听台'
  )
  const dialog = page.getByRole('dialog', { name: `隔离试听台 · ${source.name}` })
  await expect(dialog).toBeVisible()

  const platform = await pickFromSelect(
    page,
    dialog,
    0,
    (labels) => labels.find((label) => label.includes(`(${candidate.platform})`)),
    '.source-audition-fields'
  )
  expect(platform.picked, `音源应声明 ${candidate.platform} 平台`).toContain(`(${candidate.platform})`)
  const quality = await pickFromSelect(
    page,
    dialog,
    1,
    (labels) => labels.find((label) => label === candidate.quality),
    '.source-audition-fields'
  )
  expect(quality.picked, '应明确选择测试所需音质').toBe(candidate.quality)

  const search = dialog.locator('.source-audition-search').first()
  await search.locator('input').fill(candidate.query)
  await clickWithApprovals(page, search.getByRole('button', { name: '搜索平台' }), '搜索真实平台曲目')
  const track = await selectVerifiedSearchResult(page, dialog, candidate)
  const musicInfoInput = dialog.locator('.source-audition-info textarea')
  expect(JSON.parse(await musicInfoInput.inputValue()), '送入星海脚本前，表单 JSON 必须与同一条搜索结果完全一致')
    .toEqual(track.musicInfo)

  const resolution = await resolveAuditionAndCollect(page, dialog, initialApprovals)
  expect(JSON.parse(await musicInfoInput.inputValue()), '解析完成后确认提交的 musicInfo 未被替换')
    .toEqual(track.musicInfo)
  let played = false
  let position = 0
  let paused = null
  let readyState = 0
  let playError = ''
  let src = ''

  if (resolution.ready) {
    const ready = dialog.locator('.source-audition-ready')
    await expect(ready).toContainText(track.name)
    await expect(ready).toContainText(track.singer)
    await clickWithApprovals(
      page,
      ready.getByRole('button', { name: '交给全局播放器试听' }),
      '将真实平台搜索曲目交给全局播放器'
    )

    const title = page.locator('.player-bar .pb-title')
    const artist = page.locator('.player-bar .pb-artist')
    await expect(title).toHaveText(track.name)
    await expect(artist).toHaveText(track.singer)
    const audio = page.locator('.player-bar audio').first()
    await expect(audio).toHaveAttribute('src', /^https:\/\//)
    await expect(audio).toHaveAttribute('crossorigin', 'anonymous')
    await expect(audio).toHaveAttribute('referrerpolicy', 'no-referrer')
    src = (await audio.getAttribute('src')) || ''
    const playback = await waitForPlayback(audio, 25_000)
    played = playback.played
    position = playback.position || 0
    paused = playback.paused ?? null
    readyState = playback.readyState || 0
    playError = playback.error || ''
  } else {
    playError = resolution.playError
  }

  const summary = played
    ? `PLAYED 《${track.name}》/${track.singer} id=${track.id}，进度 ${position.toFixed(2)}s，` +
      `paused=${paused}，readyState=${readyState}，媒体主机 ${hostOf(src)}`
    : `未播放（曲目=${track.name}/${track.singer} id=${track.id}，媒体地址主机=${hostOf(src)}，` +
      `${compactText(playError || resolution.notices, 220)}）`
  return { track, src, notices: resolution.notices, played, position, paused, readyState, playError, summary }
}

async function selectVerifiedSearchResult(page, dialog, candidate) {
  const buttons = dialog.locator('[aria-label="平台曲目结果"] button')
  const note = dialog.locator('.source-audition-note')
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    await drainApprovals(page)
    if (await buttons.count().catch(() => 0)) break
    const message = await note.innerText().catch(() => '')
    if (message && !message.startsWith('搜索或加载榜单后')) {
      throw new Error(`网易真实平台搜索失败：${compactText(message, 220)}`)
    }
    await page.waitForTimeout(300)
  }
  const count = await buttons.count()
  if (!count) throw new Error('60 秒内网易平台搜索没有返回曲目结果')

  const labels = await buttons.allInnerTexts()
  const matchingIndexes = labels
    .map((label, index) => ({ label: String(label).replace(/\s+/g, ' ').trim(), index }))
    .filter(({ label }) => label.includes(candidate.name) && candidate.singerPattern.test(label))
  if (!matchingIndexes.length) {
    throw new Error(`实时搜索未返回预期歌名/歌手「${candidate.name} / Beyond」；实际结果：${compactText(labels.join(' | '), 260)}`)
  }

  const musicInfoInput = dialog.locator('.source-audition-info textarea')
  const rejected = []
  for (const result of matchingIndexes) {
    await clickWithApprovals(page, buttons.nth(result.index), `选择搜索结果 ${result.label}`)
    let musicInfo
    try {
      musicInfo = JSON.parse(await musicInfoInput.inputValue())
    } catch {
      throw new Error('所选真实搜索结果没有生成有效的 musicInfo JSON')
    }
    const id = String(musicInfo.id ?? musicInfo.songmid ?? musicInfo.hash ?? '')
    const name = String(musicInfo.name ?? musicInfo.title ?? '').trim()
    const singer = String(musicInfo.singer ?? musicInfo.singerName ?? musicInfo.artist ?? '').trim()
    console.log(`LIVE_STEP 已从实际搜索结果读取曲目 name=${name} singer=${singer} id=${id}`)
    if (id === candidate.id && name === candidate.name && candidate.singerPattern.test(singer)) {
      return { platform: candidate.platform, id, name, singer, musicInfo }
    }
    rejected.push(`${name}/${singer} id=${id}`)
  }
  throw new Error(`搜索结果里没有与已验证媒体 ID ${candidate.id} 同时匹配的曲目；匹配歌名/歌手的实际条目：${rejected.join(' | ')}`)
}

async function pickFromSelect(page, dialog, index, picker, fieldsSelector) {
  const selectLabel = index === 0 ? '音源平台下拉框' : '音质下拉框'
  const select = dialog.locator(`${fieldsSelector} .el-select`).nth(index)
  await closeSelectDropdown(page, dialog)

  let labels = []
  let picked = ''
  for (let attempt = 0; attempt < 2 && !picked; attempt += 1) {
    console.log(`LIVE_ACTION 开始：点击${selectLabel}（尝试 ${attempt + 1} 次）`)
    await clickWithApprovals(page, select, selectLabel)
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      await drainApprovals(page)
      const dropdowns = page.locator('.el-select-dropdown:visible')
      if (await dropdowns.count()) {
        const options = dropdowns.last().locator('.el-select-dropdown__item:visible')
        labels = (await options.allInnerTexts()).map((text) => text.trim()).filter(Boolean)
        if (labels.length) {
          picked = picker(labels) || ''
          break
        }
      }
      await page.waitForTimeout(200)
    }
    if (!picked) await closeSelectDropdown(page, dialog)
  }
  if (!labels.length) throw new Error(`第 ${index + 1} 个下拉框没有任何可选项`)
  if (!picked) throw new Error(`${selectLabel}没有目标选项：${labels.join(' / ')}`)

  const dropdowns = page.locator('.el-select-dropdown:visible')
  const selectedOption = dropdowns.last().locator('.el-select-dropdown__item.is-selected:visible').first()
  const selectedLabel = (await selectedOption.innerText().catch(() => '')).trim()
  if (selectedLabel === picked) {
    await closeSelectDropdown(page, dialog)
    console.log(`LIVE_ACTION 「${picked}」已经选中，不重复点击`)
    return { picked, labels, alreadySelected: true }
  }
  console.log(`LIVE_ACTION 下拉项：${labels.join(' / ')}，准备选择「${picked}」`)
  await clickWithApprovals(page, page.getByRole('option', { name: picked, exact: true }).first(), `下拉选项 ${picked}`)
  await expect(select).toContainText(picked)
  await closeSelectDropdown(page, dialog)
  return { picked, labels, alreadySelected: false }
}

async function closeSelectDropdown(page, dialog) {
  const dropdowns = page.locator('.el-select-dropdown:visible')
  if (!(await dropdowns.count())) return
  await page.keyboard.press('Escape').catch(() => {})
  if (await dropdowns.count()) {
    await clickWithApprovals(
      page,
      dialog.locator('.source-audition > .el-alert'),
      '关闭已打开的平台下拉框',
      3_000
    )
  }
  await expect(dropdowns).toHaveCount(0, { timeout: 3_000 })
}

async function resolveAuditionAndCollect(page, dialog, initialApprovals, timeoutMs = 90_000) {
  console.log('LIVE_ACTION 开始：用同一条网易实时搜索结果调用星海 musicUrl')
  await clickWithApprovals(page, dialog.getByRole('button', { name: '解析音频' }), '解析真实平台曲目')
  await clickWithApprovals(page, page.getByRole('button', { name: '我信任并解析' }), '确认执行真实音源')

  const ready = dialog.locator('.source-audition-ready')
  const resolveButton = dialog.getByRole('button', { name: '解析音频' })
  const notices = new Set()
  const deadline = Date.now() + timeoutMs
  let approvals = initialApprovals
  while (Date.now() < deadline) {
    approvals += await drainApprovals(page)
    if (await clickVisible(page, '允许加载音频')) approvals += 1
    if (await ready.isVisible().catch(() => false)) {
      const summary = await ready.innerText().catch(() => '')
      return { ready: true, notices: [...notices].join(' | '), approvals, summary, playError: '' }
    }
    for (const text of await page.locator('.el-message').allInnerTexts().catch(() => [])) {
      const cleaned = String(text).trim()
      if (cleaned && FAILURE_HINT.test(cleaned)) notices.add(cleaned)
    }
    const isLoading = await resolveButton.evaluate((button) => button.classList.contains('is-loading')).catch(() => false)
    if (notices.size && !isLoading) {
      await page.waitForTimeout(800)
      if (!(await ready.isVisible().catch(() => false))) break
    }
    await page.waitForTimeout(350)
  }
  const message = [...notices].join(' | ') || `解析试听在 ${timeoutMs}ms 内未生成可播放音频`
  return { ready: false, notices: message, approvals, summary: '', playError: message }
}

/** 真实直链落地后，无头 Chromium 也会真解码：等进度前进；出错就把错误带回去。 */
async function waitForPlayback(audio, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastState = null
  while (Date.now() < deadline) {
    const state = await audio.evaluate((element) => ({
      time: element.currentTime,
      paused: element.paused,
      readyState: element.readyState,
      error: element.error ? `media error ${element.error.code}:${element.error.message}` : ''
    })).catch(() => null)
    if (state) {
      lastState = state
      if (state.error) return { played: false, error: state.error }
      if (state.time > 0 && !state.paused) {
        return { played: true, position: state.time, paused: state.paused, readyState: state.readyState }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  return {
    played: false,
    error: `${timeoutMs}ms 内未能保持播放（currentTime=${lastState?.time ?? 0}, paused=${lastState?.paused ?? 'unknown'}, readyState=${lastState?.readyState ?? 0}）`
  }
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
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function hostOf(value) {
  try {
    return new URL(value).host
  } catch {
    return value ? String(value).slice(0, 40) : '空'
  }
}
