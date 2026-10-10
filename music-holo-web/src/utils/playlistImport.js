// 第三方平台歌单导入：链接解析 + 曲目拉取 + 文本清单导入。
//
// 只使用公开、无凭据的端点，不内置任何第三方密钥；端点是否经过本机实测如实标注
// （verified 字段），界面会把「未实测」显式告诉用户，避免把文档当作可用性证明。
//
// 支持：
//   - 网易云 / 酷我 / 咪咕 的歌单链接或纯 ID；
//   - 手动粘贴「歌名 - 歌手」清单（逐行），通过平台搜索解析成曲目；
//   - 酷狗 / QQ / 汽水 的链接可解析出平台与 ID，但公开免凭据接口缺失时明确报错。

import { fetchPlatformPlaylist, searchPlatformTracks } from './sourceCatalog'

const PATTERNS = [
  // 网易云：#/playlist?id=xxx 、/playlist?id=xxx 、纯数字
  { platform: 'wy', pattern: /(?:music\.163\.com|163cn\.tv)[^]*?[?&#](?:id|playlistId)=(\d{4,})/i },
  { platform: 'wy', pattern: /music\.163\.com\/#\/(?:playlist|my\/m\/music\/playlist)\?id=(\d{4,})/i },
  // 酷我：/playlist/xxx 、?pid=xxx
  { platform: 'kw', pattern: /(?:kuwo\.cn)[^]*?(?:\/playlist\/(\d{4,})|[?&]pid=(\d{4,}))/i },
  // 咪咕：/playlist/xxx 、?playlistId=xxx
  { platform: 'mg', pattern: /(?:migu\.cn)[^]*?(?:\/playlist\/(\d{4,})|[?&]playlistId=(\d{4,}))/i },
  // 酷狗：/yy/album/... 或歌单页 /yy/special/single/...
  { platform: 'kg', pattern: /(?:kugou\.com)[^]*?\/(?:album|special|playlist)\/(?:single\/)?(\d{4,})/i },
  // QQ：y.qq.com/n/ryqq/playlist/xxx 或 ?id=xxx
  { platform: 'tx', pattern: /(?:y\.qq\.com)[^]*?(?:\/playlist\/([A-Za-z0-9_-]{4,})|[?&]id=(\d{4,}))/i }
]

export const PLAYLIST_IMPORT_PLATFORMS = [
  { key: 'wy', name: '网易云音乐', hint: 'music.163.com 歌单链接或纯 ID', verified: true },
  { key: 'kw', name: '酷我音乐', hint: 'kuwo.cn 歌单链接或纯 ID', verified: false },
  { key: 'mg', name: '咪咕音乐', hint: 'music.migu.cn 歌单链接或纯 ID', verified: false },
  { key: 'kg', name: '酷狗音乐', hint: '仅解析链接（公开歌单接口缺失）', verified: false },
  { key: 'tx', name: 'QQ音乐', hint: '仅解析链接（公开歌单接口缺失）', verified: false }
]

/** 从分享文本里提取平台与歌单 ID；识别不出返回 null。 */
export function parsePlaylistLink(input) {
  const text = String(input ?? '').trim()
  if (!text) return null
  if (/^\d{4,}$/.test(text)) return { platform: 'wy', id: text }
  for (const { platform, pattern } of PATTERNS) {
    const match = text.match(pattern)
    if (!match) continue
    const id = (match[1] || match[2] || '').trim()
    if (id) return { platform, id }
  }
  return null
}

/**
 * 拉取歌单内容。返回 { platform, id, name, coverUrl, verified, tracks[] }。
 * 未接入的平台会抛出明确的中文错误，永远不会返回假数据。
 */
export async function importPlaylistByLink(input, { platform: forcedPlatform, request, signal } = {}) {
  const parsed = parsePlaylistLink(input)
  const target = forcedPlatform || parsed?.platform
  const id = parsed?.id
  if (!parsed && !forcedPlatform) {
    throw new Error('无法识别该链接：请粘贴网易云 / 酷我 / 咪咕的歌单链接，或直接填歌单 ID')
  }
  if (!id) throw new Error('链接里没有找到歌单 ID')
  return fetchPlatformPlaylist(target, id, { request, signal })
}

const LINE_SPLIT = /[\r\n]+/

/** 解析「歌名 - 歌手」清单文本，每行一条。 */
export function parseTrackListText(text) {
  return String(text ?? '')
    .split(LINE_SPLIT)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 200)
    .map((line) => {
      const normalized = line.replace(/\s+[-–—]\s+/g, ' - ')
      const [title, ...rest] = normalized.split(' - ')
      return {
        title: String(title || '').trim().slice(0, 120),
        artist: rest.join(' - ').trim().slice(0, 120)
      }
    })
    .filter((entry) => entry.title)
}

/**
 * 用平台搜索把文本清单解析为曲目。逐条搜索，失败条目如实列出。
 * @returns {Promise<{ tracks: Array, failed: Array }>}
 */
export async function importTrackListText(text, { platform = 'wy', request, signal, limit = 1 } = {}) {
  const entries = parseTrackListText(text)
  if (!entries.length) throw new Error('请粘贴至少一行「歌名 - 歌手」')
  const tracks = []
  const failed = []
  for (const entry of entries) {
    if (signal?.aborted) break
    try {
      const found = await searchPlatformTracks(platform, entry.artist ? `${entry.title} ${entry.artist}` : entry.title, { request, limit, signal })
      const first = Array.isArray(found) ? found[0] : null
      if (!first) throw new Error('没有搜索结果')
      tracks.push({ ...first, requestedTitle: entry.title, requestedArtist: entry.artist })
    } catch (error) {
      failed.push({ ...entry, error: String(error?.message || error) })
    }
  }
  return { tracks, failed }
}
