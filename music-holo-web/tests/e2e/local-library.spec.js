import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'

test('本地文件刷新后不回到队列，自有演示音频可保存并删除且在线地址不变', async ({ page }) => {
  await page.goto('/home')
  await page.locator('.player-bar button[aria-label="播放队列"]').click()
  await expect(page.getByRole('heading', { name: '播放队列' })).toBeVisible()
  await expect(page.getByRole('button', { name: '记住本地文件' })).toBeVisible()
  await expect(page.getByRole('button', { name: '恢复已记住的本地音乐' })).toBeDisabled()
  await expect(page.locator('.local-library-note')).toBeVisible()

  const audio = await readFile(new URL('../../public/audio/song1.wav', import.meta.url))
  await page.locator('input[type="file"][aria-label="选择本地音乐文件"]').setInputFiles({
    name: 'session-only.wav',
    mimeType: 'audio/wav',
    buffer: audio
  })
  await expect(page.locator('.player-bar .pb-title')).toHaveText('session-only')
  await expect(page.locator('.player-bar audio').first()).toHaveAttribute('src', /^blob:/)

  await page.reload()
  await expect(page.locator('.player-bar .pb-title')).toHaveText('暂无播放')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('mh_player') || '')).not.toContain('blob:')
  await page.locator('.player-bar button[aria-label="播放队列"]').click()
  await expect(page.locator('.queue-item').filter({ hasText: 'session-only' })).toHaveCount(0)

  await page.keyboard.press('Escape')
  await page.goto('/search?q=霓虹海')
  const songRow = page.locator('.el-table__row').filter({ hasText: '霓虹海' }).first()
  await songRow.getByRole('button', { name: '播放《霓虹海》' }).click()
  await expect(page.locator('.player-bar audio').first()).toHaveAttribute('src', /\/audio\/song1\.wav$/)

  await page.locator('.player-bar button[aria-label="播放队列"]').click()
  await page.getByRole('button', { name: '保存《霓虹海》的演示音频到本机' }).click()
  await expect(page.getByText('霓虹海 · 演示副本')).toBeVisible()
  await expect(page.locator('.player-bar audio').first()).toHaveAttribute('src', /\/audio\/song1\.wav$/)
  await page.getByRole('button', { name: '删除《霓虹海》的离线副本' }).click()
  await expect(page.getByText('霓虹海 · 演示副本')).toHaveCount(0)
  await expect(page.locator('.player-bar audio').first()).toHaveAttribute('src', /\/audio\/song1\.wav$/)
})
