import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_CUSTOM_SOURCE_REQUEST_BYTES,
  MAX_CUSTOM_SOURCE_RESPONSE_BYTES,
  buildCustomSourceMusicInfo,
  mergeCustomSourceMusicInfo,
  normalizeLxSourceCapabilities,
  parseCustomSourceLyrics,
  performCustomSourceRequest,
  validateCustomSourceMediaUrl
} from '@/utils/customSourceRuntime'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('隔离自定义音源兼容检测', () => {
  it('只向自定义源传递最小公开曲目信息，不泄漏无关字段', () => {
    const info = buildCustomSourceMusicInfo({
      id: 42,
      title: '云端信使',
      singerName: '星港',
      album: '全息夜航',
      duration: 196,
      audioUrl: 'https://internal.example/secret-token',
      authorization: 'must-not-leak'
    })
    expect(info).toEqual({
      musicHoloId: '42',
      id: '42',
      title: '云端信使',
      name: '云端信使',
      singerName: '星港',
      singer: '星港',
      album: '全息夜航',
      duration: 196
    })
    expect(JSON.stringify(info)).not.toContain('secret-token')
    expect(JSON.stringify(info)).not.toContain('must-not-leak')
    expect(() => buildCustomSourceMusicInfo({ id: 1 })).toThrow('缺少有效标题')
  })

  it('合并可选的平台曲目 ID，同时保护曲库标题并拒绝凭据字段', () => {
    const merged = mergeCustomSourceMusicInfo({ id: 42, title: '云端信使', singerName: '星港' }, JSON.stringify({
      songmid: 'provider-song-42',
      id: 'attempted-override',
      title: 'attempted-title-override'
    }))
    expect(merged).toMatchObject({
      id: '42',
      musicHoloId: '42',
      title: '云端信使',
      name: '云端信使',
      songmid: 'provider-song-42'
    })
    expect(() => mergeCustomSourceMusicInfo({ id: 1, title: '歌曲' }, '{broken')).toThrow('有效 JSON')
    expect(() => mergeCustomSourceMusicInfo({ id: 1, title: '歌曲' }, '[]')).toThrow('JSON 对象')
    expect(() => mergeCustomSourceMusicInfo({ id: 1, title: '歌曲' }, '{"accessToken":"do-not-send"}')).toThrow('疑似凭据')
  })

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

  it('外部取消信号会中止浏览器网络请求', async () => {
    let requestSignal
    const fetchMock = vi.fn((_, options) => {
      requestSignal = options.signal
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true })
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const request = performCustomSourceRequest('https://api.example.org/song', {}, { signal: controller.signal })
    await Promise.resolve()
    controller.abort()

    await expect(request).rejects.toThrow('音源请求已取消')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(requestSignal.aborted).toBe(true)
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

  it('支持有界 multipart formData，且由浏览器生成 boundary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await performCustomSourceRequest('https://api.example.org/submit', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=source-controlled' },
      formData: { keyword: '星海', quality: '320k' }
    })
    const [, request] = fetchMock.mock.calls[0]
    expect(request.body).toBeInstanceOf(FormData)
    expect(request.headers.has('content-type')).toBe(false)
  })

  it('把 LX 歌词结果和多时间戳 LRC 规范化为播放器行', () => {
    expect(parseCustomSourceLyrics({ lyric: '[00:01.25]第一行\\n[00:02.00][00:03.00]重复行' })).toEqual([
      { time: 1.25, text: '第一行' },
      { time: 2, text: '重复行' },
      { time: 3, text: '重复行' }
    ])
    expect(parseCustomSourceLyrics([{ time: 2, text: '二' }, { time: 1, text: '一' }])).toEqual([
      { time: 1, text: '一' },
      { time: 2, text: '二' }
    ])
  })

  it('仅接受公网 HTTPS 试听 URL，拒绝内网与可执行协议', () => {
    expect(validateCustomSourceMediaUrl('https://cdn.example.org/music.mp3?token=abc')).toEqual({
      href: 'https://cdn.example.org/music.mp3?token=abc',
      origin: 'https://cdn.example.org'
    })
    expect(() => validateCustomSourceMediaUrl('http://cdn.example.org/music.mp3')).toThrow('公网 HTTPS')
    expect(() => validateCustomSourceMediaUrl('javascript:alert(1)')).toThrow('公网 HTTPS')
    expect(() => validateCustomSourceMediaUrl('https://localhost/music.mp3')).toThrow('公网 HTTPS')
    expect(() => validateCustomSourceMediaUrl('https://music-holo.example/music.mp3', { pageOrigin: 'https://music-holo.example' })).toThrow('同源')
    expect(() => validateCustomSourceMediaUrl('')).toThrow('没有返回')
  })

  it('响应超过 512 KB 会终止读取', async () => {
    const large = new Uint8Array(MAX_CUSTOM_SOURCE_RESPONSE_BYTES + 1)
    const fetchMock = vi.fn().mockResolvedValue(new Response(large, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(performCustomSourceRequest('https://api.example.org/large')).rejects.toThrow('超过 512 KB')
  })
})
