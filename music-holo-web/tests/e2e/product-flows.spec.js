import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'

async function loginFromCurrentPage(page, username) {
  await page.getByPlaceholder('用户名').fill(username)
  await page.getByPlaceholder('密码').fill('123456')
  await page.getByRole('button', { name: /登\s*录/ }).click()
  await expect(page).toHaveURL(/\/home$/)
}

async function loginAs(page, username) {
  await page.goto('/login')
  await loginFromCurrentPage(page, username)
}

async function openMenu(page, label) {
  await page.locator('.sidebar .app-nav-menu').getByRole('menuitem', { name: label }).click()
}

test('游客可以搜索歌曲并从结果启动播放', async ({ page }) => {
  await page.goto('/search?q=霓虹海')

  await expect(page.locator('.results-heading')).toContainText('霓虹海')
  const songRow = page.locator('.el-table__row').filter({ hasText: '霓虹海' }).first()
  await expect(songRow).toBeVisible()
  await songRow.getByRole('button', { name: '播放《霓虹海》' }).click()

  await expect(page.locator('.player-bar .pb-title')).toHaveText('霓虹海')
  await expect(page.locator('.player-bar audio').first()).toHaveAttribute('src', /\/audio\/song1\.wav$/)
})

test('同源歌曲播放时可切换 3D 空间音效并恢复原声', async ({ page }) => {
  await page.goto('/search?q=霓虹海')
  const songRow = page.locator('.el-table__row').filter({ hasText: '霓虹海' }).first()
  await expect(songRow).toBeVisible()
  await songRow.getByRole('button', { name: '播放《霓虹海》' }).click()
  await expect(page.locator('.player-bar .pb-title')).toHaveText('霓虹海')

  const enableButton = page.getByRole('button', { name: '开启 3D 空间音效' })
  await enableButton.click()
  const disableButton = page.getByRole('button', { name: '关闭 3D 空间音效' })
  await expect(disableButton).toHaveAttribute('aria-pressed', 'true')
  await disableButton.click()
  await expect(enableButton).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.player-bar .pb-title')).toHaveText('霓虹海')
})

test('播放器同步曲目到系统媒体会话并响应播放暂停操作', async ({ page }) => {
  await page.addInitScript(() => {
    const session = {
      metadata: null,
      playbackState: 'none',
      handlers: {},
      position: null,
      setActionHandler(action, handler) { this.handlers[action] = handler },
      setPositionState(state) { this.position = state }
    }
    Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: session })
    Object.defineProperty(window, 'MediaMetadata', {
      configurable: true,
      value: class MediaMetadataMock { constructor(data) { Object.assign(this, data) } }
    })
    window.__musicHoloMediaSession = session
  })

  await page.goto('/search?q=霓虹海')
  const songRow = page.locator('.el-table__row').filter({ hasText: '霓虹海' }).first()
  await expect(songRow).toBeVisible()
  await songRow.getByRole('button', { name: '播放《霓虹海》' }).click()

  await expect.poll(() => page.evaluate(() => window.__musicHoloMediaSession.metadata?.title)).toBe('霓虹海')
  await expect.poll(() => page.evaluate(() => window.__musicHoloMediaSession.playbackState)).toBe('playing')
  const actions = await page.evaluate(() => Object.keys(window.__musicHoloMediaSession.handlers))
  expect(actions).toEqual(expect.arrayContaining(['play', 'pause', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'seekto']))

  await page.evaluate(() => window.__musicHoloMediaSession.handlers.pause())
  await expect.poll(() => page.evaluate(() => window.__musicHoloMediaSession.playbackState)).toBe('paused')
  await page.evaluate(() => window.__musicHoloMediaSession.handlers.play())
  await expect.poll(() => page.evaluate(() => window.__musicHoloMediaSession.playbackState)).toBe('playing')
})

test('导航按功能分组、折叠偏好可保存，窄屏抽屉可切页', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/playlists/1')
  await expect(page.locator('.sidebar .el-menu-item-group__title').filter({ hasText: '曲库' })).toBeVisible()
  await expect(page.locator('.sidebar .el-menu-item.is-active')).toContainText('歌单')

  await page.getByRole('button', { name: '收起侧栏' }).click()
  await expect(page.getByRole('button', { name: '展开侧栏' })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('.sidebar')).toHaveCSS('width', '64px')
  await expect(page.locator('.sidebar .el-menu-item-group__title').filter({ hasText: '曲库' })).toBeHidden()
  await page.reload()
  await expect(page.getByRole('button', { name: '展开侧栏' })).toBeVisible()
  await page.getByRole('button', { name: '展开侧栏' }).click()
  await expect(page.getByRole('button', { name: '收起侧栏' })).toBeVisible()

  await page.setViewportSize({ width: 820, height: 900 })
  await expect(page.locator('.sidebar')).toHaveCSS('width', '64px')
  await expect(page.getByRole('button', { name: '收起侧栏' })).toBeHidden()
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(page.locator('.sidebar')).toHaveCSS('width', '220px')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/home')
  await expect(page.locator('.sidebar')).toBeHidden()
  await page.locator('.user-chip').click()
  await expect(page.getByRole('menuitem', { name: '登录' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '注册' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '退出登录' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: '打开导航' }).click()
  await expect(page.getByRole('heading', { name: 'MUSIC HOLO 导航' })).toBeVisible()
  await page.getByRole('menuitem', { name: '每日推荐' }).click()
  await expect(page).toHaveURL(/\/daily$/)
  await expect(page.getByRole('heading', { name: 'MUSIC HOLO 导航' })).not.toBeVisible()
})

