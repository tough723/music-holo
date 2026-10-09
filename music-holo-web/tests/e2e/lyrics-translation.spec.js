import { test, expect } from '@playwright/test'

async function loginAs(page, username) {
  await page.goto('/login')
  await page.getByPlaceholder('用户名').fill(username)
  await page.getByPlaceholder('密码').fill('123456')
  await page.getByRole('button', { name: /登\s*录/ }).click()
  await expect(page).toHaveURL(/\/home$/)
}

test('管理员上传并保存译文后，播放器可同步显示并切换译文', async ({ page }) => {
  await loginAs(page, 'admin')
  await page.locator('.sidebar .app-nav-menu').getByRole('menuitem', { name: '管理后台' }).click()
  await page.locator('.sidebar .app-nav-menu').getByRole('menuitem', { name: '歌曲管理' }).click()
  await expect(page).toHaveURL(/\/admin\/songs$/)
  await expect(page.locator('.page-title')).toHaveText('歌曲管理')

  const songRow = page.locator('.el-table__row').filter({ hasText: '霓虹海' }).first()
  await expect(songRow).toBeVisible()
  await page.getByRole('button', { name: '编辑《霓虹海》' }).first().click()

  const dialog = page.getByRole('dialog')
  const translationInput = dialog.getByPlaceholder('可选 LRC 译文；建议与原歌词使用对应时间标签')
  await expect(dialog.getByRole('button', { name: '保存' })).toBeEnabled()
  const uploadedLrc = '[00:00.50]Translation uploaded from the admin studio\n[00:02.00]A second aligned line'
  await dialog.locator('input[type="file"]').last().setInputFiles({
    name: 'neon-sea-translation.lrc',
    mimeType: 'text/plain',
    buffer: Buffer.from(uploadedLrc)
  })
  await expect(translationInput).toHaveValue(uploadedLrc)

  await dialog.getByRole('button', { name: '保存' }).click()
  await expect(page.getByText('保存成功', { exact: true })).toBeVisible()
  await expect(dialog).not.toBeVisible()

  const refreshedRow = page.locator('.el-table__row').filter({ hasText: '霓虹海' }).first()
  await expect(refreshedRow).toBeVisible()
  await page.getByRole('button', { name: '播放《霓虹海》' }).first().click()
  await expect(page.locator('.player-bar .pb-title')).toHaveText('霓虹海')
  await page.locator('.player-bar').getByRole('button', { name: '显示歌词' }).click()

  const lyricPanel = page.getByRole('dialog', { name: '沉浸式 3D 歌词' })
  const translatedLines = lyricPanel.locator('.line-translation')
  await expect(translatedLines.first()).toHaveText('Translation uploaded from the admin studio')
  await lyricPanel.getByRole('button', { name: '隐藏译文' }).click()
  await expect(translatedLines).toHaveCount(0)
  await lyricPanel.getByRole('button', { name: '显示译文' }).click()
  await expect(translatedLines.first()).toHaveText('Translation uploaded from the admin studio')
})
