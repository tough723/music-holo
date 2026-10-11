#!/usr/bin/env node
/**
 * LX 音源脚本隔离验证工具（客户端契约验证）。
 *
 * 在一次性 Node vm 中加载真实 Worker 桥（music-holo-web/src/utils/customSourceWorker.js）
 * 与操作者提供的音源脚本，验证初始化声明、网络请求形状、平台曲目 ID 传递、解析地址、
 * 歌词/封面缓存行为与错误路径。工具本身不内置任何第三方脚本；被测脚本由命令行传入，
 * 不会复制进仓库。
 *
 * 用法：
 *   node scripts/validate-source-script.cjs <脚本.js>            # 离线夹具模式
 *   node scripts/validate-source-script.cjs <脚本.js> --live      # 真实网络（受本机出口策略限制）
 *   node scripts/validate-source-script.cjs <脚本.js> --json      # 机器可读报告
 *
 * 离线模式用固定夹具回答脚本请求（响应形状取自 2026-10-10 真实接口探测，媒体地址与
 * 签名已替换为占位符），验证的是客户端兼容契约，不代表第三方服务可用。
 * 在线模式走与桌面客户端相同的网络策略（transport.cjs：公网 DNS 校验、拒绝重定向、
 * 512 KB 上限），失败时按「环境网络受限 / 服务端失败 / 客户端问题」分类输出。
 */

const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { webcrypto } = require('node:crypto')

const WORKER_PATH = path.resolve(__dirname, '../../music-holo-web/src/utils/customSourceWorker.js')

// ---------------------------------------------------------------------------
// 夹具：响应形状来自 2026-10-10 真实接口探测记录（docs/xinghai-validation.md），
// 媒体地址与签名参数一律替换为占位符，不写入任何密钥或临时访问令牌。
// ---------------------------------------------------------------------------
const FIXTURES = {
  ip: { ip: '203.0.113.10', ip_type: 'IPv4', request_time: 1791568650 },
  versionLatest: { message: '你已是最新版本', update_url: null },
  backend: {
    wy: {
      code: 200, url: 'http://media.example.invalid/wy-320k.mp3?REDACTED', quality: '320k', format: 'mp3', msg: '成功', source: 'wy',
      lrc: '[00:00.000]夹具歌词', picture: 'https://media.example.invalid/wy-cover.jpg', service: 'unified'
    },
    kw: { code: 200, url: 'http://media.example.invalid/kw-320k.mp3?REDACTED', lrc: null, picture: null, service: 'unified', quality: '320k', format: 'mp3' },
    kg: { code: 500, msg: '所有音质(128k)均获取失败', url: null },
    migu: { code: 200, url: 'https://media.example.invalid/mg-320k.mp3?REDACTED', quality: '320k', format: 'mp3', msg: '成功', source: 'migu' },
    qq: { code: 200, url: 'https://media.example.invalid/tx-320k.mp3?REDACTED', quality: '320k', format: 'mp3', msg: '成功', source: 'qq' },
    qs: { code: 200, data: { url: 'https://media.example.invalid/qs-320k.mp3', key: 'fixture-key' } }
  },
  gdUrl: { url: 'http://media.example.invalid/gd-320k.mp3', br: 320, size: 13042460, from: 'music.gdstudio.xyz' },
  gdLyric: { lyric: '[00:00.000]夹具歌词', tlyric: '', from: 'music.gdstudio.xyz' },
  gdPic: { url: 'https://media.example.invalid/gd-cover.jpg', from: 'music.gdstudio.xyz' },
  kwChannel: { code: 200, data: { url: 'http://media.example.invalid/kw-local-320k.mp3', bitrate: '320k', format: 'mp3', ekey: '' } },
  kwExtra: {
    data: {
      songinfo: { album: '夹具专辑', albumId: '2676', artist: '夹具歌手', songName: '夹具歌曲', pic: '//img.example.invalid/cover.jpg', artistId: '1250' },
      lrclist: [{ time: '1.5', lineLyric: '夹具歌词行' }]
    }
  }
}

