import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_CUSTOM_SOURCE_REQUEST_BYTES,
  MAX_CUSTOM_SOURCE_RESPONSE_BYTES,
  normalizeLxSourceCapabilities,
  performCustomSourceRequest
} from '@/utils/customSourceRuntime'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('隔离自定义音源兼容检测', () => {
  it('规范化 inited 声明且只返回安全展示字段', () => {
    const result = normalizeLxSourceCapabilities({
      sources: {
        kw: { name: '酷我测试源', type: 'music', actions: ['musicUrl', 'lyric'], qualitys: ['128k', '320k'], extra: 'ignored' },
        qq: { name: 'QQ 测试源', actions: { musicUrl: true, pic: true }, qualities: ['flac'] }
      },
      privateData: 'not exposed'
    })
    expect(result.sources).toEqual([
      { key: 'kw', name: '酷我测试源', type: 'music', actions: ['musicUrl', 'lyric'], qualities: ['128k', '320k'] },
      { key: 'qq', name: 'QQ 测试源', type: 'music', actions: ['musicUrl', 'pic'], qualities: ['flac'] }
    ])
    expect(result).not.toHaveProperty('privateData')
  })

  it('拒绝未声明平台、过多平台和无效声明结构', () => {
    expect(() => normalizeLxSourceCapabilities({})).toThrow('未声明 sources')
    expect(() => normalizeLxSourceCapabilities({ sources: {} })).toThrow('1–16')
    expect(() => normalizeLxSourceCapabilities({ sources: { kw: null } })).toThrow('声明格式无效')
    const tooMany = Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`source-${index}`, { name: `源${index}` }]))
    expect(() => normalizeLxSourceCapabilities({ sources: tooMany })).toThrow('1–16')
  })

  it('通过不带凭据、禁止重定向的 CORS 请求代理执行 HTTPS GET', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', {
      status: 200,
      headers: { 'content-type': 'text/plain', 'x-provider': 'unit-test' }
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await performCustomSourceRequest('https://api.example.org/song?format=json', {
      method: 'GET',
      headers: { 'x-client': 'Music Holo', cookie: 'should-be-removed', authorization: 'should-be-removed' }
    })
    expect(result).toMatchObject({ statusCode: 200, body: 'ok', headers: { 'x-provider': 'unit-test' } })
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.org/song?format=json', expect.objectContaining({
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    }))
    const [, request] = fetchMock.mock.calls[0]
    expect(request.headers.get('x-client')).toBe('Music Holo')
    expect(request.headers.has('cookie')).toBe(false)
    expect(request.headers.has('authorization')).toBe(false)
  })

  it('supports bounded form POST while refusing unsafe methods and internal targets', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await performCustomSourceRequest('https://api.example.org/login', { method: 'POST', form: { keyword: '星海' } })
    const [, request] = fetchMock.mock.calls[0]
    expect(request.body).toBe('keyword=%E6%98%9F%E6%B5%B7')
    expect(request.headers.get('content-type')).toContain('application/x-www-form-urlencoded')
    await expect(performCustomSourceRequest('https://api.example.org/song', { method: 'DELETE' })).rejects.toThrow('仅允许')
    await expect(performCustomSourceRequest('https://127.0.0.1/private')).rejects.toThrow('公网 HTTPS')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('请求体大小受限，过大的数据不会发出网络请求', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(performCustomSourceRequest('https://api.example.org/upload', {
      method: 'POST',
      body: 'x'.repeat(MAX_CUSTOM_SOURCE_REQUEST_BYTES + 1)
    })).rejects.toThrow('请求体超过 64 KB')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('响应超过 512 KB 会终止读取', async () => {
    const large = new Uint8Array(MAX_CUSTOM_SOURCE_RESPONSE_BYTES + 1)
    const fetchMock = vi.fn().mockResolvedValue(new Response(large, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(performCustomSourceRequest('https://api.example.org/large')).rejects.toThrow('超过 512 KB')
  })
})
