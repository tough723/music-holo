import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'

test('曲库歌曲可显式选择自定义源和音质并以匿名 CORS 播放', async ({ page }) => {
  const sourceScript = `/**
 * @name 正常流程测试源
 * @version 1.0.0
 * @author Music Holo QA
 */
const lx = globalThis.lx
lx.on(lx.EVENT_NAMES.request, ({ action, info }) => {
  if (!info?.musicInfo?.title) throw new Error('缺少公开曲目信息')
  if (action === 'musicUrl') {
    if (info.musicInfo.songmid !== 'provider-song-42') throw new Error('平台曲目 ID 没有传给音源')
    if (info.type !== '320k') throw new Error('音质选择没有传给音源')
    return Promise.resolve({ url: 'https://media.example.org/track.wav?quality=320k' })
  }
  if (action === 'lyric') return Promise.resolve({ lyric: '[00:00.00]自定义源歌词' })
  if (action === 'pic') return Promise.resolve({ url: 'https://media.example.org/cover.png' })
  throw new Error('未知动作')
})
lx.send(lx.EVENT_NAMES.inited, { sources: {
  kw: { name: '兼容平台', type: 'music', actions: ['musicUrl', 'lyric', 'pic'], qualitys: ['128k', '320k'] }
} })`
  const source = {
    id: 'source-e2e-core',
    hash: 'e2e-core',
    fileName: 'e2e-core.js',
    name: '正常流程测试源',
    version: '1.0.0',
    description: '受控 E2E 音源',
    author: 'Music Holo QA',
    homepage: 'https://example.org/e2e',
    importedAt: new Date().toISOString(),
    script: sourceScript
  }
  const testAudio = await readFile(new URL('../../public/audio/song1.wav', import.meta.url))
  const coverPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2BcAAAAASUVORK5CYII=', 'base64')
  let audioHeaders = null
  let coverHeaders = null

  await page.goto('/')
  await page.evaluate((savedSource) => {
    localStorage.setItem('mh_custom_sources_v1:local', JSON.stringify([savedSource]))
  }, source)
  await page.route(/^https:\/\/media\.example\.org\/track\.wav\?quality=320k$/, async (route) => {
    audioHeaders = route.request().headers()
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'audio/wav' },
      body: testAudio
    })
  })
  await page.route('https://media.example.org/cover.png', async (route) => {
    coverHeaders = route.request().headers()
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'image/png' },
      body: coverPng
    })
  })
  await page.goto('/search?q=霓虹海')

  const songRow = page.locator('.el-table__row').filter({ hasText: '霓虹海' }).first()
  const customSourceButton = songRow.getByRole('button', { name: '使用自定义源播放《霓虹海》' })
  await expect(customSourceButton).toBeVisible()
  await customSourceButton.click()

  const playbackDialog = page.getByRole('dialog', { name: '自定义源解析 · 霓虹海' })
  await expect(playbackDialog.locator('.source-playback-source .el-select')).toContainText('正常流程测试源')
  await playbackDialog.getByRole('textbox', { name: '平台专属曲目字段 JSON' }).fill('{"songmid":"provider-song-42"}')
  await playbackDialog.getByRole('button', { name: '信任并初始化自定义音源' }).click()
  await page.getByRole('button', { name: '我信任并继续' }).click()
  await expect(playbackDialog.getByLabel('选择自定义音源平台')).toBeVisible()

  await playbackDialog.locator('.source-playback-fields .el-select').nth(1).click()
  await page.getByRole('option', { name: '320k' }).click()
  await playbackDialog.getByRole('button', { name: '隔离解析并播放歌曲' }).click()
  await page.getByRole('button', { name: '允许并播放' }).click()

  await expect(page.locator('.player-bar .pb-title')).toHaveText('霓虹海')
  await page.locator('.player-bar').getByRole('button', { name: '显示歌词' }).click()
  await expect(page.locator('.lyric-panel')).toContainText('自定义源歌词')
  const customAudio = page.locator('.player-bar audio').first()
  await expect(customAudio).toHaveAttribute('crossorigin', 'anonymous')
  await expect(customAudio).toHaveAttribute('referrerpolicy', 'no-referrer')
  await expect(customAudio).toHaveAttribute('src', 'https://media.example.org/track.wav?quality=320k')
  const customCover = page.locator('.player-bar .cover img').first()
  await expect(customCover).toHaveAttribute('crossorigin', 'anonymous')
  await expect(customCover).toHaveAttribute('referrerpolicy', 'no-referrer')
  await expect(customCover).toHaveAttribute('src', 'https://media.example.org/cover.png')
  await expect.poll(() => audioHeaders).not.toBeNull()
  await expect.poll(() => coverHeaders).not.toBeNull()
  expect(audioHeaders).not.toHaveProperty('cookie')
  expect(audioHeaders).not.toHaveProperty('authorization')
  expect(coverHeaders).not.toHaveProperty('cookie')
  expect(coverHeaders).not.toHaveProperty('referer')

  const persistedPlayer = await page.evaluate(() => JSON.parse(localStorage.getItem('mh_player') || '{}'))
  expect(persistedPlayer).toMatchObject({ queue: [], currentIndex: -1 })
  expect(JSON.stringify(persistedPlayer)).not.toContain('media.example.org')
})
