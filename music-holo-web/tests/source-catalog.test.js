import { describe, expect, it } from 'vitest'
import {
  fetchPlatformChartTracks,
  fetchPlatformPlaylist,
  fetchPlatformTrackExtras,
  getCatalogAdapter,
  listCatalogPlatforms,
  listPlatformCharts,
  searchPlatformTracks
} from '@/utils/sourceCatalog'
import { parseLooseJson } from '@/utils/sourceCatalog/looseJson'

function fixtureRequest(routes) {
  const calls = []
  const request = async (url, options = {}) => {
    calls.push({ url, options })
    for (const [pattern, response] of routes) {
      const matched = typeof pattern === 'function' ? pattern(url, options) : String(url).includes(pattern)
      if (matched) {
        return typeof response === 'function' ? response(url, options) : response
      }
    }
    throw new Error(`未预期的请求：${url}`)
  }
  request.calls = calls
  return request
}

const ok = (body) => ({ statusCode: 200, headers: {}, body: typeof body === 'string' ? body : JSON.stringify(body) })

describe('平台曲目适配器（搜索 / 榜单 / 附加信息）', () => {
  it('列出平台能力元数据，明确标注是否实测', () => {
    const platforms = listCatalogPlatforms()
    const wy = platforms.find((item) => item.key === 'wy')
    expect(wy).toMatchObject({ supportsSearch: true, supportsCharts: true, supportsExtras: true })
    expect(wy.verified).toBeTruthy()
    expect(platforms.find((item) => item.key === 'tx').verified).toBeNull()
    expect(platforms.find((item) => item.key === 'qs').supportsSearch).toBe(true)
    expect(getCatalogAdapter('local')).toBeNull()
  })

  it('wy 搜索把 GD 结果映射为真实网易曲目 ID（id 字段）', async () => {
    const request = fixtureRequest([['types=search', ok([
      { id: '347230', name: '海阔天空', artist: ['Beyond'], album: '海阔天空', source: 'netease' },
      { id: '347351', name: '海阔天空', artist: ['Beyond'], album: '乐与怒', source: 'netease' }
    ])]])
    const tracks = await searchPlatformTracks('wy', '海阔天空', { request })
    expect(tracks).toHaveLength(2)
    expect(tracks[0].musicInfo).toEqual({
      id: '347230',
      name: '海阔天空',
      singer: 'Beyond',
      albumName: '海阔天空'
    })
    expect(request.calls[0].url).toContain('types=search')
    expect(request.calls[0].url).toContain('name=')
  })

  it('wy 榜单：榜单列表与曲目都产出可用平台 ID，时长转为秒', async () => {
    const request = fixtureRequest([
      ['toplist/detail', ok({ list: [{ id: 3778678, title: '热歌榜', updateFrequency: '每天更新', coverImgUrl: 'https://img.example/cover.jpg' }] })],
      ['playlist/detail?id=3778678', ok({
        result: {
          tracks: [{
            id: 287398,
            name: '我不难过',
            artists: [{ name: '孙燕姿' }],
            album: { name: '未完成' },
            duration: 320400
          }]
        }
      })]
    ])
    const charts = await listPlatformCharts('wy', { request })
    expect(charts).toEqual([{ id: '3778678', name: '热歌榜', updateFrequency: '每天更新', coverUrl: 'https://img.example/cover.jpg' }])
    const tracks = await fetchPlatformChartTracks('wy', '3778678', { request })
    expect(tracks[0].musicInfo).toEqual({
      id: '287398',
      name: '我不难过',
      singer: '孙燕姿',
      albumName: '未完成',
      interval: 320
    })
  })

  it('kw 搜索解析酷我松散单引号响应，songmid 为 MUSICRID 去前缀', async () => {
    const body = "{'abslist':[{'MUSICRID':'MUSIC_5886682','SONGNAME':'海阔天空','ARTIST':'BEYOND','ALBUM':'乐与怒','ALBUMID':'2676','DURATION':'324'}],'HIT':'3600'}"
    const request = fixtureRequest([['search.kuwo.cn', ok(body)]])
    const tracks = await searchPlatformTracks('kw', '海阔天空', { request })
    expect(tracks[0].musicInfo).toMatchObject({
      songmid: '5886682',
      id: '5886682',
      name: '海阔天空',
      singer: 'BEYOND',
      albumName: '乐与怒',
      interval: 324
    })
  })

  it('kg 搜索映射 hash/albumId/_types 分音质哈希', async () => {
    const request = fixtureRequest([['mobileservice.kugou.com', ok({
      status: 1,
      data: {
        info: [{
          hash: 'c41e80a18d1448fa47086372999c7f43',
          '320hash': 'ab32bec731cdbd5b0009e47978bd156c',
          sqhash: 'ef79af82f05aa5242ab2aaa22ca7de78',
          album_id: '973001',
          audio_id: 298386791,
          songname: '海阔天空',
          singername: 'BEYOND',
          album_name: '乐与怒',
          duration: 319
        }]
      }
    })]])
    const tracks = await searchPlatformTracks('kg', '海阔天空', { request })
    expect(tracks[0].musicInfo).toMatchObject({
      hash: 'c41e80a18d1448fa47086372999c7f43',
      albumId: '973001',
      songmid: '298386791',
      interval: 319
    })
    expect(tracks[0].musicInfo._types).toEqual({
      '128k': { hash: 'c41e80a18d1448fa47086372999c7f43' },
      '320k': { hash: 'ab32bec731cdbd5b0009e47978bd156c' },
      flac: { hash: 'ef79af82f05aa5242ab2aaa22ca7de78' }
    })
  })

  it('mg 搜索只用 id 作 songmid（contentId 实测会被星海后端拒绝）', async () => {
    const request = fixtureRequest([['pd.musicapp.migu.cn', ok({
      code: '000000',
      songResultData: {
        result: [{
          id: '1135162566',
          contentId: '600913000009337537',
          name: '海阔天空',
          singers: [{ id: '1574', name: 'Beyond' }],
          albums: [{ id: '1133556323', name: 'Beyond 24K Mastersonic Compilation' }],
          lyricUrl: 'https://d.musicapp.migu.cn/data/oss/resource/lrc',
          imgItems: [{ imgSizeType: '03', img: 'https://d.musicapp.migu.cn/cover.webp' }]
        }]
      }
    })]])
    const tracks = await searchPlatformTracks('mg', '海阔天空', { request })
    expect(tracks[0].musicInfo).toMatchObject({ songmid: '1135162566', id: '1135162566' })
    expect(tracks[0].musicInfo.songmid).not.toBe('600913000009337537')
    expect(tracks[0].extras).toEqual({
      lyricUrl: 'https://d.musicapp.migu.cn/data/oss/resource/lrc',
      coverUrl: 'https://d.musicapp.migu.cn/cover.webp'
    })
  })

  it('wy 附加信息：歌词与封面可选获取，失败不影响', async () => {
    const request = fixtureRequest([
      ['types=lyric', ok({ lyric: '[00:00.000]今天我 寒夜里看雪飘过', tlyric: '' })],
      ['types=pic', ok({ url: 'https://p2.music.126.net/cover.jpg' })]
    ])
    const extras = await fetchPlatformTrackExtras('wy', { musicInfo: { id: '347230' } }, { request })
    expect(extras).toEqual({
      lyric: '[00:00.000]今天我 寒夜里看雪飘过',
      coverUrl: 'https://p2.music.126.net/cover.jpg'
    })
    const empty = fixtureRequest([['types=lyric', { statusCode: 500, headers: {}, body: 'oops' }], ['types=pic', { statusCode: 500, headers: {}, body: 'oops' }]])
    expect(await fetchPlatformTrackExtras('wy', { musicInfo: { id: '347230' } }, { request: empty })).toEqual({})
    expect(await fetchPlatformTrackExtras('local', { musicInfo: {} }, { request: empty })).toEqual({})
  })

  it('qs 平台搜索明确未接入，不猜 ID', async () => {
    // 汽水音乐没有公开免凭据检索接口，第三方解析都要求自备 token，因此不内置密钥。
    await expect(searchPlatformTracks('qs', '海阔天空', { request: fixtureRequest([]) })).rejects.toThrow('没有公开免凭据的搜索接口')
    await expect(searchPlatformTracks('unknown-platform', 'x', { request: fixtureRequest([]) })).rejects.toThrow('未接入')
    // 卡片里如实标注每个平台的实测状态，避免把文档当成可用性证明。
    const platforms = listCatalogPlatforms()
    expect(platforms.find((item) => item.key === 'wy')?.verified).toBe('2026-10-10')
    expect(platforms.find((item) => item.key === 'qs')?.verified).toBe(null)
    expect(platforms.find((item) => item.key === 'wy')?.supportsResolveUrl).toBe(true)
    expect(platforms.find((item) => item.key === 'kw')?.supportsPlaylist).toBe(true)
    expect(platforms.find((item) => item.key === 'qs')?.supportsPlaylist).toBe(false)
  })

  it('酷我榜单已接入，咪咕/汽水榜单仍明确未接入', async () => {
    const request = fixtureRequest([['rank/list', ok({ data: [{ id: '93', label: '酷我飙升榜', pic: 'https://img.kuwo.cn/x.png' }] })]])
    await expect(listPlatformCharts('kw', { request })).resolves.toEqual([{ id: '93', name: '酷我飙升榜', updateFrequency: '', coverUrl: 'https://img.kuwo.cn/x.png' }])
    await expect(listPlatformCharts('mg', { request: fixtureRequest([]) })).rejects.toThrow('榜单尚未接入')
    await expect(listPlatformCharts('qs', { request: fixtureRequest([]) })).rejects.toThrow('榜单尚未接入')
  })

  it('歌单导入只走公开端点，未接入平台明确报错', async () => {
    const request = fixtureRequest([['/api/playlist/detail', ok({
      result: { name: '测试歌单', coverImgUrl: 'https://p1.music.126.net/a.jpg', tracks: [{ id: 1, name: 'A', artists: [{ name: 'S' }], album: { name: 'Al' }, duration: 200000 }] }
    })]])
    const playlist = await fetchPlatformPlaylist('wy', '123', { request })
    expect(playlist).toMatchObject({ name: '测试歌单', verified: true })
    expect(playlist.tracks[0]).toMatchObject({ platform: 'wy', name: 'A', singer: 'S', album: 'Al' })
    expect(playlist.tracks[0].musicInfo.id).toBe('1')
    await expect(fetchPlatformPlaylist('qs', '1', { request: fixtureRequest([]) })).rejects.toThrow('歌单导入尚未接入')
    await expect(fetchPlatformPlaylist('wy', '', { request })).rejects.toThrow('歌单 ID')
  })

  it('宽松 JSON 解析器兼容单引号响应并拒绝空响应', () => {
    expect(parseLooseJson("{'a':'b','c':[1,{'d':'e'}]}")).toEqual({ a: 'b', c: ['1', { d: 'e' }] })
    expect(parseLooseJson('{"a":1}')).toEqual({ a: 1 })
    expect(parseLooseJson("{'a':'海阔天空'}")).toEqual({ a: '海阔天空' })
    expect(() => parseLooseJson('')).toThrow('空响应')
    expect(() => parseLooseJson("{'a':")).toThrow()
  })
})
