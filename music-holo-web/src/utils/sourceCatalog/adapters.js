// 平台适配器：搜索 / 榜单 / 歌词封面。与 LX 音源脚本解耦——脚本只负责解析播放地址，
// 平台曲目 ID 由这里的适配器按各平台真实字段生成。均使用公开无凭据接口，
// 不内置密钥；受控网络桥的安全限制（桌面逐域名授权、无 Referer/Cookie 等）继续生效。
//
// 各平台 musicInfo 字段经过 2026-10-10 真实接口验证（详见 docs/xinghai-validation.md）：
// - wy: id 为网易云数字曲目 ID（如 347230），GD 与星海后端均只认它；
// - kw: songmid 为酷我 rid（MUSICRID 去掉前缀）；
// - kg: hash/albumId 为主哈希与专辑 ID，_types 为分音质哈希；
// - mg: songmid 必须是搜索结果的 id 字段（contentId 会被后端拒绝）；
// - tx: songmid 为 QQ mid（接口需 Referer 热链头，受控桥禁止发送，实测未通过）。

import { requestJson, requestText } from './transport'

const clean = (value, max = 180) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max)
const firstText = (value) => {
  if (Array.isArray(value)) return value.map((item) => (item && typeof item === 'object' ? item.name || item.title || '' : item)).filter(Boolean).join(' / ').slice(0, 120)
  return clean(value, 120)
}
const durationSeconds = (value) => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 && number <= 3600 ? Math.round(number) : 0
}

function gdUrl(types, params = {}) {
  const query = new URLSearchParams({ types, source: 'netease', ...params })
  return `https://music-api.gdstudio.xyz/api.php?${query.toString()}`
}

// ---------------------------------------------------------------------------
// 网易云音乐（wy）：搜索与歌词/封面走 GD 公开接口，榜单走网易云公开榜单接口。
// 2026-10-10 实测：搜索返回真实曲目 ID；types=url&br=320 返回 320k 直链；
// types=lyric 返回 LRC；types=pic 返回封面；toplist/detail 与 playlist/detail 可用。
// ---------------------------------------------------------------------------
async function searchWy(query, { request, limit = 10, signal }) {
  const data = await requestJson(request, gdUrl('search', { name: query }), { signal })
  const list = Array.isArray(data) ? data : []
  return list.slice(0, limit).map((item) => ({
    platform: 'wy',
    name: clean(item.name),
    singer: firstText(item.artist),
    album: clean(item.album),
    duration: 0,
    musicInfo: {
      id: String(item.id ?? ''),
      name: clean(item.name),
      singer: firstText(item.artist),
      albumName: clean(item.album)
    }
  })).filter((track) => track.name && track.musicInfo.id)
}

async function listWyCharts(options) {
  const { request, signal } = options
  const data = await requestJson(request, 'https://music.163.com/api/toplist/detail', { signal })
  const list = Array.isArray(data?.list) ? data.list : []
  return list.filter((item) => item?.id && item?.title).slice(0, 12).map((item) => ({
    id: String(item.id),
    name: clean(item.title, 80),
    updateFrequency: clean(item.updateFrequency, 40),
    coverUrl: clean(item.coverImgUrl, 400) || ''
  }))
}

async function fetchWyChartTracks(chartId, { request, limit = 50, signal }) {
  const data = await requestJson(request, `https://music.163.com/api/playlist/detail?id=${encodeURIComponent(chartId)}`, { signal })
  const tracks = Array.isArray(data?.result?.tracks) ? data.result.tracks : []
  return tracks.slice(0, limit).map((item) => ({
    platform: 'wy',
    name: clean(item.name),
    singer: firstText(item.artists),
    album: clean(item.album?.name),
    duration: durationSeconds(Number(item.duration) / 1000),
    musicInfo: {
      id: String(item.id ?? ''),
      name: clean(item.name),
      singer: firstText(item.artists),
      albumName: clean(item.album?.name),
      interval: durationSeconds(Number(item.duration) / 1000)
    }
  })).filter((track) => track.name && track.musicInfo.id)
}