test('demo 用户可以收藏歌曲并查看个人播放历史', async ({ page }) => {
  await loginAs(page, 'demo')
  await openMenu(page, '全局搜索')
  await page.getByPlaceholder('试试歌名、歌手名，或记得的一句歌词…').fill('云端信使')
  await page.keyboard.press('Enter')

  const songRow = page.locator('.el-table__row').filter({ hasText: '云端信使' }).first()
  await expect(songRow).toBeVisible()
  await songRow.getByRole('button', { name: '收藏《云端信使》' }).click()
  await expect(page.getByText('收藏成功', { exact: true })).toBeVisible()
  await songRow.getByRole('button', { name: '播放《云端信使》' }).click()
  await expect(page.locator('.player-bar .pb-title')).toHaveText('云端信使')

  // Mock play first resolves lyrics, then records the listen; each request is capped at 199 ms.
  await page.waitForTimeout(700)
  await openMenu(page, '我的收藏')
  await expect(page.locator('.el-table__row').filter({ hasText: '云端信使' }).first()).toBeVisible()
  await openMenu(page, '最近播放')
  await expect(page.locator('.el-table__row').filter({ hasText: '云端信使' }).first()).toBeVisible()

  await openMenu(page, '首页')
  const continueSection = page.getByRole('region', { name: '继续收听' })
  const recentSong = continueSection.locator('.continue-card').filter({ hasText: '云端信使' })
  await expect(recentSong).toBeVisible()
  await recentSong.click()
  await expect(page.locator('.player-bar .pb-title')).toHaveText('云端信使')
})