function fixtureResponse(url, options = {}) {
  const parsed = new URL(url)
  const host = parsed.hostname
  const query = parsed.searchParams
  const text = (body) => ({ statusCode: 200, headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) })
  if (host.endsWith('kuwo.cn') && parsed.pathname.includes('songinfoandlrc')) return text(FIXTURES.kwExtra)
  if ((host.endsWith('kuwo.cn') || host.endsWith('kuwo.cn')) && parsed.pathname.endsWith('.s')) return text(FIXTURES.kwChannel)
  if (host === 'm.kuwo.cn' && parsed.pathname.includes('songinfoandlrc')) return text(FIXTURES.kwExtra)
  if (host.endsWith('gdstudio.xyz')) {
    const types = query.get('types')
    if (types === 'url') return text(FIXTURES.gdUrl)
    if (types === 'lyric') return text(FIXTURES.gdLyric)
    if (types === 'pic') return text(FIXTURES.gdPic)
    return text({ detail: '夹具未覆盖的 GD 参数' })
  }
  if (host.endsWith('zddyr.top') || host.endsWith('dpdns.org')) {
    const p = parsed.pathname
    if (p.includes('ip.php')) return text(FIXTURES.ip)
    if (p.includes('versionh2.php') || p.includes('vers.php')) return text(FIXTURES.versionLatest)
    if (p.includes('/lx/api')) {
      const source = query.get('source') || 'wy'
      const map = { wy: FIXTURES.backend.wy, kw: FIXTURES.backend.kw, kg: FIXTURES.backend.kg, migu: FIXTURES.backend.migu, mg: FIXTURES.backend.migu, qq: FIXTURES.backend.qq, tx: FIXTURES.backend.qq, qs: FIXTURES.backend.qs }
      return text(map[source] || { code: 500, msg: '夹具未覆盖的 source', url: null })
    }
    return text({ code: 404, msg: '夹具未覆盖的路径' })
  }
  if (host.endsWith('kugou.com')) return text({ status: 1, data: { info: [] } })
  if (host.endsWith('migu.cn')) return text({ code: '000000', songResultData: { result: [] } })
  return text({ code: 404, msg: `夹具未覆盖的主机：${host}`, url: null })
}

// ---------------------------------------------------------------------------
// 一次性 Worker 宿主（与 music-holo-desktop/test/worker-compatibility.test.cjs 同构）
// ---------------------------------------------------------------------------
function bootWorker(script, env = 'desktop') {
  const messages = []
  const handlers = {}
  const globals = {
    postMessage: (message) => { messages.push(structuredClone(message)) },
    addEventListener: (name, handler) => { handlers[name] = handler },
    crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, Uint32Array, ArrayBuffer,
    URL, URLSearchParams, queueMicrotask, atob, btoa, console
  }
  globals.self = globals
  vm.runInNewContext(readFileSync(WORKER_PATH, 'utf8'), globals)
  handlers.message({ data: { type: 'initialize', script, env, metadata: {} } })
  return { messages, deliver: (data) => handlers.message({ data }) }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(messages, predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const found = messages.find(predicate)
    if (found) return found
    if (Date.now() > deadline) return null
    await sleep(5)
  }
}

function createFixtureTransport() {
  const requests = []
  const respond = async (url, options = {}) => {
    requests.push({ url, method: String(options.method || 'GET').toUpperCase(), headers: { ...(options.headers || {}) } })
    return fixtureResponse(url, options)
  }
  respond.requests = requests
  return respond
}

function createLiveTransport() {
  const { sourceRequest } = require('../transport.cjs')
  const requests = []
  const respond = async (url, options = {}) => {
    requests.push({ url, method: String(options.method || 'GET').toUpperCase(), headers: { ...(options.headers || {}) } })
    try {
      return await sourceRequest(url, options, {})
    } catch (error) {
      const message = String(error?.message || error)
      const networkBlocked = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPROTO|SSL|socket hang up|音源 DNS|音源连接超时|音源响应|network/i.test(message)
      const wrapped = new Error(message)
      wrapped.code = networkBlocked ? 'ENVIRONMENT_OR_NETWORK' : 'CLIENT'
      throw wrapped
    }
  }
  respond.requests = requests
  return respond
}

// ---------------------------------------------------------------------------
// 校验流程
// ---------------------------------------------------------------------------
const PLATFORM_PROBES = {
  wy: { id: '347230', name: '海阔天空', singer: 'Beyond', albumName: '海阔天空', interval: 326 },
  tx: { songmid: '003x6m5Y4O1Cyx', name: '海阔天空', singer: 'Beyond', albumName: '海阔天空', interval: 326 },
  kw: { songmid: '5886682', id: '5886682', name: '海阔天空', singer: 'BEYOND', albumName: '乐与怒', interval: 324 },
  kg: { hash: 'c41e80a18d1448fa47086372999c7f43', albumId: '973001', songmid: '298386791', id: '298386791', name: '海阔天空', singer: 'BEYOND', interval: 319 },
  mg: { songmid: '1135162566', id: '1135162566', name: '海阔天空', singer: 'Beyond', interval: 320 },
  qs: { songmid: '7156234567890123456', id: '7156234567890123456', name: '海阔天空', singer: 'Beyond', interval: 320 },
  local: { songmid: 'fixture-track', audioUrl: 'https://media.example.invalid/track.mp3' }
}
const QUALITY_BY_PLATFORM = { wy: '320k', tx: '320k', kw: '320k', kg: '320k', mg: '320k', qs: '320k', local: null }

