import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'

async function loginAs(page, username) {
  await page.goto('/login')
  await page.getByPlaceholder('用户名').fill(username)
  await page.getByPlaceholder('密码').fill('123456')
  await page.getByRole('button', { name: /登\s*录/ }).click()
  await expect(page).toHaveURL(/\/home$/)
}

async function openPlaylistPage(page) {
  // Keep the SPA alive so the in-memory Mock token registry is not reset by a hard reload.
  await page.locator('.sidebar .app-nav-menu').getByRole('menuitem', { name: '歌单', exact: true }).click()
}

test('账号歌单可导出并预览导入；重名创建私密副本且跳过缺失曲目', async ({ page }) => {
  await loginAs(page, 'demo')
  await openPlaylistPage(page)

  const exportButton = page.getByRole('button', { name: '导出我的歌单' })
  await expect(exportButton).toBeVisible()
  await exportButton.click()
  await expect(page.getByTestId('playlist-export-status')).toHaveText('已生成 1 张歌单备份，请保存文件')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('link', { name: '保存歌单备份' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^music-holo-playlists-.*\.json$/)
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(exported.playlists.map((playlist) => playlist.name)).toEqual(['华语精选'])
  expect(JSON.stringify(exported)).not.toMatch(/\"(?:audioUrl|lyric|lyricTranslation|password|token|script|audio)\"\s*:/)

  const source = exported.playlists[0]
  const backup = {
    ...exported,
    playlists: [{
      ...source,
      songs: [
        source.songs[0],
        { id: '999999', title: '曲库没有的歌曲', singerName: '未知歌手', album: '未知专辑', duration: 120 }
      ]
    }]
  }
  await page.locator('input[aria-label="选择 Music Holo 歌单备份"]')
    .setInputFiles({ name: 'portable-playlists.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })

  const dialog = page.getByRole('dialog', { name: '歌单备份预览' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('同名将另存为「华语精选（导入 2）」')).toBeVisible()
  await expect(dialog.getByText('1 首自动匹配')).toBeVisible()
  await expect(dialog.getByText('1 首未找到')).toBeVisible()
  await expect(dialog.getByRole('checkbox', { name: '导入后公开此歌单' })).not.toBeChecked()

  await dialog.getByRole('button', { name: '导入已选 1 张' }).click()
  await page.getByRole('button', { name: '创建歌单副本' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('.playlist-card').filter({ hasText: '华语精选（导入 2）' })).toBeVisible()
  await expect(page.getByText('已导入 1 张歌单和 1 首歌曲，另跳过 1 首未匹配曲目')).toBeVisible()

  await page.locator('.playlist-card').filter({ hasText: '华语精选（导入 2）' }).click()
  await expect(page).toHaveURL(/\/playlists\//)
  await expect(page.getByText('私密', { exact: true })).toBeVisible()
  await expect(page.locator('.song-list-root .el-table__row')).toHaveCount(1)
})
