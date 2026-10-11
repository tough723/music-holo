// 桌面端下载落盘：复用音源网络策略（公网 HTTP(S)、无凭据、不跟随重定向、DNS 校验），
// 支持断点续传（Range）、进度回传、并发上限、体积上限与取消。
//
// 只下载调用方本来就能播放的媒体地址：不做解密、不去 DRM、不绕过第三方限速。
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { pipeline } = require('node:stream/promises')
const { Transform } = require('node:stream')
const { openPublicResponse } = require('./transport.cjs')

const MAX_FILE_BYTES = 512 * 1024 * 1024
const MAX_ACTIVE = 4
const PROGRESS_INTERVAL_MS = 200

/** 只保留文件名本身：去掉目录分隔符与控制字符，避免写越权路径。 */
function safeFileName(value) {
  const base = path.basename(String(value || '').replace(/[\u0000-\u001f\u007f]/g, ''))
  const cleaned = base.replace(/[\\/:*?"<>|]/g, '').replace(/^\.+/, '').trim().slice(0, 120)
  return cleaned || 'music-holo-track.mp3'
}

class DownloadManager {
  /**
   * @param {object} options
   * @param {(event) => void} options.emit 进度/完成/失败事件（转发给渲染进程）
   * @param {(url, options, config) => Promise<import('node:http').IncomingMessage>} [options.openResponse]
   *        默认复用音源网络策略（公网地址校验、DNS 绑定、不跟随重定向）。
   *        测试可注入本地实现以验证流式行为。
   */
  constructor({ emit, openResponse = openPublicResponse } = {}) {
    this.emit = emit || (() => {})
    this.openResponse = openResponse
    this.active = new Map()
  }

  get running() {
    return this.active.size
  }

  /** 由主进程把所有落盘请求限制在用户选择/配置的目录内。 */
  resolvePath(dir, fileName) {
    const target = path.resolve(String(dir || ''), safeFileName(fileName))
    return target
  }

  async cancel(id) {
    const controller = this.active.get(String(id))?.controller
    if (!controller) return false
    controller.abort(new Error('已取消'))
    return true
  }

  cancelAll() {
    for (const entry of this.active.values()) entry.controller.abort(new Error('客户端正在退出'))
    this.active.clear()
  }

  async start({ id, url, dir, fileName, offset = 0 }) {
    const key = String(id)
    if (this.active.has(key)) throw new Error('该下载任务已在运行')
    if (this.active.size >= MAX_ACTIVE) throw new Error(`同时最多 ${MAX_ACTIVE} 个下载任务`)
    const target = this.resolvePath(dir, fileName)
    await fsp.mkdir(path.dirname(target), { recursive: true })
    const resumeFrom = Math.max(0, Number(offset) || 0)
    let existing = 0
    try {
      const stat = await fsp.stat(target)
      existing = stat.isFile() ? stat.size : 0
    } catch { existing = 0 }
    // 续传要求服务端真正返回 206，否则从头覆盖写，避免拼接出损坏文件。
    const startAt = resumeFrom > 0 && existing >= resumeFrom ? resumeFrom : 0
    const controller = new AbortController()
    const entry = { controller, target }
    this.active.set(key, entry)
    const signal = controller.signal
    let receivedBytes = startAt
    let totalBytes = 0
    let lastSent = 0
    try {
      const options = startAt > 0 ? { headers: { range: `bytes=${startAt}-` } } : {}
      const response = await this.openResponse(url, options, { signal })
      const partial = response.statusCode === 206
      const writeFrom = partial ? startAt : 0
      if (!partial) receivedBytes = 0
      const declared = Number(response.headers['content-length'])
      totalBytes = Number.isFinite(declared) && declared > 0 ? (partial ? writeFrom + declared : declared) : 0
      const meter = new Transform({
        transform(chunk, _encoding, callback) {
          receivedBytes += chunk.length
          if (receivedBytes > MAX_FILE_BYTES) {
            callback(new Error(`文件超过 ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB 上限，已中止`))
            return
          }
          const timestamp = Date.now()
          if (timestamp - lastSent >= PROGRESS_INTERVAL_MS) {
            lastSent = timestamp
            this.emitProgress?.({ id: key, receivedBytes, totalBytes })
          }
          callback(null, chunk)
        }
      })
      meter.emitProgress = (payload) => this.emit({ type: 'progress', ...payload })
      await pipeline(response, meter, fs.createWriteStream(target, { flags: partial ? 'a' : 'w' }))
      this.emit({ type: 'progress', id: key, receivedBytes, totalBytes: totalBytes || receivedBytes })
      this.emit({ type: 'done', id: key, path: target, receivedBytes })
      return { path: target, receivedBytes, totalBytes }
    } catch (error) {
      if (signal.aborted) {
        this.emit({ type: 'canceled', id: key, path: target, receivedBytes })
        return { canceled: true, path: target, receivedBytes }
      }
      this.emit({ type: 'failed', id: key, error: String(error?.message || error) })
      throw error
    } finally {
      this.active.delete(key)
    }
  }
}

module.exports = { DownloadManager, safeFileName, MAX_FILE_BYTES, MAX_ACTIVE }