function classifyRequestError(error) {
  if (error?.code === 'ENVIRONMENT_OR_NETWORK') return '环境网络受限或不可达'
  return '客户端/脚本问题'
}

function auditHeaders(requests) {
  const findings = []
  const blocked = /^(authorization|proxy-authorization|cookie2?|host|origin|referer|connection|content-length)$/i
  for (const request of requests) {
    let host = ''
    try { host = new URL(request.url).host } catch { host = '(无效地址)' }
    for (const [name, value] of Object.entries(request.headers || {})) {
      if (blocked.test(name)) findings.push(`${request.method} ${host} 携带受限请求头 ${name}`)
      if (/token|secret|password|cookie/i.test(name) && !/^x-token$/i.test(name)) {
        findings.push(`${request.method} ${host} 疑似凭据请求头 ${name}`)
      }
    }
  }
  return findings
}

async function dispatch(harness, payload, timeoutMs = 8000) {
  const requestId = `validation-${Math.random().toString(36).slice(2, 10)}`
  harness.deliver({ type: 'dispatch', eventName: 'request', data: payload, requestId })
  const response = await waitFor(harness.messages, (message) => message.type === 'source-response' && message.requestId === requestId, timeoutMs)
  return response
}

function summarizeRequests(requests) {
  return requests.map((request) => `${request.method} ${request.url.replace(/^https?:\/\//, '').slice(0, 120)}`)
}