test('设置页支持主题同步、个人资料保存与修改密码校验', async ({ page }) => {
  await loginAs(page, 'demo')
  await openMenu(page, '设置')
  await expect(page.locator('.settings-eyebrow')).toBeVisible()

  await page.getByRole('tab', { name: '全息主题' }).click()
  await page.getByRole('button', { name: /矩阵声场/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'lime')
  await page.getByRole('tab', { name: '个人资料' }).click()
  const nickname = page.getByPlaceholder('请输入昵称')
  await expect(nickname).toHaveValue('演示用户')
  await nickname.fill('全息体验者')
  await page.getByRole('button', { name: '保存资料' }).click()
  await expect(page.getByText('资料保存成功', { exact: true })).toBeVisible()
  await expect(nickname).toHaveValue('全息体验者')
  expect(await page.evaluate(() => localStorage.getItem('mh_settings_tab'))).toBe('profile')

  await page.getByRole('tab', { name: '修改密码' }).click()
  await page.getByPlaceholder('请输入原密码').fill('123456')
  await page.getByPlaceholder('6-32 位新密码').fill('newpass123')
  await page.getByPlaceholder('请再次输入新密码').fill('not-the-same')
  await page.getByRole('button', { name: '修改密码' }).click()
  await expect(page.getByText('两次输入的新密码不一致', { exact: true })).toBeVisible()
})

test('设置中心提供低闪烁动效、播放偏好与本机配置备份', async ({ page }) => {
  await loginAs(page, 'demo')
  await openMenu(page, '设置')

  await expect(page.getByRole('tab', { name: '通用设置' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('html')).toHaveAttribute('data-holo-motion', 'calm')
  const ambientOrbit = page.locator('.holo-environment .env-orbit').first()
  const projectorBeam = page.locator('.holo-cone').first()
  await expect.poll(() => ambientOrbit.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
  await expect.poll(() => projectorBeam.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')

  await page.getByRole('radio', { name: /影院动态/ }).check({ force: true })
  await expect(page.locator('html')).toHaveAttribute('data-holo-motion', 'cinematic')
  await expect.poll(() => projectorBeam.evaluate((element) => getComputedStyle(element).animationName)).toMatch(/^beamPulse/)
  await page.getByRole('radio', { name: /柔和全息/ }).check({ force: true })
  await page.getByRole('tab', { name: '播放偏好' }).click()
  await page.getByText('随机播放', { exact: true }).click()
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('mh_player'))).mode).toBe('random')

  await page.getByRole('tab', { name: '本机数据' }).click()
  await expect(page.getByText('备份范围刻意保持精简')).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出本机配置' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^music-holo-settings-.*\.json$/)
  await page.getByRole('button', { name: '前往自定义源管理' }).click()
  await expect(page.getByRole('tab', { name: '自定义源' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('脚本默认不会自动运行')).toBeVisible()
})

test('搜索与隐私设置可关闭探索词和历史记忆并限制本机记录数量', async ({ page }) => {
  const seededTerms = ['夜航星', '云端信使', '霓虹海', '回声', '夏夜', '远方']
  await page.addInitScript((terms) => {
    if (sessionStorage.getItem('search-history-test-seeded')) return
    sessionStorage.setItem('search-history-test-seeded', 'true')
    localStorage.setItem('music-holo-recent-searches', JSON.stringify(terms))
  }, seededTerms)
  await loginAs(page, 'demo')
  await openMenu(page, '设置')
  await page.getByRole('tab', { name: '搜索与隐私' }).click()

  await page.locator('.history-limit .el-select__wrapper').click()
  await page.getByRole('option', { name: '4 条' }).click()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('music-holo-recent-searches'))))
    .toEqual(seededTerms.slice(0, 4))

  await openMenu(page, '全局搜索')
  await expect(page.locator('.discovery')).toBeVisible()
  await expect(page.locator('.recent-searches .el-tag')).toHaveCount(4)
  await expect(page.locator('.recent-searches')).toContainText('仅此设备')

  await openMenu(page, '设置')
  await page.getByRole('tab', { name: '搜索与隐私' }).click()
  await page.locator('.search-setting-card .setting-row')
    .filter({ hasText: '显示探索关键词' })
    .locator('.el-switch__core')
    .click()
  await page.locator('.search-setting-card .setting-row')
    .filter({ hasText: '记住最近搜索' })
    .locator('.el-switch__core')
    .click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('music-holo-recent-searches'))).toBeNull()

  await page.goto('/search')
  await expect(page.locator('.discovery')).toHaveCount(0)
  await page.goto('/search?q=privacy-memory-disabled')
  await expect(page.locator('.results-heading')).toContainText('privacy-memory-disabled')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('music-holo-recent-searches'))).toBeNull()
})

