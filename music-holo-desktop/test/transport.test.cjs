const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Readable } = require('node:stream')
const https = require('node:https')
const { sourceRequest } = require('../transport.cjs')
const lookup = async () => [{ address: '8.8.8.8' }]
function stub(t, { status = 200, body = 'hello', headers = {} } = {}) {
  let captured
  t.mock.method(https, 'request', (url, options, callback) => {
    captured = { url, options }
    const request = new EventEmitter()
    request.setTimeout = () => {}; request.write = () => {}
    request.end = () => queueMicrotask(() => {
      const response = Readable.from([Buffer.from(body)])
      response.statusCode = status; response.headers = headers
      callback(response)
    })
    request.destroy = (error) => request.emit('error', error)
    return request
  })
  return () => captured
}
test('pins DNS for socket lookup and strips response cookies', async (t) => {
  const captured = stub(t, { headers: { 'set-cookie': ['secret'], 'content-type': 'text/plain' } })
  const response = await sourceRequest('https://example.com', {}, { lookup })
  assert.equal(response.body, 'hello'); assert.equal(response.headers['set-cookie'], undefined)
  const { options } = captured()
  assert.equal(options.agent, false)
  options.lookup('example.com', {}, (error, address, family) => { assert.equal(error, null); assert.equal(address, '8.8.8.8'); assert.equal(family, 4) })
  options.lookup('example.com', { all: true }, (error, addresses) => assert.deepEqual(addresses, [{ address: '8.8.8.8', family: 4 }]))
})
test('rejects redirects instead of forwarding to another host', async (t) => {
  stub(t, { status: 302, headers: { location: 'http://127.0.0.1' } })
  await assert.rejects(sourceRequest('https://example.com', {}, { lookup }), /重定向/)
})
test('bounds response size', async (t) => {
  stub(t, { body: 'a'.repeat(512 * 1024 + 1) })
  await assert.rejects(sourceRequest('https://example.com', {}, { lookup }), /512 KB/)
})
test('cancelled DNS cannot occupy a request slot indefinitely', async () => {
  const controller = new AbortController()
  const result = sourceRequest('https://example.com', {}, { signal: controller.signal, lookup: () => new Promise(() => {}) })
  controller.abort()
  await assert.rejects(result, /取消|超时/)
})
const zlib = require('node:zlib')
for (const [encoding, compress] of [['gzip', zlib.gzipSync], ['deflate', zlib.deflateSync], ['br', zlib.brotliCompressSync]]) {
  test(`decodes ${encoding} text while removing stale encoding headers`, async (t) => {
    const body = compress(Buffer.from('{"lyric":"你好"}'))
    stub(t, { body, headers: { 'content-encoding': encoding, 'content-length': String(body.length) } })
    const response = await sourceRequest('https://example.com', {}, { lookup })
    assert.equal(response.body, '{"lyric":"你好"}')
    assert.equal(response.headers['content-encoding'], undefined)
    assert.equal(Number(response.headers['content-length']), Buffer.byteLength(response.body))
  })
  test(`rejects ${encoding} decompression bombs`, async (t) => {
    stub(t, { body: compress(Buffer.alloc(512 * 1024 + 1, 97)), headers: { 'content-encoding': encoding } })
    await assert.rejects(sourceRequest('https://example.com', {}, { lookup }), /512 KB/)
  })
}
test('rejects corrupt and unsupported compressed bodies', async (t) => {
  for (const encoding of ['gzip', 'compress', 'gzip, br', 'constructor']) {
    stub(t, { body: 'not compressed', headers: { 'content-encoding': encoding } })
    await assert.rejects(sourceRequest('https://example.com', {}, { lookup }), /压缩/)
  }
})
test('HEAD can advertise compression without providing a body', async (t) => {
  stub(t, { body: '', headers: { 'content-encoding': 'gzip', 'content-length': '100' } })
  assert.equal((await sourceRequest('https://example.com', { method: 'HEAD' }, { lookup })).body, '')
})
