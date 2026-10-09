// Unit harness only. Production untrusted scripts never run in Node vm.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { webcrypto } = require('node:crypto')
const worker = readFileSync(path.resolve(__dirname, '../../music-holo-web/src/utils/customSourceWorker.js'), 'utf8')
const tick = () => new Promise((resolve) => setImmediate(resolve))
function boot(script, env = 'desktop') {
  const messages = [], handlers = {}
  const globals = {
    postMessage: (message) => messages.push(structuredClone(message)),
    addEventListener: (name, handler) => { handlers[name] = handler },
    crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, Uint32Array, ArrayBuffer,
    URL, URLSearchParams, queueMicrotask, atob, btoa, console,
  }
  globals.self = globals
  vm.runInNewContext(worker, globals)
  const deliver = (data) => handlers.message({ data })
  deliver({ type: 'initialize', script, env, metadata: {} })
  return { messages, deliver }
}
const echo = `
const lx = globalThis.lx
let value
lx.on(lx.EVENT_NAMES.request, async () => value)
lx.request('https://api.example.com', {}, (error, response, body) => {
  value = { error: error?.message || null, body, same: response?.body === body, type: typeof body }
})
lx.send(lx.EVENT_NAMES.inited, { sources: { local: { name: 'test', type: 'music', qualitys: [], actions: ['musicUrl'] } } })
`
async function responseValue(body, env = 'desktop') {
  const h = boot(echo, env)
  const request = h.messages.find(({ type }) => type === 'source-request')
  h.deliver({ type: 'request-result', requestId: request.requestId, ok: true, response: { statusCode: 200, headers: {}, body } })
  h.deliver({ type: 'dispatch', eventName: 'request', data: {}, requestId: 'result' })
  await tick()
  const response = h.messages.find(({ type }) => type === 'source-response')
  assert.equal(response.ok, true)
  return response.value
}
test('desktop callback parses JSON regardless of content type and shares body argument', async () => {
  for (const body of ['{"url":"https://media.example.com/a"}', '[1,2]', 'null', 'false', '42', '"text"']) {
    const result = await responseValue(body)
    assert.deepEqual(result.body, JSON.parse(body))
    assert.equal(result.same, true)
  }
})
test('non-JSON text and web transport behavior remain unchanged', async () => {
  for (const body of ['[00:00.00]歌词', '/** @name 源 */', '{broken']) assert.equal((await responseValue(body)).body, body)
  const result = await responseValue('{"ready":true}', 'web-sandbox')
  assert.equal(result.body, '{"ready":true}')
  assert.equal(result.type, 'string')
})
test('on and send are awaitable without delaying handler registration', async () => {
  const h = boot(`
    const lx = globalThis.lx
    const onResult = lx.on(lx.EVENT_NAMES.request, async () => 'ok')
    const sendResult = lx.send(lx.EVENT_NAMES.inited, { sources: { local: { actions: ['musicUrl'], qualitys: [] } } })
    if (typeof onResult.then !== 'function' || typeof sendResult.then !== 'function') throw new Error('Promise contract missing')
    onResult.then(() => lx.request('https://api.example.com', {}, () => {}))
  `)
  h.deliver({ type: 'dispatch', eventName: 'request', data: {}, requestId: 'check' })
  await tick()
  assert.ok(!h.messages.some(({ type }) => type === 'source-error'))
  assert.ok(h.messages.some(({ type }) => type === 'source-request'))
  assert.equal(h.messages.find(({ type }) => type === 'source-response').value, 'ok')
})
test('independent fixture exercises Xinghai-style buffer, headers, extended platform and callbacks', async () => {
  const h = boot(`
    const { on, send, request, EVENT_NAMES, utils, env } = globalThis.lx
    if (env !== 'desktop' || typeof require !== 'undefined' || typeof process !== 'undefined' || typeof fetch !== 'undefined') throw new Error('unsafe environment')
    const client = utils.buffer.bufToString(utils.buffer.from('中文 client', 'utf-8'), 'base64')
    let ready = false
    on(EVENT_NAMES.request, async ({ action, info }) => {
      if (!ready || action !== 'musicUrl' || info.musicInfo.songmid !== 'fixture-id') throw new Error('invalid fixture request')
      return 'https://media.example.com/fixture.flac'
    })
    request('https://api.example.com/ping', { headers: { 'X-Token': client, 'X-Client': 'fixture', 'User-Agent': 'lx-music' } }, (error, response) => {
      if (error) throw error
      const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body
      ready = body.ready === true
      send(EVENT_NAMES.inited, { sources: { qs: { name: '扩展测试', type: 'music', actions: ['musicUrl'], qualitys: ['hires', 'spatial'] } } })
    })
  `)
  const network = h.messages.find(({ type }) => type === 'source-request')
  assert.equal(network.options.headers['X-Token'], Buffer.from('中文 client').toString('base64'))
  h.deliver({ type: 'request-result', requestId: network.requestId, ok: true, response: { statusCode: 200, body: '{"ready":true}' } })
  h.deliver({ type: 'dispatch', eventName: 'request', requestId: 'resolve', data: { source: 'qs', action: 'musicUrl', info: { type: 'hires', musicInfo: { songmid: 'fixture-id' } } } })
  await tick()
  assert.equal(h.messages.find(({ type }) => type === 'source-response').value, 'https://media.example.com/fixture.flac')
  assert.ok(!h.messages.some(({ type }) => type === 'source-error'))
})
