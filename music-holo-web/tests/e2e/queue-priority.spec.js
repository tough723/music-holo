import { test, expect } from '@playwright/test'

test('歌曲可排在下一首，队列排序后仍保持当前播放曲目', async ({ page }) => {
  await page.goto('/songs')

  const currentSong = '霓虹海'
  const firstNextSong = '云端信使'
  const secondNextSong = '全息之恋'
  await page.getByRole('button', { name: `播放《${currentSong}》` }).click()
  await expect(page.locator('.player-bar .pb-title')).toHaveText(currentSong)

  await page.getByRole('button', { name: `下一首播放《${firstNextSong}》` }).click()
  await page.getByRole('button', { name: `下一首播放《${secondNextSong}》` }).click()

  const queueButton = page.locator('.player-bar button[aria-label="播放队列"]')
  await queueButton.click()
  const queueItems = page.locator('.queue-item')
  const queueTitles = () => queueItems.locator('.queue-title').allTextContents()
  await expect.poll(queueTitles).toEqual([currentSong, secondNextSong, firstNextSong])

  await page.getByRole('button', { name: `上移《${firstNextSong}》` }).click()
  await expect.poll(queueTitles).toEqual([currentSong, firstNextSong, secondNextSong])

  await page.getByRole('button', { name: `上移《${firstNextSong}》` }).click()
  await expect.poll(queueTitles).toEqual([firstNextSong, currentSong, secondNextSong])
  await expect(queueItems.filter({ hasText: currentSong })).toHaveClass(/active/)
})
