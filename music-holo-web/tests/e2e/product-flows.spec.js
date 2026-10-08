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
  await page.locator('.nav-menu').getByRole('menuitem', { name: label }).click()
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

  await page.locator('.nav-menu').getByRole('menuitem', { name: '管理后台' }).click()
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

test('管理员可以进入仪表盘并加载运营统计', async ({ page }) => {
  await loginAs(page, 'admin')
  await page.locator('.nav-menu').getByRole('menuitem', { name: '管理后台' }).click()
  await openMenu(page, '仪表盘')

  await expect(page.locator('.page-title')).toHaveText('仪表盘')
  await expect(page.locator('.stat-card').filter({ hasText: '歌曲总数' })).toContainText('8')
  await expect(page.locator('.chart-card')).toHaveCount(3)
})
