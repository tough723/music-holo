import { test, expect } from '@playwright/test'

const platformUrls = {
  wy: /music-api\.gdstudio\.xyz\/api\.php\?types=search/,
  kw: /search\.kuwo\.cn\/r\.s\?/,
  kg: /mobileservice\.kugou\.com\/api\/v3\/search\/song/,
  mg: /pd\.musicapp\.migu\.cn\/MIGUM3\.0\/v1\.0\/content\/search_all\.do/
}

const payloads = {
  wy: JSON.stringify([{ id: 'wy-1', name: '网易结果', artist: ['网易歌手'], album: '网易专辑' }]),
  kw: JSON.stringify({ abslist: [{ MUSICRID: 'MUSIC_kw-1', SONGNAME: '酷我结果', ARTIST: '酷我歌手', ALBUM: '酷我专辑' }] }),
  kg: JSON.stringify({ data: { info: [{ hash: 'kg-1', songname: '酷狗结果', singername: '酷狗歌手', album_name: '酷狗专辑' }] } }),
  mg: JSON.stringify({ musics: [{ id: 'mg-1', songName: '咪咕结果', singers: [{ name: '咪咕歌手' }], albumName: '咪咕专辑' }] })
}

test('在线搜索平台子标签按需加载并保留各平台缓存', async ({ page }) => {
  const counts = { wy: 0, kw: 0, kg: 0, mg: 0 }
  for (const [key, pattern] of Object.entries(platformUrls)) {
    await page.route(pattern, async (route) => {
      counts[key] += 1
      await route.fulfill({ status: 200, contentType: 'application/json', body: payloads[key] })
    })
  }

  await page.goto('/search?q=星海')
  const onlineTab = page.getByRole('tab', { name: /在线平台/ })
  await expect(onlineTab).toBeVisible()
  await onlineTab.click()
  await expect(page.getByRole('tab', { name: /网易云音乐/ })).toBeVisible()
  await expect(page.getByRole('tabpanel', { name: /网易云音乐/ }).getByLabel('在线平台结果')).toContainText('网易结果')
  expect(counts.wy).toBe(1)

  await page.getByRole('tab', { name: /酷我音乐/ }).click()
  await expect(page.getByRole('tabpanel', { name: /酷我音乐/ }).getByLabel('在线平台结果')).toContainText('酷我结果')
  expect(counts.kw).toBe(1)

  await page.getByRole('tab', { name: /网易云音乐/ }).click()
  await expect(page.getByRole('tabpanel', { name: /网易云音乐/ }).getByLabel('在线平台结果')).toContainText('网易结果')
  expect(counts.wy).toBe(1)
})