async function validateScript(scriptText, { transport, env = 'desktop', live = false, scriptPath = '' } = {}) {
  const request = transport || (live ? createLiveTransport() : createFixtureTransport())
  const checks = []
  const addCheck = (name, status, detail) => checks.push({ name, status, detail })
  const script = String(scriptText || '')
  const bytes = Buffer.byteLength(script, 'utf8')
  if (!script.trim()) throw new Error('脚本为空')
  if (bytes > 128 * 1024) throw new Error('脚本超过 128 KB 上限')

  const harness = bootWorker(script, env)
  let pumping = true
  const background = (async () => {
    while (pumping || harness.messages.some((item) => item.type === 'source-request' && !item.__done)) {
      const message = harness.messages.find((item) => item.type === 'source-request' && !item.__done)
      if (!message) {
        await sleep(5)
        continue
      }
      message.__done = true
      try {
        const response = await request(message.url, message.options || {})
        harness.deliver({ type: 'request-result', requestId: message.requestId, ok: true, response })
      } catch (error) {
        harness.deliver({ type: 'request-result', requestId: message.requestId, ok: false, error: String(error?.message || error) })
      }
    }
  })()
  const stopPump = async () => { pumping = false; await background }

  const loaded = await waitFor(harness.messages, (message) => message.type === 'source-loaded' || message.type === 'source-error', 5000)
  if (!loaded || loaded.type === 'source-error') {
    addCheck('worker-loaded', 'fail', loaded?.error || '脚本在隔离 Worker 中加载超时')
    await stopPump()
    return { scriptPath, scriptBytes: bytes, live, checks, requests: request.requests || [], platforms: [] }
  }
  addCheck('worker-loaded', 'pass', '脚本在一次性隔离 Worker 中求值成功（未触碰页面/存储）')

  const inited = await waitFor(harness.messages, (message) => message.type === 'source-event' && message.eventName === 'inited', 4000)
  let platforms = []
  if (!inited) {
    addCheck('inited-event', 'fail', '未收到 inited 初始化声明')
  } else {
    const sources = inited.data?.sources && typeof inited.data.sources === 'object' ? inited.data.sources : {}
    platforms = Object.entries(sources).map(([key, value]) => ({
      key,
      name: String(value?.name || key),
      actions: Array.isArray(value?.actions) ? value.actions : [],
      qualitys: Array.isArray(value?.qualitys) ? value.qualitys : (Array.isArray(value?.qualities) ? value.qualities : [])
    }))
    const oversize = platforms.find((platform) => platform.qualitys.length > 16 || platform.actions.length > 16)
    addCheck('inited-event', oversize ? 'fail' : 'pass',
      `声明 ${platforms.length} 个平台：${platforms.map((platform) => `${platform.key}(${platform.qualitys.join('/') || '无音质列表'})`).join('、')}`)
    const unexpectedActions = platforms.flatMap((platform) => platform.actions.filter((action) => !['musicUrl', 'lyric', 'pic'].includes(action)))
    if (unexpectedActions.length) addCheck('capability-actions', 'warn', `声明了宿主未实现的能力：${[...new Set(unexpectedActions)].join('、')}`)
    const hasSearch = platforms.some((platform) => platform.actions.some((action) => /search|list|rank|top/i.test(action)))
    addCheck('no-search-capability', hasSearch ? 'warn' : 'pass',
      hasSearch ? '脚本声明了搜索类能力，需确认宿主适配器对接方式' : '脚本不自带搜索/榜单能力（符合预期：搜索与榜单由宿主平台适配器实现）')
  }

  await sleep(150)
  const initRequests = (request.requests || []).slice()
  addCheck('init-network', initRequests.length ? 'info' : 'pass',
    initRequests.length
      ? `初始化后脚本立即发起 ${initRequests.length} 个网络请求：${summarizeRequests(initRequests).join('；')}`
      : '初始化阶段没有网络请求')

  // 逐平台解析探测：验证平台曲目 ID 进入请求、解析返回 URL 或受控失败。
  const platformSummaries = []
  for (const platform of platforms.filter((item) => item.actions.includes('musicUrl'))) {
    const probe = PLATFORM_PROBES[platform.key] || PLATFORM_PROBES.local
    const quality = QUALITY_BY_PLATFORM[platform.key] ?? platform.qualitys[0] ?? null
    const before = (request.requests || []).length
    const response = await dispatch(harness, {
      source: platform.key,
      action: 'musicUrl',
      info: { type: platform.qualitys.length ? (quality || platform.qualitys[0]) : null, musicInfo: { ...probe } }
    })
    const chain = (request.requests || []).slice(before)
    const value = response?.ok ? response.value : null
    const error = response && !response.ok ? response.error : null
    const idEvidence = probe.hash || probe.songmid || probe.id
    const idSeen = chain.some((request) => request.url.includes(encodeURIComponent(idEvidence)) || request.url.includes(idEvidence))
    const resolved = typeof value === 'string' && /^https?:\/\//i.test(value)
    const detail = `${resolved ? `解析成功 ${value.slice(0, 60)}…` : `返回：${error || JSON.stringify(value)}`}；请求链：${summarizeRequests(chain).slice(0, 4).join(' → ') || '（无网络请求）'}`
    // 客户端契约判定：解析成功，或脚本在携带正确平台 ID 的请求后得到可预期的失败（服务侧问题）。
    let status
    if (resolved) status = chain.length && idEvidence && !idSeen ? 'warn' : 'pass'
    else if (chain.length === 0) status = 'warn'
    else status = idEvidence && idSeen ? 'pass' : 'fail'
    addCheck(`platform-resolve-${platform.key}`, status, detail + (idEvidence ? `；平台 ID ${idEvidence} ${idSeen ? '已出现在出站请求' : chain.length ? '未出现在出站请求' : '（无出站请求可核对）'}` : ''))
    platformSummaries.push({ key: platform.key, resolved, error, chain: summarizeRequests(chain) })
  }

  // 歌词 / 封面缓存行为：未解析过的曲目 ID 应拿不到歌词，已解析的应有缓存。
  const lyricPlatform = platforms.find((item) => item.actions.includes('lyric'))
  if (lyricPlatform) {
    const probe = PLATFORM_PROBES[lyricPlatform.key] || PLATFORM_PROBES.local
    const uncachedProbe = { ...probe, id: 'uncached-999999', songmid: undefined, hash: undefined }
    if (!uncachedProbe.id) uncachedProbe.songmid = 'uncached-999999'
    const miss = await dispatch(harness, { source: lyricPlatform.key, action: 'lyric', info: { musicInfo: uncachedProbe } })
    const hit = await dispatch(harness, { source: lyricPlatform.key, action: 'lyric', info: { musicInfo: { ...probe } } })
    const missText = miss?.ok ? JSON.stringify(miss.value) : `错误：${miss?.error}`
    const hitText = hit?.ok ? JSON.stringify(hit.value)?.slice(0, 120) : `错误：${hit?.error}`
    addCheck('lyric-cache-behavior', 'info', `未解析曲目 lyric → ${missText}；已解析曲目 lyric → ${hitText}`)
    const picResponse = await dispatch(harness, { source: lyricPlatform.key, action: 'pic', info: { musicInfo: { ...probe } } })
    addCheck('pic-cache-behavior', 'info', `pic → ${picResponse?.ok ? JSON.stringify(picResponse.value)?.slice(0, 120) : `错误：${picResponse?.error}`}`)
  }

  // 搜索 action：脚本协议不定义搜索，预期被拒绝。
  const anyPlatform = platforms[0]
  if (anyPlatform) {
    const response = await dispatch(harness, { source: anyPlatform.key, action: 'search', info: { musicInfo: { name: '测试' } } })
    addCheck('search-action-rejected', response && !response.ok ? 'pass' : 'warn',
      response && !response.ok ? `search 操作被拒绝：${response.error}` : '脚本接受了 search 操作，需核对其语义')
  }

  // 错误路径。
  if (anyPlatform?.actions.includes('musicUrl')) {
    const missingInfo = await dispatch(harness, { source: anyPlatform.key, action: 'musicUrl', info: { type: '320k', musicInfo: null } })
    addCheck('error-missing-music-info', missingInfo && !missingInfo.ok ? 'pass' : 'warn',
      missingInfo && !missingInfo.ok ? `缺少 musicInfo 被拒绝：${missingInfo.error}` : '缺少 musicInfo 未被拒绝')
    const missingType = await dispatch(harness, { source: anyPlatform.key, action: 'musicUrl', info: { type: null, musicInfo: { ...(PLATFORM_PROBES[anyPlatform.key] || PLATFORM_PROBES.local) } } })
    const rejected = missingType && !missingType.ok
    addCheck('error-missing-quality', rejected || anyPlatform.key === 'local' ? 'pass' : 'info',
      rejected ? `缺少音质被拒绝：${missingType.error}` : '缺少音质仍被接受（需核对是否符合协议）')
  }

  await sleep(100)
  await stopPump()
  const allRequests = request.requests || []
  const headerFindings = auditHeaders(allRequests)
  addCheck('header-audit', headerFindings.length ? 'fail' : 'pass',
    headerFindings.length ? headerFindings.join('；') : `共 ${allRequests.length} 个出站请求，无 Cookie/Authorization/Referer 类请求头`)

  return {
    scriptPath,
    scriptBytes: bytes,
    live,
    env,
    platforms,
    platformSummaries,
    checks,
    requests: allRequests.map((request) => ({ method: request.method, url: request.url, headers: request.headers }))
  }
}

