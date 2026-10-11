import { test, expect } from '@playwright/test'

/**
 * @real 真机旅程：只对 docker compose 起的真实栈运行（nginx + Spring Boot + MySQL/Redis），
 * 与 Mock E2E 的区别是数据来自真实后端、播放的是同源真实音频文件。
 * 运行：PLAYWRIGHT_BASE_URL=http://127.0.0.1:18088 npx playwright test --grep @real --config playwright.real.config.js
 */
async function loginAs(page, username) {
  await page.goto('/login')
  await page.getByPlaceholder('用户名').fill(username)
  await page.getByPlaceholder('密码').fill('123456')
  await page.getByRole('button', { name: /登\s*录/ }).click()
  await expect(page).toHaveURL(/\/home$/)
}

async function apiIn(page, method, path, body) {
  return page.evaluate(async ({ method, path, body }) => {
    const res = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'music-holo-token': localStorage.getItem('mh_token') || ''
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    return res.json()
  }, { method, path, body })
}

async function playNeonSea(page) {
  await page.goto('/search?q=霓虹海')
  let songRow = page.locator('.el-table__row').filter({ hasText: '霓虹海' }).first()
  if (await songRow.count() === 0) {
    const localTab = page.locator('.result-tabs .el-tabs__item').filter({ hasText: /^歌曲/ }).first()
    await localTab.click()
    songRow = page.locator('.el-table__row').filter({ hasText: '霓虹海' }).first()
  }
  await expect(songRow).toBeVisible()
  await songRow.getByRole('button', { name: '播放《霓虹海》' }).click()
  await expect(page.locator('.player-bar .pb-title')).toHaveText('霓虹海')
}