async function fetchWyExtras(track, { request, signal }) {
  const musicInfo = track?.musicInfo || track || {}
  const id = String(musicInfo?.id ?? musicInfo?.songmid ?? '')
  if (!id) return {}
  const extras = {}
  try {
    const lyric = await requestJson(request, gdUrl('lyric', { id }), { signal })
    if (lyric?.lyric) extras.lyric = String(lyric.lyric)
    if (lyric?.tlyric) extras.tlyric = String(lyric.tlyric)
  } catch { /* 歌词是可选能力。 */ }
  try {
    const pic = await requestJson(request, gdUrl('pic', { id }), { signal })
    if (pic?.url) extras.coverUrl = String(pic.url)
  } catch { /* 封面是可选能力。 */ }
  return extras
}

// ---------------------------------------------------------------------------
// 酷我音乐（kw）：search.kuwo.cn/r.s 公开接口（单引号松散 JSON，2026-10-10 实测可用）。
// ---------------------------------------------------------------------------
function parseKuwoRid(musicRid) {
  return clean(String(musicRid ?? '').replace(/^MUSIC_/i, ''), 64)
}

// ---------------------------------------------------------------------------
// 歌单导入（公开无凭据端点）
// - wy：music.163.com/api/playlist/detail —— 2026-10-10 实测可用；
// - kw：m.kuwo.cn/newh5app/api/mobile/v1/music/playlist/{id} —— 公开文档记录，本环境未实测；
// - mg：app.c.nf.migu.cn MIGUM3.0 歌单歌曲接口 —— 公开文档记录，本环境未实测。
// 每个适配器都把 verified 状态回传，界面会如实标注。
// ---------------------------------------------------------------------------
async function fetchWyPlaylist(playlistId, { request, limit = 100, signal }) {
  const data = await requestJson(request, `https://music.163.com/api/playlist/detail?id=${encodeURIComponent(playlistId)}`, { signal })
  const tracks = Array.isArray(data?.result?.tracks) ? data.result.tracks : []
  return {
    id: String(playlistId),
    name: clean(data?.result?.name, 120),
    coverUrl: clean(data?.result?.coverImgUrl, 400),
    verified: true,
    tracks: tracks.slice(0, limit).map((item) => ({
      platform: 'wy',
      name: clean(item.name),
      singer: firstText(item.artists),
      album: clean(item.album?.name),
      duration: durationSeconds(Number(item.duration) / 1000),
      musicInfo: {
        id: String(item.id ?? ''),
        name: clean(item.name),
        singer: firstText(item.artists),
        albumName: clean(item.album?.name),
        interval: durationSeconds(Number(item.duration) / 1000)
      }
    })).filter((track) => track.name && track.musicInfo.id)
  }
}

async function fetchKwPlaylist(playlistId, { request, limit = 100, signal }) {
  const data = await requestJson(request, `https://m.kuwo.cn/newh5app/api/mobile/v1/music/playlist/${encodeURIComponent(playlistId)}?pn=1&rn=${Math.min(200, limit)}`, { signal })
  const list = Array.isArray(data?.data?.musicList) ? data.data.musicList : []
  return {
    id: String(playlistId),
    name: clean(data?.data?.name, 120),
    coverUrl: clean(data?.data?.pic, 400),
    verified: false,
    tracks: list.slice(0, limit).map((item) => {
      const rid = clean(String(item?.id ?? item?.rid ?? ''), 64)
      return {
        platform: 'kw',
        name: clean(item?.name),
        singer: clean(item?.artist_name || item?.artist),
        album: clean(item?.album_name || item?.album),
        duration: 0,
        musicInfo: {
          songmid: rid,
          id: rid,
          name: clean(item?.name),
          singer: clean(item?.artist_name || item?.artist),
          albumName: clean(item?.album_name || item?.album)
        }
      }
    }).filter((track) => track.name && track.musicInfo.songmid)
  }
}

