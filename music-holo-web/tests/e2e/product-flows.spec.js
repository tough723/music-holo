import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'

async function loginAs(page, username) {
  await page.goto('/login')
  await page.getByPlaceholder('用户名').fill(username)
  await page.getByPlaceholder('密码').fill('123456')
  await page.getByRole('button', { name: /登\s*录/ }).click()
  await expect(page).toHaveURL(/\/home$/)
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
  await expect(page.locator('.player-bar audio')).toHaveAttribute('src', /\/audio\/song1\.wav$/)
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
  await expect(page.locator('.player-bar audio')).toHaveAttribute('src', /^blob:/)
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

test('管理员可以进入仪表盘并加载运营统计', async ({ page }) => {
  await loginAs(page, 'admin')
  await page.locator('.nav-menu').getByRole('menuitem', { name: '管理后台' }).click()
  await openMenu(page, '仪表盘')

  await expect(page.locator('.page-title')).toHaveText('仪表盘')
  await expect(page.locator('.stat-card').filter({ hasText: '歌曲总数' })).toContainText('8')
  await expect(page.locator('.chart-card')).toHaveCount(3)
})