function formatReport(report) {
  const statusIcon = { pass: '✓', fail: '✗', warn: '!', info: '-', blocked: '⊘' }
  const lines = []
  lines.push(`脚本：${report.scriptPath || '（内存）'}（${report.scriptBytes} 字节）`)
  lines.push(`模式：${report.live ? '真实网络（受本机出口策略限制）' : '离线夹具（仅客户端契约）'}`)
  for (const check of report.checks) {
    lines.push(`${statusIcon[check.status] || '?'} [${check.status}] ${check.name}：${check.detail}`)
  }
  lines.push('出站请求：')
  for (const request of report.requests) {
    lines.push(`  ${request.method} ${request.url}`)
    const customHeaders = Object.keys(request.headers || {}).filter((name) => !['accept'].includes(name.toLowerCase()))
    if (customHeaders.length) lines.push(`    请求头：${customHeaders.map((name) => `${name}=${String(request.headers[name]).slice(0, 40)}`).join(' ')}`)
  }
  return lines.join('\n')
}

async function main() {
  const args = process.argv.slice(2)
  const scriptPath = args.find((arg) => !arg.startsWith('--'))
  const live = args.includes('--live')
  const asJson = args.includes('--json')
  if (!scriptPath) {
    console.error('用法：node scripts/validate-source-script.cjs <脚本.js> [--live] [--json]')
    process.exit(2)
  }
  const scriptText = readFileSync(path.resolve(scriptPath), 'utf8')
  const report = await validateScript(scriptText, { live, scriptPath })
  if (asJson) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(formatReport(report))
    if (report.live) {
      const blocked = report.checks.filter((check) => /环境网络受限/.test(check.detail))
      if (blocked.length) console.log(`\n注意：${blocked.length} 项探测受本机出口网络策略影响，不能据此判断第三方服务可用性。`)
    }
  }
  process.exit(report.checks.some((check) => check.status === 'fail') ? 1 : 0)
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`验证失败：${error?.message || error}`)
    process.exit(1)
  })
}

module.exports = { validateScript, formatReport, fixtureResponse, FIXTURES }
