import { test, expect } from '@playwright/test'

test('罗马音默认隐藏，打开后与译文分列显示，在线音频仍用原地址', async ({ page }) => {
  await page.goto('/search?q=霓虹海')
  const songRow = page.locator('.el-table__row').filter({ hasText: '霓虹海' }).first()
  await expect(songRow).toBeVisible()
  await songRow.getByRole('button', { name: '播放《霓虹海》' }).click()
  await expect(page.locator('.player-bar .pb-title')).toHaveText('霓虹海')
  await expect(page.locator('.player-bar audio').first()).toHaveAttribute('src', /\/audio\/song1\.wav$/)

  await page.locator('.player-bar').getByRole('button', { name: '显示歌词' }).click()
  const lyricPanel = page.getByRole('dialog', { name: '沉浸式 3D 歌词' })
  const showRomaji = lyricPanel.getByRole('button', { name: '显示罗马音' })
  await expect(showRomaji).toHaveAttribute('aria-pressed', 'false')
  await expect(lyricPanel.locator('.line-romaji')).toHaveCount(0)
  await expect(lyricPanel.locator('.line-translation').first()).toHaveText('Neon wakes, the city starts to breathe')

  await showRomaji.click()
  await expect(lyricPanel.getByRole('button', { name: '隐藏罗马音' })).toHaveAttribute('aria-pressed', 'true')
  await expect(lyricPanel.locator('.line-romaji').first()).toHaveText('Ni hong liang qi, cheng shi kai shi hu xi')
  await expect(lyricPanel.locator('.line-translation').first()).toHaveText('Neon wakes, the city starts to breathe')

  await lyricPanel.getByRole('button', { name: '隐藏罗马音' }).click()
  await expect(lyricPanel.locator('.line-romaji')).toHaveCount(0)
  await expect(page.locator('.player-bar audio').first()).toHaveAttribute('src', /\/audio\/song1\.wav$/)
})