test('本机自定义源支持导入、隔离检测、曲库填充、匿名 CORS 试听和导出', async ({ page }) => {
  await loginAs(page, 'demo')
  await openMenu(page, '设置')
  await page.getByRole('tab', { name: '自定义源' }).click()
  await expect(page.getByText('脚本默认不会自动运行')).toBeVisible()

  const pageErrors = []
  let bridgedRequestHeaders = null
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('https://api.example.org/ping', async (route) => {
    bridgedRequestHeaders = route.request().headers()
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: '{"ready":true}'
    })
  })
  const testAudio = await readFile(new URL('../../public/audio/song1.wav', import.meta.url))
  await page.route('https://media.example.org/track.wav', (route) => route.fulfill({
    status: 200,
    headers: { 'access-control-allow-origin': '*', 'content-type': 'audio/wav' },
    body: testAudio
  }))
  const scriptA = `/**
 * @name 源 A
 * @version 1.0
 * @author 音源维护者
 * @homepage https://example.org/source-a
 */
throw new Error("must not execute")`
  const scriptB = `/**
 * @name 源 B
 * @version 2.0
 */
const lx = globalThis.lx
  if (typeof fetch !== 'undefined' || typeof document !== 'undefined' || typeof localStorage !== 'undefined') {
  throw new Error('隔离环境暴露了不应访问的浏览器能力')
}
if (lx.utils.crypto.md5('abc') !== '900150983cd24fb0d6963f7d28e17f72') {
  throw new Error('隔离环境 MD5 工具校验失败')
}
lx.on(lx.EVENT_NAMES.request, async ({ action, info }) => {
  if (action === 'musicUrl') {
    if (!info?.musicInfo?.title) throw new Error('musicInfo 缺少标题')
    return { url: 'https://media.example.org/track.wav' }
  }
  if (action === 'lyric') return { lyric: '[00:00.00]隔离试听歌词' }
  throw new Error('未知试听动作')
})
lx.request('https://api.example.org/ping', { method: 'GET' }, (error, response) => {
  if (error) throw error
  if (response?.statusCode !== 200 || response?.body !== '{"ready":true}') throw new Error('隔离网络桥接失败')
  lx.send(lx.EVENT_NAMES.inited, { sources: {
    kw: { name: '酷我测试源', type: 'music', actions: ['musicUrl', 'lyric'], qualitys: ['128k', '320k'] }
  } })
})`
  const importInput = page.getByTestId('custom-source-file')
  await importInput.setInputFiles({ name: 'source-a.js', mimeType: 'text/javascript', buffer: Buffer.from(scriptA) })
  await expect(page.locator('.source-card h3')).toHaveText(['源 A'])
  await importInput.setInputFiles({ name: 'source-b.js', mimeType: 'text/javascript', buffer: Buffer.from(scriptB) })
  await expect(page.locator('.source-card h3')).toHaveText(['源 B', '源 A'])
  await expect(page.getByText('作者：音源维护者')).toBeVisible()
  await expect(page.getByRole('link', { name: '源主页 ↗' })).toHaveAttribute('href', 'https://example.org/source-a')
  const sourceSearch = page.getByLabel('筛选本机音源')
  await sourceSearch.fill('音源维护者')
  await expect(page.locator('.source-card h3')).toHaveText(['源 A'])
  await sourceSearch.fill('')
  await expect(page.locator('.source-card h3')).toHaveText(['源 B', '源 A'])
  await page.getByRole('button', { name: '上移 源 A' }).click()
  await expect(page.locator('.source-card h3')).toHaveText(['源 A', '源 B'])

  await page.getByRole('button', { name: '隔离兼容检测 源 B' }).click()
  await page.getByRole('button', { name: '我信任并检测' }).click()
  await expect(page.getByText('确认音源网络请求')).toBeVisible()
  await page.getByRole('button', { name: '仅本次允许' }).click()
  const compatibilityResult = page.locator('.source-card').filter({ hasText: '源 B' }).locator('.source-runtime-result')
  await expect(compatibilityResult).toContainText('初始化声明 1 个平台')
  await expect(compatibilityResult).toContainText('酷我测试源')
  expect(bridgedRequestHeaders).not.toHaveProperty('cookie')
  expect(bridgedRequestHeaders).not.toHaveProperty('authorization')

  await compatibilityResult.getByRole('button', { name: '打开试听台 源 B' }).click()
  const auditionDialog = page.getByRole('dialog', { name: '隔离试听台 · 源 B' })
  const musicInfoField = auditionDialog.getByRole('textbox', { name: 'musicInfo JSON' })
  await auditionDialog.getByLabel('试听曲库搜索').fill('霓虹海')
  await auditionDialog.getByRole('button', { name: '搜索曲库' }).click()
  await expect(auditionDialog.locator('.source-audition-results button').first()).toContainText('霓虹海')
  await auditionDialog.locator('.source-audition-results button').first().click()
  await expect(musicInfoField).toHaveValue(/"title": "霓虹海"/)
  await musicInfoField.fill(JSON.stringify({
    title: '隔离试听曲目',
    singerName: '测试歌手',
    songmid: 'provider-specific-id'
  }, null, 2))
  await auditionDialog.getByRole('button', { name: '解析音频' }).click()
  await page.getByRole('button', { name: '我信任并解析' }).click()
  await expect(page.getByText('确认音源网络请求')).toBeVisible()
  await page.getByRole('button', { name: '仅本次允许' }).click()
  await page.getByRole('button', { name: '允许加载音频' }).click()
  await expect(auditionDialog.getByText('音频地址已解析')).toBeVisible()
  await expect(auditionDialog.getByText('已解析 1 行歌词')).toBeVisible()
  await auditionDialog.getByRole('button', { name: '交给全局播放器试听' }).click()
  await expect(page.locator('.player-bar .pb-title')).toHaveText('隔离试听曲目')
  const customAudio = page.locator('.player-bar audio').first()
  await expect(customAudio).toHaveAttribute('crossorigin', 'anonymous')
  await expect(customAudio).toHaveAttribute('src', 'https://media.example.org/track.wav')
  await expect(page.locator('.player-bar .pb-fav')).toHaveCount(0)
  const persistedPlayer = await page.evaluate(() => JSON.parse(localStorage.getItem('mh_player') || '{}'))
  expect(persistedPlayer).toMatchObject({ queue: [], currentIndex: -1 })
  expect(JSON.stringify(persistedPlayer)).not.toContain('media.example.org')

  await page.getByRole('button', { name: '查看代码' }).first().click()
  await expect(page.getByRole('textbox', { name: '源 A 源码，只读' })).toHaveValue(/must not execute/)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出', exact: true }).first().click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('source-a.js')

  const remoteUrl = 'https://raw.githubusercontent.com/music-holo/test/main/remote-source.js'
  await page.route(remoteUrl, (route) => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    headers: { 'access-control-allow-origin': '*' },
    body: `/**
 * @name 远程测试源
 * @version 3.0
 */
export default {}`
  }))
  await page.getByLabel('音源脚本地址').fill(remoteUrl)
  await page.getByRole('button', { name: '从 URL 导入' }).click()
  await expect(page.locator('.source-card h3').first()).toHaveText('远程测试源')

  const backupScript = `/**
 * @name 备份恢复源
 * @version 4.0
 */
export default {}`
  const backup = {
    format: 'music-holo-local-source-backup',
    version: 1,
    sources: [{ fileName: 'backup-source.js', name: '备份恢复源', script: backupScript }]
  }
  await page.getByTestId('custom-source-backup-file').setInputFiles({
    name: 'music-holo-source-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup))
  })
  await expect(page.locator('.source-card h3').first()).toHaveText('备份恢复源')
  expect(pageErrors).toEqual([])
})

