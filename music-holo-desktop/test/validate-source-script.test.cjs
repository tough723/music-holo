// 验证工具自身的回归测试：用自研夹具脚本模拟真实星海类脚本的协议用法
//（初始化联网、后端→GD 降级、歌词缓存、平台 ID 字段），不复制或执行第三方脚本。
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { validateScript, formatReport, fixtureResponse } = require('../scripts/validate-source-script.cjs')

const CONTRACT_FIXTURE = `
const { EVENT_NAMES, request, on, send } = globalThis.lx
const cache = new Map()
function parseBody(body) {
  if (typeof body !== 'string') return body
  try { return JSON.parse(body) } catch (e) { return body }
}
function get(url, headers) {
  return new Promise((resolve, reject) => {
    request(url, { method: 'GET', headers: headers || {} }, (error, response, body) => {
      if (error) return reject(error)
      resolve(parseBody(body === undefined ? response.body : body))
    })
  })
}
on(EVENT_NAMES.request, async ({ action, source, info }) => {
  if (source !== 'wy' && source !== 'kw') throw new Error('不支持的音乐源: ' + source)
  if (action === 'musicUrl') {
    if (!info || !info.musicInfo || !info.type) throw new Error('参数不完整')
    const id = info.musicInfo.hash ?? info.musicInfo.songmid ?? info.musicInfo.id
    if (!id) throw new Error('缺少 songId')
    const backend = await get('https://yy.zddyr.top/lx/api/?source=' + (source === 'kw' ? 'kw' : 'wy') +
      '&songmid=' + encodeURIComponent(id) + '&quality=' + encodeURIComponent(info.type),
      { 'X-Token': 'fixture-token', 'User-Agent': 'lx-music' })
    if (backend && backend.url) {
      cache.set(id, { lyric: backend.lrc || null, cover: backend.picture || null })
      return backend.url
    }
    const gd = await get('https://music-api.gdstudio.xyz/api.php?types=url&source=netease&id=' + encodeURIComponent(id) + '&br=320')
    if (gd && gd.url) {
      cache.set(id, { lyric: null, cover: null })
      return gd.url
    }
    throw new Error('获取播放链接失败')
  }
  const id = info && info.musicInfo ? (info.musicInfo.hash ?? info.musicInfo.songmid ?? info.musicInfo.id) : null
  const cached = cache.get(id)
  if (action === 'lyric') return cached && cached.lyric ? { lyric: cached.lyric, tlyric: '' } : null
  if (action === 'pic') return (cached && cached.cover) || null
  throw new Error('不支持的操作: ' + action)
})
send(EVENT_NAMES.inited, {
  sources: {
    wy: { name: '网易云', type: 'music', actions: ['musicUrl', 'lyric', 'pic'], qualitys: ['128k', '320k'] },
    kw: { name: '酷我', type: 'music', actions: ['musicUrl'], qualitys: ['320k'] }
  }
})
request('https://yy.zddyr.top/ip.php', { method: 'GET' }, function () {})
`

test('夹具路由按真实接口形状应答（含后端失败分支）', () => {
  assert.match(fixtureResponse('https://yy.zddyr.top/lx/api/?source=wy&quality=320k').body, /"code":200/)
  assert.match(fixtureResponse('https://yy.zddyr.top/lx/api/?source=kg').body, /"code":500/)
  assert.match(fixtureResponse('https://music-api.gdstudio.xyz/api.php?types=url&source=netease&id=347230&br=320').body, /"br":320/)
  assert.match(fixtureResponse('https://mobi.kuwo.cn/mobi.s?rid=5886682').body, /"code":200/)
  assert.match(fixtureResponse('https://yy.zddyr.top/ip.php').body, /"ip"/)
})

test('验证工具完整走查契约夹具脚本（初始化联网、平台 ID、缓存、错误路径）', async () => {
  const report = await validateScript(CONTRACT_FIXTURE, { scriptPath: 'contract-fixture' })
  const byName = Object.fromEntries(report.checks.map((check) => [check.name, check]))
  assert.equal(byName['worker-loaded'].status, 'pass')
  assert.match(byName['inited-event'].detail, /wy\(|声明 2 个平台/)
  assert.equal(byName['no-search-capability'].status, 'pass')
  assert.match(byName['init-network'].detail, /ip\.php/)
  assert.equal(byName['platform-resolve-wy'].status, 'pass')
  assert.match(byName['platform-resolve-wy'].detail, /songmid=fixture-track|347230|平台 ID/)
  assert.equal(byName['platform-resolve-kw'].status, 'pass')
  assert.match(byName['lyric-cache-behavior'].detail, /未解析曲目 lyric → null/)
  assert.match(byName['lyric-cache-behavior'].detail, /夹具歌词/)
  assert.equal(byName['search-action-rejected'].status, 'pass')
  assert.equal(byName['error-missing-music-info'].status, 'pass')
  assert.equal(byName['error-missing-quality'].status, 'pass')
  assert.equal(byName['header-audit'].status, 'pass')
  assert.ok(formatReport(report).includes('出站请求：'))
})

test('服务端失败（夹具 500）时平台契约仍算通过，但解析失败', async () => {
  const kgFixture = `
const { EVENT_NAMES, request, on, send } = globalThis.lx
on(EVENT_NAMES.request, async ({ action, source, info }) => {
  if (action !== 'musicUrl') throw new Error('不支持的操作: ' + action)
  const data = await new Promise((resolve, reject) => {
    request('https://yy.zddyr.top/lx/api/?source=kg&hash=' + encodeURIComponent(info.musicInfo.hash) + '&quality=320k', { method: 'GET' }, (error, response, body) => {
      if (error) return reject(error)
      resolve(typeof body === 'string' ? JSON.parse(body) : body)
    })
  })
  if (!data.url) throw new Error(data.msg || '后端无可用链接')
  return data.url
})
send(EVENT_NAMES.inited, { sources: { kg: { name: '酷狗', type: 'music', actions: ['musicUrl'], qualitys: ['320k'] } } })
`
  const report = await validateScript(kgFixture, { scriptPath: 'kg-fixture' })
  const check = report.checks.find((item) => item.name === 'platform-resolve-kg')
  assert.equal(check.status, 'pass')
  assert.match(check.detail, /所有音质\(128k\)均获取失败/)
  assert.match(check.detail, /c41e80a18d1448fa47086372999c7f43 已出现在出站请求/)
  assert.equal(report.platformSummaries[0].resolved, false)
})

test('仓库自带 local 示例脚本可通过验证工具（无网络直链）', async () => {
  const local = readFileSync(path.resolve(__dirname, '../../examples/lx-custom-source/music-holo-local.js'), 'utf8')
  const report = await validateScript(local, { scriptPath: 'music-holo-local.js' })
  const byName = Object.fromEntries(report.checks.map((check) => [check.name, check]))
  assert.equal(byName['worker-loaded'].status, 'pass')
  assert.equal(byName['platform-resolve-local'].status, 'pass')
  assert.match(byName['platform-resolve-local'].detail, /media\.example\.invalid\/track\.mp3/)
  assert.equal(byName['search-action-rejected'].status, 'pass')
})
