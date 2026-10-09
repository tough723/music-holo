import { test, expect } from '@playwright/test'

test('授权后记住本地文件，刷新不自动入队；自有演示音频可离线保存并删除', async ({ page }) => {
  await page.addInitScript(() => {
    const file = new File(['local-audio'], 'remembered-holo.wav', { type: 'audio/wav' })
    const handle = {
      name: file.name,
      async getFile() { return file },
      async queryPermission() { return 'granted' },
      async requestPermission() { return 'granted' }
    }
    window.showOpenFilePicker = async () => [handle]
  })

  await page.goto('/home')
  await page.locator('.player-bar button[aria-label="播放队列"]').click()
  await page.getByRole('button', { name: '记住本地文件' }).click()
  await expect(page.locator('.player-bar .pb-title')).toHaveText('remembered-holo')
  await expect(page.locator('.player-bar audio').first()).toHaveAttribute('src', /^blob:/)
  await expect(page.getByRole('button', { name: '忘记本地文件《remembered-holo.wav》' })).toBeVisible()

  await page.reload()
  await expect(page.locator('.player-bar .pb-title')).not.toHaveText('remembered-holo')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('mh_player') || '')).not.toContain('blob:')
  await page.locator('.player-bar button[aria-label="播放队列"]').click()
  await expect(page.locator('.queue-item').filter({ hasText: 'remembered-holo' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '恢复已记住的本地音乐' })).toBeEnabled()

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