test('专辑库按歌曲曲库聚合，可从专辑详情播放整张专辑', async ({ page }) => {
  await page.goto('/albums')
  const albumCard = page.locator('.album-card').filter({ hasText: '霓虹海' }).first()
  await expect(albumCard).toBeVisible()
  await albumCard.click()

  await expect(page).toHaveURL(/\/albums\/detail\?album=/)
  await expect(page.locator('.album-title')).toHaveText('《霓虹海》')
  const tracks = page.locator('.album-tracks .el-table__body-wrapper .el-table__row')
  await expect(tracks).toHaveCount(1)
  await expect(tracks.first()).toContainText('霓虹海')
  await page.getByRole('button', { name: '播放专辑' }).click()
  await expect(page.locator('.player-bar .pb-title')).toHaveText('霓虹海')
})

test('相似歌曲电台排除起点歌曲并可播放本轮推荐', async ({ page }) => {
  await page.goto('/radio?sourceId=1')
  await expect(page.locator('.radio-source')).toContainText('霓虹海')

  const rows = page.locator('.radio-tracks .el-table__body-wrapper .el-table__row')
  await expect(rows.first()).toBeVisible()
  await expect(rows.filter({ hasText: '霓虹海' })).toHaveCount(0)
  const firstTitle = (await rows.first().locator('.song-title').innerText()).trim()
  await page.getByRole('button', { name: '播放本轮电台' }).click()
  await expect(page.locator('.player-bar .pb-title')).toHaveText(firstTitle)
})

test('每日推荐可按分类筛选并播放歌曲', async ({ page }) => {
  await loginAs(page, 'demo')
  await openMenu(page, '每日推荐')

  const rows = page.locator('.el-table__body-wrapper .el-table__row')
  await expect(rows).toHaveCount(5)
  await page.getByRole('group', { name: '按音乐分类筛选每日推荐' }).getByRole('button', { name: '华语' }).click()
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('华语')
  await rows.first().getByRole('button', { name: '播放《云端信使》' }).click()
  await expect(page.locator('.player-bar .pb-title')).toHaveText('云端信使')
})

test('公开歌单的分享回退会复制同源链接', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value) => { window.__musicHoloCopiedUrl = value }
      }
    })
  })

  await page.goto('/playlists/1')
  await page.getByRole('button', { name: '分享歌单' }).click()
  await expect(page.getByText('歌单链接已复制', { exact: true })).toBeVisible()

  const copiedUrl = await page.evaluate(() => window.__musicHoloCopiedUrl)
  expect(copiedUrl).toBe(new URL('/playlists/1', page.url()).href)
})

test('本地音频可导入，窄屏滚动后播放器仍固定在视口底部', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/home')
  const playerBar = page.locator('.player-bar')
  await expect(playerBar).toBeVisible()
  await expect(playerBar).toHaveCSS('position', 'fixed')

  const queueButton = page.locator('.player-bar button[aria-label="播放队列"]')
  await expect(queueButton).toBeVisible()
  await queueButton.click()
  await expect(queueButton).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('heading', { name: '播放队列' })).toBeVisible()

  const audio = await readFile(new URL('../../public/audio/song1.wav', import.meta.url))
  await page.locator('input[type="file"][aria-label="选择本地音乐文件"]').setInputFiles({
    name: 'holo-local-e2e.wav',
    mimeType: 'audio/wav',
    buffer: audio
  })

  await expect(playerBar.locator('.pb-title')).toHaveText('holo-local-e2e')
  await expect(page.locator('.queue-item').filter({ hasText: 'holo-local-e2e' })).toBeVisible()
  await expect(page.locator('.player-bar audio').first()).toHaveAttribute('src', /^blob:/)
  await page.keyboard.press('Escape')

  const before = await playerBar.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { top: rect.top, bottom: rect.bottom, position: getComputedStyle(element).position }
  })
  expect(before.position).toBe('fixed')
  expect(before.bottom).toBeCloseTo(844, 0)

  const maxScroll = await page.evaluate(() => document.scrollingElement.scrollHeight - window.innerHeight)
  expect(maxScroll).toBeGreaterThan(0)
  await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

  const after = await playerBar.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { top: rect.top, bottom: rect.bottom }
  })
  expect(after.top).toBeCloseTo(before.top, 0)
  expect(after.bottom).toBeCloseTo(844, 0)
})