test.describe('真实栈播放链路 @real', () => {
  test('登录真实账号后播放真实音频：解码推进、paused=false、readyState=4', async ({ page }) => {
    await loginAs(page, 'demo')
    await playNeonSea(page)

    // 音源必须来自真实后端接口，而不是 Mock 桩或 data/blob 合成
    await expect(page.locator('.player-bar audio').first()).toHaveAttribute('src', /\/audio\/song1\.wav$/)

    const first = await page.evaluate(() => {
      const audio = document.querySelector('.player-bar audio')
      return { t: audio.currentTime, paused: audio.paused, readyState: audio.readyState }
    })
    expect(first.paused).toBe(false)
    // 先等到 HAVE_ENOUGH_DATA（readyState=4），再按 @live 旅程同样口径采样
    await page.waitForFunction(() => {
      const audio = document.querySelector('.player-bar audio')
      return audio.readyState === 4 && !audio.paused && audio.currentTime > 0
    }, null, { timeout: 10000 })

    await page.waitForTimeout(1500)
    const second = await page.evaluate(() => {
      const audio = document.querySelector('.player-bar audio')
      return { t: audio.currentTime, paused: audio.paused, readyState: audio.readyState }
    })
    expect(second.paused).toBe(false)
    expect(second.readyState).toBe(4)
    // 与 @live 旅程相同的口径：进度推进 ≥0.5s 才算真在解码播放
    expect(second.t - first.t).toBeGreaterThanOrEqual(0.5)
  })

  test('歌词时间校正提交进真实后端：±5000 校验与共识读取', async ({ page }) => {
    await loginAs(page, 'demo')
    const before = await apiIn(page, 'GET', '/api/lyric/offset?songId=1')
    expect(before.code).toBe(200)
    expect(before.data.minReports).toBe(3)

    const rejected = await apiIn(page, 'POST', '/api/lyric/offset', { songId: 1, offsetMs: 6000 })
    expect(rejected.code).toBe(400)
    expect(rejected.msg).toContain('5000')

    const submitted = await apiIn(page, 'POST', '/api/lyric/offset', { songId: 1, offsetMs: 500 })
    expect(submitted.code).toBe(200)
    expect(submitted.data.mine).toBe(500)
    expect(submitted.data.count).toBeGreaterThanOrEqual(1)

    const withdrawn = await apiIn(page, 'DELETE', '/api/lyric/offset?songId=1')
    expect(withdrawn.code).toBe(200)
    const after = await apiIn(page, 'GET', '/api/lyric/offset?songId=1')
    expect(after.data.mine).toBe(null)
  })

  test('会话快照：播放后刷新页面出现「继续上次的收听」，服务端快照可读回', async ({ page }) => {
    await loginAs(page, 'demo')
    await playNeonSea(page)

    // 切到第二首，制造多曲目队列
    await page.goto('/search?q=云端信使')
    const secondRow = page.locator('.el-table__row').filter({ hasText: '云端信使' }).first()
    await expect(secondRow).toBeVisible()
    await secondRow.getByRole('button', { name: '播放《云端信使》' }).click()
    await expect(page.locator('.player-bar .pb-title')).toHaveText('云端信使')

    // 真实产品语义：pagehide 会把队列 + 会话快照一起落盘（先让它自然发生），
    // “继续上次的收听”只在冷启动且队列为空时出现——init 脚本在 boot 前清空队列，
    // 保留快照，走真实的 checkSessionResume 路径。
    await page.addInitScript(() => {
      try {
        const raw = localStorage.getItem('mh_player')
        if (!raw) return
        const state = JSON.parse(raw)
        if (state.sessionSnapshot) {
          state.queue = []
          state.currentIndex = -1
          localStorage.setItem('mh_player', JSON.stringify(state))
        }
      } catch { /* ignore */ }
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    const prompt = page.getByText(/继续上次的收听/)
    await expect(prompt.first()).toBeVisible({ timeout: 8000 })
    await expect(prompt.first()).toContainText(/队列 \d+ 首/)

    // 当前版本服务端同步是本地优先的显式动作；这里直接验证后端 /session 契约可用
    const saved = await apiIn(page, 'PUT', '/api/session', {
      queueIds: [1, 2], currentSongId: 2, position: 5, mode: 'loop', playbackRate: 1.25
    })
    expect(saved.code).toBe(200)
    expect(saved.data.version).toBe(1)
    const back = await apiIn(page, 'GET', '/api/session')
    expect(back.data.queueIds).toEqual([1, 2])
    expect(back.data.mode).toBe('loop')
    expect(back.data.playbackRate).toBe(1.25)
  })

  test('播放器控制键真实鼠标点击可暂停/恢复', async ({ page }) => {
    await loginAs(page, 'demo')
    await playNeonSea(page)
    const audio = page.locator('.player-bar audio').first()
    await expect.poll(() => audio.evaluate((node) => node.paused)).toBe(false)
    await page.locator('.player-bar .pb-play').click()
    await expect.poll(() => audio.evaluate((node) => node.paused)).toBe(true)
    await page.locator('.player-bar .pb-play').click()
    await expect.poll(() => audio.evaluate((node) => node.paused)).toBe(false)
  })

  test('收听统计走真实后端：批量上报幂等 + 汇总聚合', async ({ page }) => {
    await loginAs(page, 'demo')
    const now = Date.now()
    const events = [
      { eventId: `e2e-${now}-a`, type: 'play', songId: 1, at: now },
      { eventId: `e2e-${now}-b`, type: 'complete', songId: 1, duration: 240, position: 240, at: now }
    ]
    const first = await apiIn(page, 'POST', '/api/stat/batch', events)
    expect(first.code).toBe(200)
    expect(first.data.accepted).toBe(2)

    const replay = await apiIn(page, 'POST', '/api/stat/batch', events)
    expect(replay.data.accepted).toBe(0)
    expect(replay.data.duplicates).toBe(2)

    const summary = await apiIn(page, 'GET', '/api/stat/summary?days=7')
    expect(summary.code).toBe(200)
    expect(summary.data.completes).toBeGreaterThanOrEqual(1)
    expect(summary.data.seconds).toBeGreaterThanOrEqual(240)
    expect(summary.data.topSongs[0].songId).toBe(1)
  })
})
