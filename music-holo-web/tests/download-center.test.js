import { describe, expect, it, vi } from 'vitest'
import {
  DOWNLOAD_STATES,
  MAX_DOWNLOAD_ATTEMPTS,
  buildDownloadFileName,
  createDownloadEngine,
  createWebDownloadWriter,
  sanitizeFileNamePart
} from '@/utils/downloadCenter'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function deferredWriter({ failTimes = 0, chunks = [1024, 2048] } = {}) {
  let calls = 0
  return {
    get calls() { return calls },
    async write(_task, { onProgress }) {
      calls += 1
      if (calls <= failTimes) throw new Error(`网络错误 ${calls}`)
      let received = 0
      for (const size of chunks) {
        received += size
        onProgress?.({ receivedBytes: received, totalBytes: chunks.reduce((sum, item) => sum + item, 0) })
      }
      return { ok: true }
    }
  }
}

describe('下载中心', () => {
  it('文件名模板与非法字符处理', () => {
    expect(sanitizeFileNamePart('a/b:c*d?')).toBe('abcd')
    expect(sanitizeFileNamePart('   ')).toBe('unknown')
    expect(buildDownloadFileName('{artist} - {title}', {
      song: { title: '海阔天空', singerName: 'Beyond' },
      extension: 'mp3'
    })).toBe('Beyond - 海阔天空.mp3')
    expect(buildDownloadFileName('{index}. {platform} - {album}', {
      song: { title: 'X', singerName: 'Y', album: 'Z' },
      sourcePlatform: '网易云音乐',
      extension: 'flac'
    }, 3)).toBe('03. 网易云音乐 - Z.flac')
    // 模板占位符非法字符也要被清理，不能拼出路径分隔符。
    expect(buildDownloadFileName('{artist}/{title}', { song: { title: 'a', singerName: 'b' } })).toBe('ba.mp3')
  })

  it('按并发上限排队执行，完成后自动接上下一个', async () => {
    const writer = deferredWriter()
    const engine = createDownloadEngine({ writer: writer.write, concurrency: 1 })
    const [first, second] = engine.enqueue([
      { url: 'https://cdn.example.org/1.mp3', song: { title: 'A' } },
      { url: 'https://cdn.example.org/2.mp3', song: { title: 'B' } }
    ])
    expect(engine.stats().downloading).toBe(1)
    expect(engine.get(second.id).state).toBe(DOWNLOAD_STATES.QUEUED)
    await vi.waitFor(async () => {
      await flush()
      expect(engine.get(first.id).state).toBe(DOWNLOAD_STATES.COMPLETED)
      expect(engine.get(second.id).state).toBe(DOWNLOAD_STATES.COMPLETED)
    })
    expect(engine.stats()).toMatchObject({ completed: 2, downloading: 0, queued: 0, total: 2 })
    engine.destroy()
  })

  it('记录进度、体积与速度统计', async () => {
    const writer = deferredWriter({ chunks: [1024, 2048] })
    const engine = createDownloadEngine({ writer: writer.write, concurrency: 2 })
    const [task] = engine.enqueue({ url: 'https://cdn.example.org/a.mp3', song: { title: 'A' } })
    await vi.waitFor(async () => {
      await flush()
      expect(engine.get(task.id).state).toBe(DOWNLOAD_STATES.COMPLETED)
    })
    const done = engine.get(task.id)
    expect(done.receivedBytes).toBe(3072)
    expect(done.totalBytes).toBe(3072)
    expect(done.progress).toBe(100)
    expect(engine.stats().receivedBytes).toBe(3072)
    engine.destroy()
  })

  it('失败会自动重试，超过上限后标记为失败', async () => {
    vi.useFakeTimers()
    try {
      const writer = deferredWriter({ failTimes: MAX_DOWNLOAD_ATTEMPTS })
      const engine = createDownloadEngine({ writer: writer.write, concurrency: 1 })
      const [task] = engine.enqueue({ url: 'https://cdn.example.org/retry.mp3', song: { title: 'R' } })
      for (let round = 0; round < MAX_DOWNLOAD_ATTEMPTS; round += 1) {
        await vi.advanceTimersByTimeAsync(10000)
        await Promise.resolve()
      }
      expect(engine.get(task.id).state).toBe(DOWNLOAD_STATES.FAILED)
      expect(engine.get(task.id).error).toMatch('网络错误')
      expect(engine.get(task.id).attempts).toBe(MAX_DOWNLOAD_ATTEMPTS)
      engine.destroy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('暂停/继续/取消/移除的状态流转', async () => {
    const writer = deferredWriter()
    const engine = createDownloadEngine({ writer: writer.write, concurrency: 2 })
    const [first] = engine.enqueue({ url: 'https://cdn.example.org/p1.mp3', song: { title: 'P1' } })
    const [second] = engine.enqueue({ url: 'https://cdn.example.org/p2.mp3', song: { title: 'P2' } })
    expect(engine.pause(second.id)).toBe(true)
    expect(engine.get(second.id).state).toBe(DOWNLOAD_STATES.PAUSED)
    expect(engine.resume(second.id)).toBe(true)
    expect(engine.cancel(first.id)).toBe(true)
    await vi.waitFor(async () => {
      await flush()
      expect([DOWNLOAD_STATES.CANCELED, DOWNLOAD_STATES.COMPLETED]).toContain(engine.get(first.id).state)
    })
    expect(engine.remove(second.id)).toBe(true)
    expect(engine.get(second.id)).toBeNull()
    // 已完成的任务不能被取消。
    expect(engine.cancel('missing-id')).toBe(false)
    engine.clearFinished()
    engine.destroy()
  })

  it('网页端 writer 流式读取并在超出上限时中止', async () => {
    const chunks = [new Uint8Array(10), new Uint8Array(20)]
    const response = {
      ok: true,
      status: 200,
      headers: { get: (name) => (name === 'content-length' ? '30' : 'audio/mpeg') },
      body: {
        getReader: () => {
          let index = 0
          return {
            read: async () => (index < chunks.length ? { done: false, value: chunks[index++] } : { done: true }),
            cancel: async () => {},
            releaseLock: () => {}
          }
        }
      }
    }
    const fetchImpl = vi.fn().mockResolvedValue(response)
    const saveBlob = vi.fn()
    const writer = createWebDownloadWriter({ fetchImpl, saveBlob, maxBytes: 1024 })
    const progress = []
    await writer({ url: 'https://cdn.example.org/x.mp3', totalBytes: 0 }, { onProgress: (event) => progress.push(event) })
    expect(saveBlob).toHaveBeenCalledTimes(1)
    expect(progress.at(-1)).toMatchObject({ receivedBytes: 30, totalBytes: 30 })
    expect(String(fetchImpl.mock.calls[0][1].credentials)).toBe('omit')

    const bigResponse = { ...response, body: null, arrayBuffer: async () => new ArrayBuffer(2048) }
    await expect(createWebDownloadWriter({
      fetchImpl: vi.fn().mockResolvedValue(bigResponse),
      saveBlob,
      maxBytes: 1024
    })({ url: 'https://cdn.example.org/big.mp3' }, {})).rejects.toThrow('上限')
  })
})