test('歌曲短评可发布、举报并由管理员隐藏，作者能看到处理说明', async ({ page }) => {
  await loginAs(page, 'demo')
  await openMenu(page, '全局搜索')
  await page.getByPlaceholder('试试歌名、歌手名，或记得的一句歌词…').fill('霓虹海')
  await page.keyboard.press('Enter')
  const songRow = page.locator('.el-table__row').filter({ hasText: '霓虹海' }).first()
  await expect(songRow).toBeVisible()
  await songRow.getByRole('button', { name: '短评《霓虹海》' }).click()

  const reviewDialog = page.getByRole('dialog', { name: '《霓虹海》的短评' })
  const comment = `管理员审核旅程 ${Date.now()}`
  await reviewDialog.getByRole('textbox', { name: '为霓虹海写短评' }).fill(comment)
  await reviewDialog.getByRole('button', { name: '发布短评' }).click()
  const ownReview = reviewDialog.locator('.review-card').filter({ hasText: comment })
  await expect(ownReview).toBeVisible()
  await expect(ownReview.getByText('我', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.locator('.user-chip').click()
  await page.getByRole('menuitem', { name: '退出登录' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await loginFromCurrentPage(page, 'admin')
  await openMenu(page, '全局搜索')
  await page.getByPlaceholder('试试歌名、歌手名，或记得的一句歌词…').fill('霓虹海')
  await page.keyboard.press('Enter')
  const adminSongRow = page.locator('.el-table__row').filter({ hasText: '霓虹海' }).first()
  await expect(adminSongRow).toBeVisible()
  await adminSongRow.getByRole('button', { name: '短评《霓虹海》' }).click()
  const adminReviewDialog = page.getByRole('dialog', { name: '《霓虹海》的短评' })
  const reportedReview = adminReviewDialog.locator('.review-card').filter({ hasText: comment })
  await expect(reportedReview).toBeVisible()
  await reportedReview.getByRole('button', { name: '举报' }).click()
  const reportDialog = page.getByRole('dialog', { name: '举报短评' })
  await reportDialog.getByRole('button', { name: '提交举报' }).click()
  await expect(page.getByText('举报已提交，管理员会尽快审核', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.locator('.sidebar .app-nav-menu').getByRole('menuitem', { name: '管理后台' }).click()
  await openMenu(page, '短评审核')
  const reportRow = page.locator('.el-table__row').filter({ hasText: comment })
  await expect(reportRow).toBeVisible()
  await reportRow.getByRole('button', { name: '隐藏并解决' }).click()
  await page.locator('.el-message-box__btns button.el-button--primary').click()
  await expect(page.getByRole('dialog', { name: '隐藏短评' })).toHaveCount(0)
  await page.locator('.toolbar .el-select__wrapper').first().click()
  await page.getByRole('option', { name: '已隐藏并处理' }).click()
  const resolvedReportRow = page.locator('.el-table__row').filter({ hasText: comment })
  await expect(resolvedReportRow).toContainText('已隐藏并处理')

  await page.locator('.user-chip').click()
  await page.getByRole('menuitem', { name: '退出登录' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await loginFromCurrentPage(page, 'demo')
  await openMenu(page, '全局搜索')
  await page.getByPlaceholder('试试歌名、歌手名，或记得的一句歌词…').fill('霓虹海')
  await page.keyboard.press('Enter')
  const authorSongRow = page.locator('.el-table__row').filter({ hasText: '霓虹海' }).first()
  await expect(authorSongRow).toBeVisible()
  await authorSongRow.getByRole('button', { name: '短评《霓虹海》' }).click()
  const authorDialog = page.getByRole('dialog', { name: '《霓虹海》的短评' })
  const hiddenReview = authorDialog.locator('.review-card').filter({ hasText: comment })
  await expect(hiddenReview.getByText('审核隐藏')).toBeVisible()
  await expect(hiddenReview).toContainText('经管理员审核，短评已隐藏')
})

test('登录用户可屏蔽歌曲和歌手，自动播放与推荐跳过但手动点播仍可用', async ({ page }) => {
  test.setTimeout(60_000)
  await loginAs(page, 'demo')
  await expect(page.locator('.user-name')).toHaveText('演示用户')
  await openMenu(page, '歌曲')
  await expect(page).toHaveURL(/\/songs$/)

  const songPage = page.locator('.page').filter({ hasText: '发现好音乐，随时随地全息播放' })
  const neonRow = songPage.locator('.el-table__row').filter({ hasText: '霓虹海' }).first()
  await expect(neonRow).toBeVisible()
  await neonRow.getByTestId('dislike-song-1').click()
  await expect(songPage.getByTestId('dislike-status')).toHaveText('已不喜欢《霓虹海》，自动切歌和推荐会跳过')
  await expect(neonRow.getByTestId('dislike-song-1')).toHaveAttribute('data-disliked', 'true')

  await songPage.getByRole('button', { name: '播放全部' }).click()
  await expect(page.locator('.player-bar .pb-title')).toHaveText('极光列车')
  // 播放器控制区有 3D 位移，坐标点击可能打不中按钮；直接触发按钮自身的 click。
  await page.locator('.player-bar').getByRole('button', { name: '播放下一首', exact: true }).evaluate((button) => button.click())
  await expect(page.locator('.player-bar .pb-title')).toHaveText('深空回响')

  await openMenu(page, '全局搜索')
  await page.getByPlaceholder('试试歌名、歌手名，或记得的一句歌词…').fill('霓虹海')
  await page.keyboard.press('Enter')
  const searchRow = page.locator('.el-table__row').filter({ hasText: '霓虹海' }).first()
  await expect(searchRow).toBeVisible()
  await searchRow.getByRole('button', { name: '播放《霓虹海》' }).click()
  await expect(page.locator('.player-bar .pb-title')).toHaveText('霓虹海')

  await openMenu(page, '每日推荐')
  await expect(page).toHaveURL(/\/daily$/)
  const dailyPage = page.locator('.daily-page')
  const messengerRow = dailyPage.locator('.daily-list .el-table__row').filter({ hasText: '云端信使' })
  await expect(messengerRow).toBeVisible()
  await messengerRow.getByTestId('dislike-song-2').click()
  await expect(dailyPage.getByTestId('dislike-status')).toHaveText('已不喜欢《云端信使》，自动切歌和推荐会跳过')
  await expect(messengerRow).toHaveCount(0)

  await openMenu(page, '歌手')
  await page.locator('.singer-card').filter({ hasText: '陆呼吸' }).click()
  await page.getByRole('button', { name: '不喜欢歌手陆呼吸' }).click()
  const confirm = page.locator('.el-message-box')
  await expect(confirm).toContainText('不喜欢这位歌手')
  await confirm.getByRole('button', { name: '确认屏蔽' }).click()
  await expect(page.getByTestId('singer-dislike-status')).toHaveText('已不喜欢歌手陆呼吸，自动切歌和推荐会跳过')
  await expect(page.getByTestId('dislike-singer')).toHaveAttribute('data-disliked', 'true')

  await openMenu(page, '每日推荐')
  await expect(page.locator('.daily-list .el-table__row').first()).toBeVisible()
  await expect(page.locator('.daily-list .el-table__row').filter({ hasText: '云端信使' })).toHaveCount(0)
  await expect(page.locator('.daily-list .el-table__row').filter({ hasText: '玻璃糖纸' })).toHaveCount(0)

  await openMenu(page, '设置')
  await page.getByRole('tab', { name: '不喜欢' }).click()
  const panel = page.getByRole('region', { name: '不喜欢规则' })
  await expect(panel).toContainText('霓虹海')
  await expect(panel).toContainText('云端信使')
  await expect(panel).toContainText('陆呼吸')
  await panel.getByTestId('revoke-dislike-song-1').click()
  await panel.getByTestId('revoke-dislike-song-2').click()
  await panel.getByTestId('revoke-dislike-singer-5').click()
  await expect(panel.getByText('还没有不喜欢的歌曲或歌手')).toBeVisible()

  await openMenu(page, '每日推荐')
  await expect(page.locator('.daily-list .el-table__row').filter({ hasText: '云端信使' })).toBeVisible()
  await expect(page.locator('.daily-list .el-table__row').filter({ hasText: '玻璃糖纸' })).toBeVisible()
})

test('歌曲库可跨页勾选，并批量加入播放队列和自己的歌单', async ({ page }) => {
  test.setTimeout(60_000)
  await loginAs(page, 'demo')
  await openMenu(page, '歌曲')
  await expect(page).toHaveURL(/\/songs$/)

  await page.locator('.el-pagination .el-select').click()
  await page.getByRole('option', { name: '5条/页' }).click()
  await page.keyboard.press('Escape')
  const auroraRow = page.locator('.el-table__row').filter({ hasText: '极光列车' }).first()
  await expect(auroraRow).toBeVisible()
  await expect(page.locator('.el-table__row').filter({ hasText: '玻璃糖纸' })).toHaveCount(0)
  await auroraRow.getByRole('checkbox', { name: '选择《极光列车》' }).check()

  await page.locator('.el-pagination').getByRole('button', { name: '下一页', exact: true }).click()
  const candyRow = page.locator('.el-table__row').filter({ hasText: '玻璃糖纸' }).first()
  await expect(candyRow).toBeVisible()
  await expect(page.locator('.el-table__row').filter({ hasText: '极光列车' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '已选歌曲' })).toContainText('已选 1 首')
  await candyRow.getByRole('checkbox', { name: '选择《玻璃糖纸》' }).check()
  await expect(page.getByRole('region', { name: '已选歌曲' })).toContainText('已选 2 首')

  await page.locator('.el-pagination').getByRole('button', { name: '上一页', exact: true }).click()
  await expect(auroraRow.getByRole('checkbox', { name: '选择《极光列车》' })).toBeChecked()

  await page.getByRole('button', { name: '将已选歌曲加入播放队列' }).click()
  await expect(page.getByText('已将 2 首已选歌曲加入播放队列')).toBeVisible()
  await page.locator('.player-bar').getByRole('button', { name: '播放队列', exact: true }).click()
  const queue = page.getByRole('dialog', { name: '播放队列' })
  await expect(queue).toContainText('极光列车')
  await expect(queue).toContainText('玻璃糖纸')
  await queue.getByRole('button', { name: '关闭此对话框' }).click()

  await page.getByRole('button', { name: '将已选歌曲加入歌单' }).click()
  const picker = page.getByRole('dialog', { name: '加入歌单' })
  await expect(picker.getByRole('radio', { name: '华语精选' })).toBeVisible()
  await expect(picker.getByRole('radio', { name: '深夜霓虹' })).toHaveCount(0)
  await picker.getByRole('radio', { name: '华语精选' }).check()
  await picker.getByRole('button', { name: '加入 2 首' }).click()
  await expect(page.getByText('成功添加 2 首歌曲')).toBeVisible()

  await openMenu(page, '歌单')
  await page.locator('.playlist-card').filter({ hasText: '华语精选' }).click()
  await expect(page).toHaveURL(/\/playlists\/3$/)
  await expect(page.locator('.el-table__row').filter({ hasText: '极光列车' })).toBeVisible()
  await expect(page.locator('.el-table__row').filter({ hasText: '玻璃糖纸' })).toBeVisible()
})

test('歌单创建者可以上下移动曲目并保存，管理员不能调整别人的歌单', async ({ page }) => {
  await loginAs(page, 'demo')
  await openMenu(page, '歌单')
  await page.locator('.playlist-card').filter({ hasText: '华语精选' }).click()
  await expect(page).toHaveURL(/\/playlists\/3$/)

  const titles = page.locator('.el-table__body-wrapper .song-title')
  await expect(titles).toHaveText(['霓虹海', '云端信使', '旧城之光'])
  await expect(page.getByRole('button', { name: '上移《霓虹海》' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '下移《旧城之光》' })).toBeDisabled()

  await page.getByRole('button', { name: '上移《云端信使》' }).click()
  await expect(titles).toHaveText(['云端信使', '霓虹海', '旧城之光'])
  await page.getByRole('button', { name: '下移《霓虹海》' }).click()
  await expect(titles).toHaveText(['云端信使', '旧城之光', '霓虹海'])
  await expect(page.getByRole('button', { name: '上移《云端信使》' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '下移《霓虹海》' })).toBeDisabled()

  await openMenu(page, '歌曲')
  await expect(page).toHaveURL(/\/songs$/)
  await openMenu(page, '歌单')
  await page.locator('.playlist-card').filter({ hasText: '华语精选' }).click()
  await expect(page).toHaveURL(/\/playlists\/3$/)
  await expect(titles).toHaveText(['云端信使', '旧城之光', '霓虹海'])

  await page.locator('.user-chip').click()
  await page.getByRole('menuitem', { name: '退出登录' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await loginFromCurrentPage(page, 'admin')
  await openMenu(page, '歌单')
  await page.locator('.playlist-card').filter({ hasText: '华语精选' }).click()
  await expect(titles).toHaveText(['云端信使', '旧城之光', '霓虹海'])
  await expect(page.getByRole('button', { name: '上移《云端信使》' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '下移《霓虹海》' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '从歌单移除《云端信使》' })).toBeVisible()
})

test('管理员可以进入仪表盘并加载运营统计', async ({ page }) => {
  await loginAs(page, 'admin')
  await page.locator('.sidebar .app-nav-menu').getByRole('menuitem', { name: '管理后台' }).click()
  await openMenu(page, '仪表盘')

  await expect(page.locator('.page-title')).toHaveText('仪表盘')
  await expect(page.locator('.stat-card').filter({ hasText: '歌曲总数' })).toContainText('8')
  await expect(page.locator('.chart-card')).toHaveCount(3)
})