async function fetchMgPlaylist(playlistId, { request, limit = 100, signal }) {
  const data = await requestJson(request, `https://app.c.nf.migu.cn/MIGUM3.0/resource/playlist/song/v2.0?playlistId=${encodeURIComponent(playlistId)}&pageNo=1&pageSize=${Math.min(50, limit)}`, { signal })
  const list = Array.isArray(data?.songList) ? data.songList : Array.isArray(data?.data?.songList) ? data.data.songList : []
  return {
    id: String(playlistId),
    name: clean(data?.playlistName || data?.data?.playlistName, 120),
    coverUrl: clean(data?.playlistImg || data?.data?.playlistImg, 400),
    verified: false,
    tracks: list.slice(0, limit).map((item) => {
      const songmid = clean(item?.songId || item?.id || item?.contentId, 64)
      return {
        platform: 'mg',
        name: clean(item?.songName || item?.name),
        singer: firstText(item?.singerName || item?.singers),
        album: clean(item?.albumName || item?.album),
        duration: 0,
        musicInfo: {
          songmid,
          id: songmid,
          name: clean(item?.songName || item?.name),
          singer: firstText(item?.singerName || item?.singers),
          albumName: clean(item?.albumName || item?.album)
        }
      }
    }).filter((track) => track.name && track.musicInfo.songmid)
  }
}

// ---------------------------------------------------------------------------
// 酷我榜单（公开端点，文档记录，本环境未实测）
// ---------------------------------------------------------------------------
async function listKwCharts(options) {
  const { request, signal } = options
  const data = await requestJson(request, 'https://m.kuwo.cn/newh5app/api/mobile/v1/music/rank/list?pn=1&rn=20', { signal })
  const list = Array.isArray(data?.data) ? data.data : []
  return list.slice(0, 12).map((item) => ({
    id: String(item?.id ?? item?.typeId ?? ''),
    name: clean(item?.label || item?.name, 80),
    updateFrequency: clean(item?.publish, 40),
    coverUrl: clean(item?.pic, 400) || ''
  })).filter((entry) => entry.id && entry.name)
}

async function fetchKwChartTracks(chartId, { request, limit = 50, signal }) {
  const data = await requestJson(request, `https://m.kuwo.cn/newh5app/api/mobile/v1/music/rank/${encodeURIComponent(chartId)}?pn=1&rn=${limit}`, { signal })
  const list = Array.isArray(data?.data?.list) ? data.data.list : []
  return list.slice(0, limit).map((item) => {
    const rid = clean(String(item?.id ?? item?.rid ?? ''), 64)
    return {
      platform: 'kw',
      name: clean(item?.name),
      singer: clean(item?.artist_name || item?.artist),
      album: clean(item?.album_name || item?.album),
      duration: 0,
      musicInfo: {
        songmid: rid,
        id: rid,
        name: clean(item?.name),
        singer: clean(item?.artist_name || item?.artist),
        albumName: clean(item?.album_name || item?.album)
      }
    }
  }).filter((track) => track.name && track.musicInfo.songmid)
}

async function searchKw(query, { request, limit = 10, signal }) {
  const url = `https://search.kuwo.cn/r.s?all=${encodeURIComponent(query)}&ft=music&cluster=0&pn=0&rn=${limit}&rformat=json&encoding=utf8&vipver=1`
  const data = await requestJson(request, url, { loose: true, signal })
  const list = Array.isArray(data?.abslist) ? data.abslist : []
  return list.map((item) => {
    const rid = parseKuwoRid(item?.MUSICRID || item?.DC_TARGETID)
    return {
      platform: 'kw',
      name: clean(String(item?.SONGNAME || item?.NAME || '').replace(/&nbsp;/g, ' ')),
      singer: clean(String(item?.ARTIST || '').replace(/&nbsp;/g, ' ')),
      album: clean(String(item?.ALBUM || '').replace(/&nbsp;/g, ' ')),
      duration: durationSeconds(item?.DURATION),
      musicInfo: {
        songmid: rid,
        id: rid,
        name: clean(String(item?.SONGNAME || '').replace(/&nbsp;/g, ' ')),
        singer: clean(String(item?.ARTIST || '').replace(/&nbsp;/g, ' ')),
        albumName: clean(String(item?.ALBUM || '').replace(/&nbsp;/g, ' ')),
        interval: durationSeconds(item?.DURATION)
      }
    }
  }).filter((track) => track.name && track.musicInfo.songmid).slice(0, limit)
}

