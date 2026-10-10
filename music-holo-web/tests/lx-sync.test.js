import { describe, expect, it, vi } from 'vitest'
import {
  buildSnapshot,
  createSnapshotKey,
  createSyncClient,
  decryptSnapshot,
  encryptSnapshot,
  mergeSnapshots,
  normalizeSyncBaseUrl
} from '@/utils/lxSync'

const PASSWORD = 'sync-passphrase-2026'

describe('LX 风格同步快照', () => {
  it('快照密钥随机且 URL 安全', () => {
    const first = createSnapshotKey()
    const second = createSnapshotKey()
    expect(first).not.toBe(second)
    expect(first).toMatch(/^[A-Za-z0-9_-]{20,}$/)
  })

  it('同步地址必须是 HTTPS，本机 HTTP 需显式放行', () => {
    expect(normalizeSyncBaseUrl('https://sync.example.org/')).toBe('https://sync.example.org')
    expect(() => normalizeSyncBaseUrl('http://sync.example.org')).toThrow('HTTPS')
    expect(() => normalizeSyncBaseUrl('ftp://sync.example.org')).toThrow('HTTP(S)')
    expect(() => normalizeSyncBaseUrl('http://127.0.0.1:9527')).toThrow('本机 HTTP')
    expect(normalizeSyncBaseUrl('http://127.0.0.1:9527', { allowInsecure: true })).toBe('http://127.0.0.1:9527')
    expect(() => normalizeSyncBaseUrl('')).toThrow('请填写')
  })

  it('快照加密后服务端看不到明文，错误口令无法解密', async () => {
    const snapshot = buildSnapshot({
      favorites: [{ id: 1, title: '海阔天空' }],
      queue: [{ id: 2, title: '今天' }],
      customSources: [{ id: 's1', name: '星海', script: 'secret-body' }]
    })
    const blob = await encryptSnapshot(snapshot, PASSWORD)
    // 密文里不能出现任何明文字段。
    const serialized = JSON.stringify(blob)
    expect(serialized).not.toContain('海阔天空')
    expect(serialized).not.toContain('secret-body')
    expect(blob.alg).toBe('PBKDF2-SHA256/AES-GCM')

    const restored = await decryptSnapshot(blob, PASSWORD)
    expect(restored.favorites).toEqual([{ id: 1, title: '海阔天空' }])
    await expect(decryptSnapshot(blob, 'wrong-pass')).rejects.toThrow('解密失败')
    await expect(decryptSnapshot({ ...blob, salt: 'AAAA' }, PASSWORD)).rejects.toThrow('解密失败')
    await expect(decryptSnapshot(null, PASSWORD)).rejects.toThrow('格式无效')
  })

  it('默认不上传音源脚本全文，队列过滤掉本地与临时自定义源', () => {
    const snapshot = buildSnapshot({
      queue: [
        { id: '1', title: '曲库歌曲' },
        { id: '2', title: '本地文件', isLocal: true },
        { id: '3', title: '临时自定义源', isCustomSource: true }
      ],
      customSources: [{ id: 's1', name: '星海', script: 'body', homepage: 'https://example.org' }]
    })
    expect(snapshot.queue.map((song) => song.id)).toEqual(['1'])
    expect(snapshot.customSources[0].script).toBeUndefined()
    expect(snapshot.customSources[0].homepage).toBe('https://example.org')
    const withScripts = buildSnapshot({ customSources: [{ id: 's1', script: 'body' }], includeSourceScripts: true })
    expect(withScripts.customSources[0].script).toBe('body')
  })

  it('合并策略：merge 取并集，local / remote 单向覆盖', () => {
    const local = { favorites: [{ id: 1 }], queue: [{ id: 'a' }], preferences: { theme: 'dark', volume: 0.5 } }
    const remote = { favorites: [{ id: 1 }, { id: 2 }], queue: [{ id: 'b' }], preferences: { theme: 'light', extra: 1 } }
    expect(mergeSnapshots(local, remote, 'merge').favorites).toHaveLength(2)
    expect(mergeSnapshots(local, remote, 'merge').queue.map((song) => song.id).sort()).toEqual(['a', 'b'])
    // 偏好以本地为准，远程字段作为补充。
    expect(mergeSnapshots(local, remote, 'merge').preferences).toEqual({ theme: 'dark', volume: 0.5, extra: 1 })
    expect(mergeSnapshots(local, remote, 'local').favorites).toHaveLength(1)
    expect(mergeSnapshots(local, remote, 'remote').favorites).toHaveLength(2)
    // 收藏按 id 去重，不喜欢按更新时间取新。
    expect(mergeSnapshots({ dislikes: [{ id: 1, updatedAt: 1, rule: 'old' }] }, { dislikes: [{ id: 1, updatedAt: 2, rule: 'new' }] }, 'merge').dislikes[0].rule).toBe('new')
  })

  it('同步客户端只访问配置的地址，不带登录态，并上传加密快照', async () => {
    const calls = []
    let remotePayload = null
    const fetchImpl = vi.fn(async (url, options = {}) => {
      calls.push({ url, options })
      if (String(url).includes('/snapshot?key=')) {
        return new Response(JSON.stringify(remotePayload ? { data: remotePayload, time: '2026-10-10T00:00:00Z' } : {}), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({ time: '2026-10-10T01:00:00Z' }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const client = createSyncClient({ baseUrl: 'https://sync.example.org', key: 'key-1', password: PASSWORD, token: 'tok', fetchImpl })
    const local = buildSnapshot({ favorites: [{ id: 1 }] })

    const first = await client.sync(local)
    expect(first.remoteEmpty).toBe(true)
    const uploadCall = calls.at(-1)
    expect(uploadCall.url).toBe('https://sync.example.org/snapshot')
    expect(uploadCall.options.method).toBe('POST')
    expect(uploadCall.options.credentials).toBe('omit')
    expect(uploadCall.options.headers.authorization).toBe('Bearer tok')
    // 上传体里只有密文：任何明文都不能出现。
    const body = JSON.parse(uploadCall.options.body)
    expect(body.key).toBe('key-1')
    expect(JSON.stringify(body.data)).not.toContain('海阔天空')

    // 远程已有快照：拉取 → 解密 → 合并 → 回传。
    remotePayload = await encryptSnapshot(buildSnapshot({ favorites: [{ id: 2 }] }), PASSWORD)
    const second = await client.sync(local, { strategy: 'merge' })
    expect(second.snapshot.favorites).toHaveLength(2)
    expect(second.remoteEmpty).toBe(false)
    expect(second.remoteUpdatedAt).toBe('2026-10-10T00:00:00Z')

    // 口令不一致时解密失败，不会静默采用远程数据。
    const wrong = createSyncClient({ baseUrl: 'https://sync.example.org/', key: 'key-1', password: 'other', fetchImpl })
    await expect(wrong.fetchSnapshot()).rejects.toThrow('解密失败')
  })

  it('服务端错误与非法响应都会被转成明确错误', async () => {
    const failing = createSyncClient({
      baseUrl: 'https://sync.example.org',
      key: 'k',
      password: PASSWORD,
      fetchImpl: vi.fn(async () => new Response('nope', { status: 500 }))
    })
    await expect(failing.fetchSnapshot()).rejects.toThrow('HTTP 500')
    const notJson = createSyncClient({
      baseUrl: 'https://sync.example.org',
      key: 'k',
      password: PASSWORD,
      fetchImpl: vi.fn(async () => new Response('正在维护', { status: 200 }))
    })
    await expect(notJson.fetchSnapshot()).rejects.toThrow('不是 JSON')
    expect(() => createSyncClient({ baseUrl: 'https://sync.example.org', key: '', password: PASSWORD })).toThrow('快照密钥')
  })
})
