const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const vm = require('node:vm')
const script = readFileSync(join(__dirname, 'music-holo-local.js'), 'utf8')
function boot(request = () => { throw new Error('不应联网') }) {
  let handler, initialized
  vm.runInNewContext(script, { lx: {
    EVENT_NAMES: { request: 'request', inited: 'inited' },
    on(event, callback) { assert.equal(event, 'request'); handler = callback },
    send(event, data) { assert.equal(event, 'inited'); assert.ok(handler); initialized = data },
    request,
  } })
  return { initialized, call: (action, musicInfo, source = 'local') => handler({ source, action, info: { musicInfo } }), handler }
}
test('注册 local 能力，返回音频和封面直链', async () => {
  const { initialized, call } = boot()
  assert.deepEqual(JSON.parse(JSON.stringify(initialized.sources.local)), {
    name: '授权直链', type: 'music', actions: ['musicUrl', 'lyric', 'pic'], qualitys: [],
  })
  assert.equal(await call('musicUrl', { audioUrl: 'https://cdn.example.com/a.mp3' }), 'https://cdn.example.com/a.mp3')
  assert.equal(await call('pic', { coverUrl: 'https://cdn.example.com/a.jpg' }), 'https://cdn.example.com/a.jpg')
})
test('内联歌词和缺省字段', async () => {
  const { call } = boot()
  const result = await call('lyric', { lyric: '[00:00.000]你好', tlyric: 'hello' })
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { lyric: '[00:00.000]你好', tlyric: 'hello', rlyric: null, lxlyric: null })
  assert.equal((await call('lyric', {})).lyric, '')
  await assert.rejects(call('lyric', { lyric: {} }), /歌词文本/)
})
test('错误路径也返回 rejected Promise，不回退到不可信地址', async () => {
  const { call, handler } = boot()
  for (const url of [undefined, 'http://cdn.example.com/a', 'javascript:alert(1)', 'https://u:p@cdn.example.com/a', '/a.mp3', 'https://a\\b/c']) {
    await assert.rejects(call('musicUrl', { audioUrl: url }), /HTTPS/)
  }
  await assert.rejects(handler(), /local/)
  await assert.rejects(call('musicUrl', {}, 'kw'), /local/)
  await assert.rejects(call('search', {}), /操作/)
  await assert.rejects(call('pic', null), /musicInfo/)
  await assert.rejects(call('musicUrl', { songmid: '__proto__' }), /HTTPS/)
})
test('通过 lx.request 读取 LRC，兼容第三参数或 resp.body', async () => {
  for (const thirdArgument of [true, false]) {
    const { call } = boot((url, options, cb) => {
      assert.equal(url, 'https://cdn.example.com/a.lrc')
      assert.equal(options.method, 'GET')
      assert.equal(options.timeout, 10000)
      cb(null, { statusCode: 200, body: '\uFEFF[00:01.000]歌词' }, thirdArgument ? '[00:01.000]歌词' : undefined)
    })
    assert.equal((await call('lyric', { lyricUrl: 'https://cdn.example.com/a.lrc' })).lyric, '[00:01.000]歌词')
  }
})
test('网络、HTTP、响应格式和体积错误', async () => {
  for (const [error, response, pattern] of [
    [new Error('timeout'), null, /网络/],
    [null, { statusCode: 404, body: 'not found' }, /HTTP/],
    [null, { body: 'missing status' }, /HTTP/],
    [null, { statusCode: 200, body: {} }, /UTF-8/],
    [null, { statusCode: 200, body: 'x'.repeat(256 * 1024 + 1) }, /UTF-8/],
  ]) {
    const { call } = boot((url, options, cb) => cb(error, response))
    await assert.rejects(call('lyric', { lyricUrl: 'https://cdn.example.com/a.lrc' }), pattern)
  }
})