// ---------------------------------------------------------------------------
// 酷狗音乐（kg）：mobileservice 公开搜索（2026-10-10 实测返回真实 hash/album_id）。
// ---------------------------------------------------------------------------
async function searchKg(query, { request, limit = 10, signal }) {
  const url = `https://mobileservice.kugou.com/api/v3/search/song?keyword=${encodeURIComponent(query)}&page=1&pagesize=${limit}`
  const data = await requestJson(request, url, { signal })
  const list = Array.isArray(data?.data?.info) ? data.data.info : []
  return list.map((item) => {
    const hash = clean(item?.hash, 64)
    const albumId = clean(item?.album_id, 64)
    const songmid = clean(item?.audio_id || item?.mixsongid || item?.ownercount, 64)
    const types = {}
    if (hash) types['128k'] = { hash }
    if (item?.['320hash']) types['320k'] = { hash: clean(item['320hash'], 64) }
    if (item?.sqhash) types.flac = { hash: clean(item.sqhash, 64) }
    return {
      platform: 'kg',
      name: clean(item?.songname),
      singer: clean(item?.singername),
      album: clean(item?.album_name),
      duration: durationSeconds(item?.duration),
      musicInfo: {
        hash,
        albumId,
        songmid,
        id: songmid,
        name: clean(item?.songname),
        singer: clean(item?.singername),
        albumName: clean(item?.album_name),
        interval: durationSeconds(item?.duration),
        ...(Object.keys(types).length ? { _types: types } : {})
      }
    }
  }).filter((track) => track.name && track.musicInfo.hash).slice(0, limit)
}

// ---------------------------------------------------------------------------
// 咪咕音乐（mg）：MIGUM3.0 公开搜索（2026-10-10 实测可用）。
// songmid 必须用结果里的 id 字段；contentId 会让星海后端返回 400。
// ---------------------------------------------------------------------------
async function searchMg(query, { request, limit = 10, signal }) {
  const url = `https://pd.musicapp.migu.cn/MIGUM3.0/v1.0/content/search_all.do?text=${encodeURIComponent(query)}&pageNo=1&pageSize=${limit}&searchSwitch=${encodeURIComponent('{"song":1}')}`
  const data = await requestJson(request, url, { signal })
  const list = Array.isArray(data?.songResultData?.result) ? data.songResultData.result : []
  return list.map((item) => {
    const songmid = clean(item?.id, 64)
    const cover = Array.isArray(item?.imgItems) ? (item.imgItems.find((img) => img?.imgSizeType === '03') || item.imgItems[0])?.img : ''
    return {
      platform: 'mg',
      name: clean(item?.name),
      singer: firstText(item?.singers),
      album: clean(item?.albums?.[0]?.name),
      duration: 0,
      musicInfo: {
        songmid,
        id: songmid,
        name: clean(item?.name),
        singer: firstText(item?.singers),
        albumName: clean(item?.albums?.[0]?.name)
      },
      extras: {
        ...(item?.lyricUrl ? { lyricUrl: String(item.lyricUrl) } : {}),
        ...(cover ? { coverUrl: String(cover) } : {})
      }
    }
  }).filter((track) => track.name && track.musicInfo.songmid).slice(0, limit)
}

async function fetchMgExtras(track, { request, signal }) {
  const hints = track?.extras || {}
  const extras = {}
  if (hints.coverUrl) extras.coverUrl = hints.coverUrl
  if (hints.lyricUrl) {
    try {
      const text = await requestText(request, hints.lyricUrl, { signal })
      if (text.trim()) extras.lyric = text
    } catch { /* 歌词是可选能力。 */ }
  }
  return extras
}

// ---------------------------------------------------------------------------
// QQ 音乐（tx）：musicu.fcg 公开检索。2026-10-10 实测通道返回空列表/空响应，
// 疑似要求 Referer 热链头（受控桥按安全边界禁止发送），保留适配器但标记未实测。
// ---------------------------------------------------------------------------
async function searchTx(query, { request, limit = 10, signal }) {
  // c.y.qq.com/soso/fcgi-bin/client_search_cp 是 QQ 音乐公开检索端点（多份公开文档记录）：
  // format=json 返回 JSON，个别情况下返回 JSONP，因此按松散 JSON 解析。
  const params = new URLSearchParams({
    ct: '24', qqmusic_ver: '1298', new_json: '1', remoteplace: 'txt.yqq.song',
    t: '0', aggr: '1', cr: '1', catZhida: '1', lossless: '0', flag_qc: '0',
    p: '1', n: String(limit), w: query, format: 'json', inCharset: 'utf8', outCharset: 'utf-8',
    notice: '0', platform: 'yqq.json', needNewCode: '0'
  })
  const data = await requestJson(request, `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?${params.toString()}`, { loose: true, signal })
  const list = Array.isArray(data?.data?.song?.list) ? data.data.song.list : []
  return list.map((item) => {
    const songmid = clean(item?.mid, 64)
    return {
      platform: 'tx',
      name: clean(item?.name || item?.title),
      singer: firstText(item?.singer),
      album: clean(item?.album?.name || item?.albumname),
      duration: durationSeconds(item?.interval),
      musicInfo: {
        songmid,
        id: songmid,
        name: clean(item?.name || item?.title),
        singer: firstText(item?.singer),
        albumName: clean(item?.album?.name || item?.albumname),
        interval: durationSeconds(item?.interval)
      }
    }
  }).filter((track) => track.name && track.musicInfo.songmid).slice(0, limit)
}

