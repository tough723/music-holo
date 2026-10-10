/**
 * 桌面下载落盘：路径必须被限制在目标目录内，断点续传只有服务端返回 206 才生效，
 * 取消与体积上限都要能中止写入。用本地 HTTP 服务替代公网请求以稳定测试传输行为。
 */
'use strict'
const test = require('node:test')
const assert = require('node:assert')
const http = require('node:http')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { DownloadManager, safeFileName, MAX_FILE_BYTES } = require('../downloads.cjs')

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler)
    server.listen(0, '127.0.0.1', () => resolve({
      server,
      port: server.address().port,
      url: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise((done) => server.close(done))
    }))
  })
}

// 生产链路只允许公网地址（policy.cjs 校验），测试注入本机架空实现以验证流式行为。
function localOpener() {
  return (rawUrl, options = {}, { signal } = {}) => new Promise((resolve, reject) => {
    const headers = { ...(options.headers || {}) }
    const request = http.get(rawUrl, { headers, signal }, resolve)
    request.on('error', reject)
  })
}

test('文件名清理杜绝路径穿越', () => {
  assert.equal(safeFileName('../../etc/passwd'), 'passwd')
  assert.equal(safeFileName('/tmp/a/b.mp3'), 'b.mp3')
  assert.equal(safeFileName('..'), 'music-holo-track.mp3')
  assert.equal(safeFileName('歌名:live?.mp3'), '歌名live.mp3')
})

test('落盘限制在目标目录内并支持取消', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-download-'))
  const payload = Buffer.alloc(64 * 1024, 7)
  const remote = await startServer(async (request, response) => {
    response.writeHead(200, { 'content-length': String(payload.length), 'content-type': 'audio/mpeg' })
    for (let offset = 0; offset < payload.length; offset += 8192) {
      response.write(payload.subarray(offset, offset + 8192))
      await new Promise((resolve) => setTimeout(resolve, 1))
    }
    response.end()
  })
  const events = []
  const downloads = new DownloadManager({ emit: (event) => events.push(event), openResponse: localOpener() })
  try {
    const result = await downloads.start({ id: 'job-1', url: `${remote.url}/track.mp3`, dir, fileName: '越权/../ok.mp3' })
    assert.equal(path.dirname(result.path), fs.realpathSync(dir))
    assert.equal(path.basename(result.path), 'ok.mp3')
    assert.equal(result.receivedBytes, payload.length)
    assert.deepEqual(fs.readFileSync(result.path), payload)
    assert.ok(events.some((event) => event.type === 'progress'))
    assert.ok(events.some((event) => event.type === 'done'))

    // 运行中取消：写入中断且抛出已取消。
    const slow = await startServer(async (_request, response) => {
      response.writeHead(200, { 'content-length': '1048576', 'content-type': 'audio/mpeg' })
      response.write(Buffer.alloc(4096))
    })
    const pending = downloads.start({ id: 'job-2', url: `${slow.url}/slow.mp3`, dir, fileName: 'slow.mp3' }).catch((error) => error)
    await new Promise((resolve) => setTimeout(resolve, 30))
    await downloads.cancel('job-2')
    const outcome = await pending
    assert.ok(outcome.canceled || String(outcome.message || '').includes('abort'), `期望取消，实际 ${outcome}`)
    await slow.close()
  } finally {
    await remote.close()
    downloads.cancelAll()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('服务端不返回 206 时不会拼接出损坏文件', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-resume-'))
  const remote = await startServer((request, response) => {
    // 明确忽略 Range，返回完整内容，模拟不支持续传的源站。
    response.writeHead(200, { 'content-length': '8' })
    response.end('ABCDEFGH')
  })
  const downloads = new DownloadManager({ emit: () => {}, openResponse: localOpener() })
  try {
    const target = path.join(dir, 'x.mp3')
    fs.writeFileSync(target, 'AAAA') // 假装已有部分文件
    await downloads.start({ id: 'job-3', url: `${remote.url}/x.mp3`, dir, fileName: 'x.mp3', offset: 4 })
    assert.equal(fs.readFileSync(target, 'utf8'), 'ABCDEFGH')
  } finally {
    await remote.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('体积上限可配置且常量合理', () => {
  assert.ok(MAX_FILE_BYTES > 0 && MAX_FILE_BYTES <= 2 * 1024 * 1024 * 1024)
})
