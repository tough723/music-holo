import { describe, expect, it, vi } from 'vitest'
import {
  buildCustomSourceCandidates,
  buildPlatformCandidates,
  findAlternativeSources,
  probeMediaUrl
} from '@/utils/sourceSwitch'
import {
  importPlaylistByLink,
  importTrackListText,
  parsePlaylistLink,
  parseTrackListText
} from '@/utils/playlistImport'

const song = { id: 7, title: '海阔天空', singerName: 'Beyond', album: '乐与怒', audioUrl: 'https://old.example.org/a.mp3' }

describe('快速换源', () => {
  it('展开自定义音源候选：平台 × 音质，local 不配音质', () => {
    const candidates = buildCustomSourceCandidates([{
      id: 'src-1',
      name: '星海',
      script: 'globalThis.lx',
      capabilities: {
        sources: [
          { key: 'wy', name: '网易云', actions: ['musicUrl', 'lyric'], qualities: ['128k', '320k'] },
          { key: 'local', name: '本地', actions: ['musicUrl'], qualities: [] }
        ]
      }
    }], song)
    expect(candidates.map((item) => item.quality)).toEqual(['128k', '320k', ''])
    expect(candidates.at(-1).platformKey).toBe('local')
  })

  it('探针只读取前几 KB，并按响应判定可用性', async () => {
    const okFetch = vi.fn().mockResolvedValue({ status: 206, headers: { get: () => 'audio/mpeg' } })
    expect(await probeMediaUrl('https://cdn.example.org/a.mp3', { fetchImpl: okFetch })).toMatchObject({ ok: true, status: 206 })
    expect(okFetch.mock.calls[0][1].headers).toEqual({ range: 'bytes=0-2047' })
    expect(okFetch.mock.calls[0][1].credentials).toBe('omit')

    const htmlFetch = vi.fn().mockResolvedValue({ status: 200, headers: { get: () => 'text/html' } })
    expect((await probeMediaUrl('https://cdn.example.org/a.mp3', { fetchImpl: htmlFetch })).ok).toBe(false)
    const failed = vi.fn().mockRejectedValue(new TypeError('network down'))
    expect((await probeMediaUrl('https://cdn.example.org/a.mp3', { fetchImpl: failed })).ok).toBe(false)
  })

  it('平台候选按当前曲目所属平台优先排序', () => {
    const candidates = buildPlatformCandidates({ ...song, sourcePlatformKey: 'kw' }, { platforms: ['wy', 'kw'] })
    expect(candidates.map((item) => item.platformKey)).toEqual(['kw', 'wy'])
    expect(buildPlatformCandidates(song, { platforms: ['wy', 'kw'] })[0].platformKey).toBe('wy')
  })

  it('没有可用音源时如实报告每个候选的失败原因', async () => {
    const result = await findAlternativeSources({ ...song, audioUrl: '' }, {
      sources: [],
      platforms: ['wy'],
      request: vi.fn().mockRejectedValue(new Error('接口返回 HTTP 403')),
      probe: false
    })
    expect(result.best).toBeNull()
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]).toMatchObject({ status: 'failed', kind: 'platform' })
    expect(result.candidates[0].error).toMatch('403')
  })

  it('当前地址可用时直接作为首选，不做任何替换', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 206, headers: { get: () => 'audio/mpeg' } })
    const result = await findAlternativeSources(song, { sources: [], platforms: [], fetchImpl, probe: true, request: vi.fn() })
    expect(result.best).toMatchObject({ kind: 'current', status: 'ok', url: song.audioUrl })
    expect(result.candidates).toHaveLength(1)
  })
})

describe('第三方歌单导入', () => {
  it('识别各平台歌单链接与纯 ID', () => {
    expect(parsePlaylistLink('https://music.163.com/#/playlist?id=123456')).toEqual({ platform: 'wy', id: '123456' })
    expect(parsePlaylistLink('https://music.163.com/playlist?id=2468123')).toEqual({ platform: 'wy', id: '2468123' })
    expect(parsePlaylistLink('https://m.kuwo.cn/h5/playlist/2603442581')).toEqual({ platform: 'kw', id: '2603442581' })
    expect(parsePlaylistLink('https://music.migu.cn/v3/music/playlist/179730639')).toEqual({ platform: 'mg', id: '179730639' })
    expect(parsePlaylistLink('https://y.qq.com/n/ryqq/playlist/8675309')).toEqual({ platform: 'tx', id: '8675309' })
    expect(parsePlaylistLink('123456')).toEqual({ platform: 'wy', id: '123456' })
    expect(parsePlaylistLink('随便一段文字')).toBeNull()
  })

  it('未接入的平台明确报错，不猜测或伪造曲目', async () => {
    await expect(importPlaylistByLink('https://y.qq.com/n/ryqq/playlist/8675309')).rejects.toThrow('歌单导入尚未接入')
    await expect(importPlaylistByLink('一段无法识别的文本')).rejects.toThrow('无法识别该链接')
  })

  it('文本清单解析成「歌名 - 歌手」并逐条搜索', async () => {
    expect(parseTrackListText('海阔天空 - Beyond\r\n今天\n\n  \n')).toEqual([
      { title: '海阔天空', artist: 'Beyond' },
      { title: '今天', artist: '' }
    ])
    const request = vi.fn().mockImplementation(async (url) => ({ statusCode: 200, headers: {}, body: JSON.stringify([{ id: 1, name: 'A', artist: 'B', album: 'Al' }]) }))
    const result = await importTrackListText('海阔天空 - Beyond', { platform: 'wy', request })
    expect(result.tracks).toHaveLength(1)
    expect(result.failed).toHaveLength(0)
    const failing = vi.fn().mockRejectedValue(new Error('HTTP 500'))
    const partial = await importTrackListText('A - B', { platform: 'wy', request: failing })
    expect(partial.tracks).toEqual([])
    expect(partial.failed[0]).toMatchObject({ title: 'A', artist: 'B' })
  })
})