// ---------------------------------------------------------------------------
// 汽水音乐（qs）：暂无可用公开搜索接口；解析仍可由音源脚本完成后端聚合。
// ---------------------------------------------------------------------------
async function searchQs() {
  // 汽水音乐没有公开、免凭据的检索接口；网络上的解析服务都要求自备 token/密钥，
  // 因此不内置任何第三方密钥。曲目 ID 由用户在试听台的「平台专属字段」中填写。
  throw new Error('汽水音乐没有公开免凭据的搜索接口（第三方解析需自备密钥，本项目不内置）。请在试听台手动填写该平台的曲目 ID')
}

// ---------------------------------------------------------------------------
// 直链解析（供「快速换源」使用）：只使用公开、无凭据端点。
// ---------------------------------------------------------------------------
async function resolveWyUrl(track, { request, quality = '320k', signal }) {
  const id = String(track?.musicInfo?.id ?? track?.id ?? '')
  if (!id) throw new Error('缺少网易云曲目 ID')
  const br = { '128k': '128', '320k': '320', flac: '740', flac24bit: '999' }[String(quality)] || '320'
  const data = await requestJson(request, gdUrl('url', { id, br }), { signal })
  const url = String(data?.url || data?.data?.url || '')
  if (!/^https?:\/\//i.test(url)) throw new Error('该曲目在公开接口中没有可用直链（可能需要会员或已下架）')
  return url
}

async function resolveKwUrl(track, { request, quality = '320k', signal }) {
  const rid = String(track?.musicInfo?.songmid ?? track?.musicInfo?.id ?? '')
  if (!rid) throw new Error('缺少酷我曲目 ID')
  const br = { '128k': '128kmp3', '320k': '320kmp3', flac: '2000kflac' }[String(quality)] || '320kmp3'
  const data = await requestText(request, `https://antiserver.kuwo.cn/anti.s?format=${encodeURIComponent(br)}&rid=MUSIC_${encodeURIComponent(rid)}&response=url&type=convert_url`, { signal })
  const url = String(data || '').trim()
  if (!/^https?:\/\//i.test(url)) throw new Error('酷我未返回可用直链')
  return url
}


export const CATALOG_ADAPTERS = {
  wy: {
    key: 'wy',
    name: '网易云音乐',
    verified: '2026-10-10',
    search: searchWy,
    charts: { list: listWyCharts, tracks: fetchWyChartTracks },
    extras: fetchWyExtras,
    resolveUrl: resolveWyUrl,
    playlist: fetchWyPlaylist
  },
  kw: {
    key: 'kw',
    name: '酷我音乐',
    verified: '2026-10-10',
    search: searchKw,
    charts: { list: listKwCharts, tracks: fetchKwChartTracks },
    extras: null,
    resolveUrl: resolveKwUrl,
    playlist: fetchKwPlaylist
  },
  kg: {
    key: 'kg',
    name: '酷狗音乐',
    verified: '2026-10-10',
    search: searchKg,
    charts: null,
    extras: null
  },
  mg: {
    key: 'mg',
    name: '咪咕音乐',
    verified: '2026-10-10',
    search: searchMg,
    charts: null,
    extras: fetchMgExtras,
    playlist: fetchMgPlaylist
  },
  tx: {
    key: 'tx',
    name: 'QQ音乐',
    verified: null,
    search: searchTx,
    charts: null,
    extras: null,
    playlist: null
  },
  qs: {
    key: 'qs',
    name: '汽水音乐',
    verified: null,
    search: searchQs,
    charts: null,
    extras: null,
    playlist: null
  }
}
