/**
 * 内置 Mock 服务：VITE_API_MOCK=true 时接管全部 API 请求，
 * 无需启动后端即可完整体验前端（登录/播放/收藏/管理后台等）。
 */
import { ElMessage } from 'element-plus'
import router from '@/router'
import { useUserStore } from '@/store/user'
import { createSeed, clone } from './seed'
import { parsePlaylistBackup, PLAYLIST_BACKUP_FORMAT, PLAYLIST_BACKUP_VERSION } from '@/utils/playlistBackup'

export const mockEnabled = import.meta.env.VITE_API_MOCK === 'true'

const state = createSeed()
/** token -> userId */
const tokens = new Map()
let tokenSeq = 1

// ------------------------------------------------------------
// 工具
// ------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const mockError = (code, msg) => Object.assign(new Error(msg), { code, msg })

const routes = []
const route = (method, pattern, handler) => routes.push({ method, pattern, handler })

function matchRoute(method, url) {
  for (const r of routes) {
    if (r.method !== method) continue
    const keys = []
    const regex = new RegExp('^' + r.pattern.replace(/:[^/]+/g, (m) => {
      keys.push(m.slice(1))
      return '([^/]+)'
    }) + '$')
    const m = url.match(regex)
    if (m) {
      const pathParams = {}
      keys.forEach((k, i) => { pathParams[k] = decodeURIComponent(m[i + 1]) })
      return { handler: r.handler, pathParams }
    }
  }
  return null
}

function currentUser(config) {
  const token = config.headers?.['music-holo-token'] || ''
  const userId = tokens.get(token)
  return userId ? state.users.find((u) => u.id === userId) : null
}

function requireUser(ctx) {
  if (!ctx.user) throw mockError(401, '未登录或登录已过期，请重新登录')
  return ctx.user
}

function requireAdmin(ctx) {
  const user = requireUser(ctx)
  if (user.role !== 0) throw mockError(403, '没有访问权限（需要管理员）')
  return user
}

/** MyBatis-Plus 分页结构 */
function pageOf(list, pageNum = 1, pageSize = 10) {
  const start = (pageNum - 1) * pageSize
  return {
    records: clone(list.slice(start, start + pageSize)),
    total: list.length,
    size: pageSize,
    current: pageNum,
    pages: Math.ceil(list.length / pageSize) || 1
  }
}

const num = (v, def = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

function readTextFile(file) {
  if (typeof file?.text === 'function') return file.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'))
    reader.readAsText(file)
  })
}

function validateLrcSize(lrc) {
  if (lrc != null && new TextEncoder().encode(String(lrc)).length > 65_535) {
    throw mockError(500, '单份 LRC 文本不能超过 64 KB')
  }
}

// ------------------------------------------------------------
// VO 组装
// ------------------------------------------------------------
function userVO(user) {
  const { password, ...rest } = user
  return clone(rest)
}

function songVO(song) {
  const singer = state.singers.find((s) => s.id === song.singerId)
  const category = state.categories.find((c) => c.id === song.categoryId)
  return {
    ...clone(song),
    singerName: singer?.name || '',
    categoryName: category?.name || '',
    favorite: false
  }
}

function songListVO(song) {
  const vo = songVO(song)
  delete vo.lyric
  delete vo.lyricTranslation
  return vo
}

function singerVO(singer) {
  const songCount = state.songs.filter((s) => s.singerId === singer.id).length
  return { ...clone(singer), songCount }
}

function albumVO(songs) {
  if (!songs?.length) return null
  const first = songs[0]
  const singer = state.singers.find((item) => item.id === first.singerId)
  return {
    album: first.album,
    singerId: first.singerId ?? null,
    singerName: singer?.name || '未知歌手',
    cover: songs.find((song) => song.cover)?.cover || singer?.avatar || '',
    songCount: songs.length,
    playCount: songs.reduce((sum, song) => sum + Number(song.playCount || 0), 0),
    latestSongTime: songs.map((song) => song.createTime).filter(Boolean).sort().at(-1) || null
  }
}

function albumTracks(album, singerId = null) {
  const matches = state.songs.filter((song) => song.status === 1 && song.album === album)
  const resolvedSingerId = singerId ?? matches[0]?.singerId ?? null
  return matches
    .filter((song) => (song.singerId ?? null) === resolvedSingerId)
    .sort((a, b) => a.id - b.id)
}

function albumGroups(keyword = '') {
  const normalized = String(keyword || '').trim().toLocaleLowerCase()
  const groups = new Map()
  for (const song of state.songs) {
    if (song.status !== 1 || !String(song.album || '').trim()) continue
    const singer = state.singers.find((item) => item.id === song.singerId)
    if (normalized && !song.album.toLocaleLowerCase().includes(normalized) && !(singer?.name || '').toLocaleLowerCase().includes(normalized)) continue
    const key = `${song.singerId ?? 'unknown'}::${song.album}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(song)
  }
  return Array.from(groups.values()).map(albumVO).filter(Boolean)
}

function playlistVO(playlist) {
  const songCount = state.playlistSongs.filter((ps) => ps.playlistId === playlist.id).length
  const creator = state.users.find((u) => u.id === playlist.creatorId)
  return { ...clone(playlist), songCount, creatorName: creator?.nickname || creator?.username || '' }
}

function normalizePlaylistName(value) {
  return String(value || '').trim().toLocaleLowerCase()
}

function uniqueImportedPlaylistName(value, usedNames) {
  const base = String(value || '导入歌单').trim().slice(0, 100) || '导入歌单'
  if (!usedNames.has(normalizePlaylistName(base))) {
    usedNames.add(normalizePlaylistName(base))
    return base
  }
  for (let suffix = 2; suffix < 10000; suffix += 1) {
    const tag = `（导入 ${suffix}）`
    const candidate = `${base.slice(0, 100 - tag.length)}${tag}`
    if (!usedNames.has(normalizePlaylistName(candidate))) {
      usedNames.add(normalizePlaylistName(candidate))
      return candidate
    }
  }
  throw mockError(400, '无法为同名歌单生成唯一名称')
}

function sameMockTrackIdentity(track, song) {
  const view = songVO(song)
  const normalize = (value) => String(value || '').trim().toLocaleLowerCase()
  return normalize(track.title) === normalize(view.title) &&
    (!track.singerName || normalize(track.singerName) === normalize(view.singerName)) &&
    (!track.album || normalize(track.album) === normalize(view.album))
}

function createPlaylistBackupPreview(backup, user) {
  const usedNames = new Set(state.playlists.filter((playlist) => playlist.creatorId === user.id).map((playlist) => normalizePlaylistName(playlist.name)))
  const previews = backup.playlists.map((source, playlistIndex) => {
    const suggestedName = uniqueImportedPlaylistName(source.name, usedNames)
    const tracks = source.songs.map((sourceTrack, trackIndex) => {
      const idMatch = sourceTrack.id
        ? state.songs.find((song) => String(song.id) === String(sourceTrack.id) && song.status === 1 && sameMockTrackIdentity(sourceTrack, song))
        : null
      let matches = idMatch ? [idMatch] : state.songs.filter((song) => song.status === 1 && sameMockTrackIdentity(sourceTrack, song))
      matches = [...new Map(matches.map((song) => [song.id, song])).values()]
      const candidates = matches.slice(0, 20).map((song) => {
        const view = songVO(song)
        return { id: String(view.id), title: view.title, singerName: view.singerName || '', album: view.album || '' }
      })
      const status = matches.length === 0 ? 'missing' : matches.length === 1 ? 'matched' : 'ambiguous'
      return {
        index: trackIndex,
        title: sourceTrack.title,
        singerName: sourceTrack.singerName || '',
        album: sourceTrack.album || '',
        status,
        resolvedSongId: status === 'matched' ? candidates[0].id : null,
        candidates
      }
    })
    const matchedSongCount = tracks.filter((track) => track.status === 'matched').length
    const missingSongCount = tracks.filter((track) => track.status === 'missing').length
    const ambiguousSongCount = tracks.filter((track) => track.status === 'ambiguous').length
    return {
      index: playlistIndex,
      name: source.name,
      description: source.description || '',
      sourcePublic: source.sourcePublic,
      suggestedName,
      nameConflict: suggestedName !== source.name,
      totalSongCount: tracks.length,
      matchedSongCount,
      missingSongCount,
      ambiguousSongCount,
      tracks
    }
  })
  const tracks = previews.flatMap((playlist) => playlist.tracks)
  return {
    playlistCount: previews.length,
    totalSongCount: tracks.length,
    matchedSongCount: tracks.filter((track) => track.status === 'matched').length,
    missingSongCount: tracks.filter((track) => track.status === 'missing').length,
    ambiguousSongCount: tracks.filter((track) => track.status === 'ambiguous').length,
    playlists: previews
  }
}

const reviewTargetTitle = (type, id) => type === 'song'
  ? state.songs.find((song) => song.id === id)?.title || '歌曲'
  : state.playlists.find((playlist) => playlist.id === id)?.name || '歌单'

function assertReviewTargetVisible(type, id, user) {
  if (!['song', 'playlist'].includes(type) || !Number.isFinite(id) || id <= 0) {
    throw mockError(400, '请指定有效的短评对象')
  }
  if (type === 'song') {
    const song = state.songs.find((item) => item.id === id && item.status === 1)
    if (!song && user?.role !== 0) throw mockError(404, '歌曲不存在')
    if (!song && user?.role === 0 && !state.songs.some((item) => item.id === id)) throw mockError(404, '歌曲不存在')
    return
  }
  const playlist = state.playlists.find((item) => item.id === id)
  if (!playlist || (playlist.isPublic !== 1 && !(user && (user.role === 0 || playlist.creatorId === user.id)))) {
    throw mockError(404, '歌单不存在')
  }
}

function musicReviewVO(review, user) {
  const author = state.users.find((item) => item.id === review.userId)
  return {
    ...clone(review),
    targetTitle: reviewTargetTitle(review.targetType, review.targetId),
    authorId: review.userId,
    authorName: author?.nickname || '音乐听众',
    authorAvatar: author?.avatar || '',
    mine: !!user && user.id === review.userId,
    liked: !!user && state.reviewLikes.some((like) => like.reviewId === review.id && like.userId === user.id)
  }
}

function parseLrc(lrc) {
  const lines = []
  if (!lrc) return lines
  const tagRe = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
  for (const raw of lrc.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const times = []
    let lastEnd = 0
    let m
    tagRe.lastIndex = 0
    while ((m = tagRe.exec(line)) !== null) {
      const min = Number(m[1])
      const sec = Number(m[2])
      const frac = m[3] ? Number('0.' + m[3]) : 0
      times.push(min * 60 + sec + frac)
      lastEnd = tagRe.lastIndex
    }
    if (times.length === 0) continue
    const text = line.slice(lastEnd).trim()
    for (const t of times) lines.push({ time: t, text })
  }
  return lines.sort((a, b) => a.time - b.time)
}

function toLrc(lines) {
  const fmt = (t) => {
    const total = Math.round(t * 100)
    const mm = String(Math.floor(total / 6000)).padStart(2, '0')
    const ss = String(Math.floor((total % 6000) / 100)).padStart(2, '0')
    const cs = String(total % 100).padStart(2, '0')
    return `[${mm}:${ss}.${cs}]`
  }
  return [...lines].sort((a, b) => a.time - b.time).map((l) => `${fmt(l.time)}${l.text}`).join('\n') + '\n'
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// ------------------------------------------------------------
// 路由注册
// ------------------------------------------------------------

// ---------- 认证 ----------
route('post', '/auth/login', async (ctx) => {
  const { username, password } = ctx.body
  const user = state.users.find((u) => u.username === username && u.password === password)
  if (!user) throw mockError(500, '用户名或密码错误')
  if (user.status === 0) throw mockError(500, '账号已被禁用，请联系管理员')
  const token = `mock-token-${tokenSeq++}-${user.id}`
  tokens.set(token, user.id)
  return { token, userInfo: userVO(user) }
})

route('post', '/auth/register', async (ctx) => {
  const { username, password, nickname } = ctx.body
  if (!username || !password) throw mockError(400, '用户名和密码不能为空')
  if (state.users.some((u) => u.username === username)) throw mockError(500, '用户名已存在')
  const user = {
    id: state.genId(),
    username,
    password,
    nickname: nickname || username,
    avatar: '',
    email: '',
    phone: '',
    gender: 0,
    role: 1,
    theme: 'cyan',
    status: 1,
    createTime: new Date().toISOString().slice(0, 19).replace('T', ' ')
  }
  state.users.push(user)
  return userVO(user)
})

route('post', '/auth/logout', async (ctx) => {
  requireUser(ctx)
  return null
})

route('get', '/auth/info', async (ctx) => {
  return userVO(requireUser(ctx))
})

// ---------- 用户 ----------
route('get', '/user/profile', async (ctx) => userVO(requireUser(ctx)))

route('put', '/user/profile', async (ctx) => {
  const user = requireUser(ctx)
  const { nickname, avatar, email, phone, gender, theme } = ctx.body
  if (nickname) user.nickname = nickname
  if (avatar !== undefined) user.avatar = avatar
  if (email !== undefined) user.email = email
  if (phone !== undefined) user.phone = phone
  if (gender !== undefined) user.gender = gender
  if (theme) user.theme = theme
  return userVO(user)
})

route('put', '/user/password', async (ctx) => {
  const user = requireUser(ctx)
  if (user.password !== ctx.body.oldPassword) throw mockError(500, '原密码不正确')
  user.password = ctx.body.newPassword
  return null
})

// ---------- 系统设置 ----------
route('get', '/system/theme', async (ctx) => {
  const global = state.configs.find((c) => c.configKey === 'theme')?.configValue || 'cyan'
  const current = ctx.user?.theme || global
  return { theme: current, global, themes: ['cyan', 'magenta', 'amber', 'lime', 'ruby'] }
})

route('put', '/system/theme', async (ctx) => {
  const user = requireUser(ctx)
  const { theme, scope } = ctx.body
  const themes = ['cyan', 'magenta', 'amber', 'lime', 'ruby']
  if (!themes.includes(theme)) throw mockError(500, '不支持的主题：' + theme)
  if ((scope || 'user') === 'global') {
    if (user.role !== 0) throw mockError(403, '仅管理员可设置全局主题')
    const config = state.configs.find((c) => c.configKey === 'theme')
    if (config) config.configValue = theme
  } else {
    user.theme = theme
  }
  return { theme: user.theme || theme, global: state.configs.find((c) => c.configKey === 'theme')?.configValue, themes }
})

route('get', '/system/config/:key', async (ctx) => {
  const config = state.configs.find((c) => c.configKey === ctx.params.key)
  return { key: ctx.params.key, value: config?.configValue || '' }
})

// ---------- 歌手 ----------
route('get', '/singer/page', async (ctx) => {
  const { pageNum = 1, pageSize = 12, keyword, gender, region } = ctx.params
  let list = state.singers.filter((s) => s.status === 1)
  if (keyword) list = list.filter((s) => s.name.includes(keyword))
  if (gender !== undefined && gender !== '') list = list.filter((s) => s.gender === num(gender))
  if (region) list = list.filter((s) => s.region === region)
  list.sort((a, b) => a.sort - b.sort || b.id - a.id)
  const paged = pageOf(list, num(pageNum, 1), num(pageSize, 12))
  paged.records = paged.records.map(singerVO)
  return paged
})

route('get', '/singer/export', async () => {
  const header = '歌手ID,歌手名称,性别,地区,简介,头像,排序\n'
  const genderText = { 0: '保密', 1: '男', 2: '女' }
  const rows = state.singers.map((s) => [s.id, s.name, genderText[s.gender] || '', s.region || '', s.intro || '', s.avatar || '', s.sort ?? 0].map(csvCell).join(','))
  return new Blob([header + rows.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' })
})

route('get', '/singer/template', async () => {
  return new Blob(['歌手ID,歌手名称,性别,地区,简介,头像,排序\n1,示例歌手,男,内地,示例简介,,0\n'], { type: 'text/csv;charset=utf-8' })
})

route('post', '/singer/import', async (ctx) => {
  requireAdmin(ctx)
  const file = ctx.file
  if (!file) throw mockError(500, '上传文件不能为空')
  const text = await file.text()
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  let count = 0
  for (const line of lines.slice(1)) {
    const cols = line.split(',')
    const name = (cols[1] || '').trim()
    if (!name) continue
    state.singers.push({
      id: state.genId(),
      name,
      gender: { 男: 1, 女: 2, 保密: 0 }[cols[2]?.trim()] ?? 0,
      region: (cols[3] || '').trim(),
      intro: (cols[4] || '').trim(),
      avatar: '',
      sort: num(cols[6], 0),
      status: 1,
      createTime: new Date().toISOString().slice(0, 19).replace('T', ' ')
    })
    count++
  }
  return count
})

route('get', '/singer/:id', async (ctx) => {
  const singer = state.singers.find((s) => s.id === num(ctx.params.id))
  if (!singer) throw mockError(500, '歌手不存在')
  return singerVO(singer)
})

route('get', '/singer/:id/songs', async (ctx) => {
  const id = num(ctx.params.id)
  if (!state.singers.some((s) => s.id === id)) throw mockError(500, '歌手不存在')
  return state.songs
    .filter((s) => s.singerId === id)
    .sort((a, b) => b.playCount - a.playCount)
    .map(songListVO)
})

route('post', '/singer', async (ctx) => {
  requireAdmin(ctx)
  const dto = ctx.body
  const singer = {
    id: state.genId(),
    name: dto.name,
    gender: dto.gender ?? 0,
    region: dto.region || '',
    intro: dto.intro || '',
    avatar: dto.avatar || '',
    sort: dto.sort ?? 0,
    status: 1,
    createTime: new Date().toISOString().slice(0, 19).replace('T', ' ')
  }
  state.singers.push(singer)
  return singerVO(singer)
})

route('put', '/singer', async (ctx) => {
  requireAdmin(ctx)
  const dto = ctx.body
  const singer = state.singers.find((s) => s.id === num(dto.id))
  if (!singer) throw mockError(500, '歌手不存在')
  Object.assign(singer, {
    name: dto.name,
    gender: dto.gender ?? singer.gender,
    region: dto.region ?? singer.region,
    intro: dto.intro ?? singer.intro,
    avatar: dto.avatar ?? singer.avatar,
    sort: dto.sort ?? singer.sort
  })
  return singerVO(singer)
})

route('delete', '/singer/:id', async (ctx) => {
  requireAdmin(ctx)
  const id = num(ctx.params.id)
  if (state.songs.some((s) => s.singerId === id)) throw mockError(500, '该歌手下存在歌曲，无法删除')
  state.singers = state.singers.filter((s) => s.id !== id)
  return null
})

// ---------- 专辑（从现有歌曲曲库聚合） ----------
route('get', '/album/page', async (ctx) => {
  const { pageNum = 1, pageSize = 12, keyword = '' } = ctx.params
  const albums = albumGroups(keyword).sort((a, b) => b.playCount - a.playCount || a.album.localeCompare(b.album, 'zh-CN'))
  return pageOf(albums, num(pageNum, 1), Math.min(48, Math.max(1, num(pageSize, 12))))
})

route('get', '/album/detail', async (ctx) => {
  const album = String(ctx.params.album || '').trim()
  const singerId = ctx.params.singerId ? num(ctx.params.singerId) : null
  const tracks = albumTracks(album, singerId)
  const result = albumVO(tracks)
  if (!result) throw mockError(404, '专辑不存在或已下架')
  return result
})

route('get', '/album/songs', async (ctx) => {
  const album = String(ctx.params.album || '').trim()
  const singerId = ctx.params.singerId ? num(ctx.params.singerId) : null
  const tracks = albumTracks(album, singerId)
  if (!tracks.length) throw mockError(404, '专辑不存在或已下架')
  return tracks.map((song) => {
    const vo = songListVO(song)
    if (ctx.user) vo.favorite = state.favorites.some((favorite) => favorite.userId === ctx.user.id && favorite.songId === song.id)
    return vo
  })
})

// ---------- 歌曲 ----------
route('get', '/song/page', async (ctx) => {
  const { pageNum = 1, pageSize = 10, keyword, categoryId, singerId } = ctx.params
  let list = state.songs.filter((s) => s.status === 1)
  if (keyword) {
    list = list.filter((s) => s.title.includes(keyword) || (s.album || '').includes(keyword))
  }
  if (categoryId) list = list.filter((s) => s.categoryId === num(categoryId))
  if (singerId) list = list.filter((s) => s.singerId === num(singerId))
  list.sort((a, b) => b.playCount - a.playCount || b.id - a.id)
  const paged = pageOf(list, num(pageNum, 1), num(pageSize, 10))
  paged.records = paged.records.map(songListVO)
  return paged
})

route('get', '/search', async (ctx) => {
  const keyword = String(ctx.params.keyword || '').trim()
  const limit = Math.min(20, Math.max(1, num(ctx.params.limit, 8)))
  if (!keyword) return { keyword: '', songs: [], singers: [], playlists: [] }
  const q = keyword.toLocaleLowerCase()
  const singers = state.singers
    .filter((s) => s.status === 1 && s.name.toLocaleLowerCase().includes(q))
    .sort((a, b) => a.sort - b.sort || b.id - a.id)
    .slice(0, limit)
  const singerIds = new Set(singers.map((s) => s.id))
  const songs = state.songs
    .filter((s) => s.status === 1 && (
      s.title.toLocaleLowerCase().includes(q) ||
      (s.album || '').toLocaleLowerCase().includes(q) ||
      (s.lyric || '').toLocaleLowerCase().includes(q) ||
      (s.lyricTranslation || '').toLocaleLowerCase().includes(q) ||
      singerIds.has(s.singerId)
    ))
    .sort((a, b) => b.playCount - a.playCount || b.id - a.id)
    .slice(0, limit)
    .map((song) => {
      const vo = songListVO(song)
      if (ctx.user) vo.favorite = state.favorites.some((f) => f.userId === ctx.user.id && f.songId === song.id)
      return vo
    })
  const playlists = state.playlists
    .filter((p) => (p.isPublic === 1 || (ctx.user && (ctx.user.role === 0 || p.creatorId === ctx.user.id))) && (
      p.name.toLocaleLowerCase().includes(q) || (p.description || '').toLocaleLowerCase().includes(q)
    ))
    .sort((a, b) => b.playCount - a.playCount || b.id - a.id)
    .slice(0, limit)
    .map(playlistVO)
  return { keyword, songs, singers: singers.map(singerVO), playlists }
})

route('get', '/recommend/songs', async (ctx) => {
  const limit = Math.min(24, Math.max(1, num(ctx.params.limit, 8)))
  const history = ctx.user
    ? state.playHistory.filter((h) => h.userId === ctx.user.id).sort((a, b) => String(b.lastPlayedAt).localeCompare(String(a.lastPlayedAt)))
    : []
  const favorites = ctx.user ? state.favorites.filter((f) => f.userId === ctx.user.id) : []
  const seedIds = [...history.map((h) => h.songId), ...favorites.map((f) => f.songId)]
  const seedSongs = state.songs.filter((s) => seedIds.includes(s.id))
  const singerWeights = new Map()
  const categoryWeights = new Map()
  seedSongs.forEach((song) => {
    singerWeights.set(song.singerId, (singerWeights.get(song.singerId) || 0) + 1)
    categoryWeights.set(song.categoryId, (categoryWeights.get(song.categoryId) || 0) + 1)
  })
  const excluded = new Set([
    ...history.slice(0, 5).map((h) => h.songId),
    ...favorites.map((f) => f.songId)
  ])
  const list = state.songs.filter((s) => s.status === 1 && !excluded.has(s.id))
  const score = (song) => (singerWeights.get(song.singerId) || 0) * 5 +
    (categoryWeights.get(song.categoryId) || 0) * 3 + Math.log1p(song.playCount || 0) / 20
  list.sort((a, b) => score(b) - score(a) || b.playCount - a.playCount || b.id - a.id)
  return list.slice(0, limit).map(songListVO)
})

route('get', '/recommend/similar', async (ctx) => {
  const sourceSongId = num(ctx.params.sourceSongId)
  const limit = Math.min(24, Math.max(1, num(ctx.params.limit, 12)))
  const source = state.songs.find((song) => song.id === sourceSongId && song.status === 1)
  if (!source) throw mockError(404, '歌曲不存在或已下架')

  const candidates = state.songs.filter((song) => song.status === 1 && song.id !== sourceSongId)
  const score = (song) => (song.singerId === source.singerId ? 5 : 0) +
    (song.categoryId === source.categoryId ? 3 : 0) + Math.log1p(song.playCount || 0) / 20
  candidates.sort((a, b) => score(b) - score(a) || b.playCount - a.playCount || b.id - a.id)
  return candidates.slice(0, limit).map((song) => {
    const vo = songListVO(song)
    if (ctx.user) vo.favorite = state.favorites.some((favorite) => favorite.userId === ctx.user.id && favorite.songId === song.id)
    return vo
  })
})

route('get', '/song/:id', async (ctx) => {
  const song = state.songs.find((s) => s.id === num(ctx.params.id))
  if (!song) throw mockError(500, '歌曲不存在')
  const vo = songVO(song)
  if (ctx.user) {
    vo.favorite = state.favorites.some((f) => f.userId === ctx.user.id && f.songId === song.id)
  }
  return vo
})

route('post', '/song', async (ctx) => {
  requireAdmin(ctx)
  const dto = ctx.body
  validateLrcSize(dto.lyric)
  validateLrcSize(dto.lyricTranslation)
  const song = {
    id: state.genId(),
    title: dto.title,
    singerId: num(dto.singerId),
    categoryId: num(dto.categoryId),
    album: dto.album || '',
    duration: num(dto.duration),
    cover: dto.cover || '',
    audioUrl: dto.audioUrl,
    lyric: dto.lyric || '',
    lyricTranslation: dto.lyricTranslation ?? '',
    status: dto.status ?? 1,
    playCount: 0,
    createTime: new Date().toISOString().slice(0, 19).replace('T', ' ')
  }
  state.songs.push(song)
  return songVO(song)
})

route('put', '/song', async (ctx) => {
  requireAdmin(ctx)
  const dto = ctx.body
  validateLrcSize(dto.lyric)
  validateLrcSize(dto.lyricTranslation)
  const song = state.songs.find((s) => s.id === num(dto.id))
  if (!song) throw mockError(500, '歌曲不存在')
  Object.assign(song, {
    title: dto.title,
    singerId: num(dto.singerId),
    categoryId: num(dto.categoryId),
    album: dto.album ?? song.album,
    duration: num(dto.duration),
    cover: dto.cover ?? song.cover,
    audioUrl: dto.audioUrl,
    lyric: dto.lyric ?? song.lyric,
    lyricTranslation: dto.lyricTranslation ?? song.lyricTranslation,
    status: dto.status ?? song.status
  })
  return songVO(song)
})

route('delete', '/song/:id', async (ctx) => {
  requireAdmin(ctx)
  const id = num(ctx.params.id)
  state.songs = state.songs.filter((s) => s.id !== id)
  state.playlistSongs = state.playlistSongs.filter((ps) => ps.songId !== id)
  state.favorites = state.favorites.filter((f) => f.songId !== id)
  return null
})

route('put', '/song/:id/play', async (ctx) => {
  const song = state.songs.find((s) => s.id === num(ctx.params.id))
  if (!song) throw mockError(500, '歌曲不存在')
  if (song.status !== 1) throw mockError(500, '歌曲已下架')
  song.playCount = (song.playCount || 0) + 1
  if (ctx.user) {
    const now = new Date().toISOString()
    let row = state.playHistory.find((item) => item.userId === ctx.user.id && item.songId === song.id)
    if (row) {
      row.playCount += 1
      row.lastPlayedAt = now
    } else {
      row = { id: state.genId(), userId: ctx.user.id, songId: song.id, playCount: 1, lastPlayedAt: now }
      state.playHistory.push(row)
    }
  }
  return song.playCount
})

// ---------- 歌曲分类 ----------
route('get', '/category/list', async () => {
  return clone(state.categories.filter((c) => c.status === 1).sort((a, b) => a.sort - b.sort))
})

route('post', '/category', async (ctx) => {
  requireAdmin(ctx)
  const dto = ctx.body
  const category = {
    id: state.genId(),
    name: dto.name,
    parentId: dto.parentId ?? 0,
    sort: dto.sort ?? 0,
    status: 1,
    createTime: new Date().toISOString().slice(0, 19).replace('T', ' ')
  }
  state.categories.push(category)
  return clone(category)
})

route('put', '/category', async (ctx) => {
  requireAdmin(ctx)
  const dto = ctx.body
  const category = state.categories.find((c) => c.id === num(dto.id))
  if (!category) throw mockError(500, '歌曲分类不存在')
  category.name = dto.name
  category.sort = dto.sort ?? category.sort
  if (dto.parentId !== undefined) category.parentId = dto.parentId
  return clone(category)
})

route('delete', '/category/:id', async (ctx) => {
  requireAdmin(ctx)
  const id = num(ctx.params.id)
  if (state.songs.some((s) => s.categoryId === id)) throw mockError(500, '该分类下存在歌曲，无法删除')
  state.categories = state.categories.filter((c) => c.id !== id)
  return null
})

// ---------- 歌单 ----------
route('get', '/playlist/backup', async (ctx) => {
  const user = requireUser(ctx)
  const owned = state.playlists.filter((playlist) => playlist.creatorId === user.id).sort((a, b) => a.id - b.id)
  if (owned.length > 200) throw mockError(400, '单次最多导出 200 张歌单，请先减少歌单数量')
  let totalSongs = 0
  const playlists = owned.map((playlist) => {
    const songs = state.playlistSongs
      .filter((relation) => relation.playlistId === playlist.id)
      .sort((a, b) => a.sort - b.sort || a.id - b.id)
      .map((relation) => state.songs.find((song) => song.id === relation.songId && song.status === 1))
      .filter(Boolean)
      .map((song) => {
        const view = songVO(song)
        return {
          id: String(view.id),
          title: view.title,
          singerName: view.singerName || '',
          album: view.album || '',
          duration: view.duration ?? null
        }
      })
    if (songs.length > 2000) throw mockError(400, `歌单「${playlist.name}」超过单次备份的曲目上限`)
    totalSongs += songs.length
    return {
      name: playlist.name,
      description: playlist.description || '',
      sourcePublic: playlist.isPublic === 1,
      songs
    }
  })
  if (totalSongs > 10000) throw mockError(400, '单次最多备份 10000 首歌曲')
  const backup = {
    format: PLAYLIST_BACKUP_FORMAT,
    version: PLAYLIST_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    playlists
  }
  try {
    if (new TextEncoder().encode(JSON.stringify(backup)).length > 2 * 1024 * 1024) {
      throw mockError(400, '歌单备份文件不能超过 2 MB')
    }
  } catch (error) {
    if (error.code) throw error
    throw mockError(400, '无法生成歌单备份')
  }
  return backup
})

route('post', '/playlist/backup/preview', async (ctx) => {
  const user = requireUser(ctx)
  let backup
  try {
    backup = parsePlaylistBackup(ctx.body)
  } catch (error) {
    throw mockError(400, error.message || '歌单备份无效')
  }
  return createPlaylistBackupPreview(backup, user)
})

route('post', '/playlist/backup/import', async (ctx) => {
  const user = requireUser(ctx)
  let backup
  try {
    backup = parsePlaylistBackup(ctx.body?.backup)
  } catch (error) {
    throw mockError(400, error.message || '歌单备份无效')
  }
  const selectedIndexes = ctx.body?.selectedPlaylistIndexes
  const publicIndexes = ctx.body?.publicPlaylistIndexes || []
  const rawChoices = ctx.body?.trackChoices || []
  const indexSet = new Set()
  if (!Array.isArray(selectedIndexes) || selectedIndexes.length === 0 || selectedIndexes.length > 200) {
    throw mockError(400, '至少选择一张歌单')
  }
  for (const index of selectedIndexes) {
    if (!Number.isInteger(index) || index < 0 || index >= backup.playlists.length || indexSet.has(index)) {
      throw mockError(400, '歌单选择列表包含重复或无效项')
    }
    indexSet.add(index)
  }
  const publicSet = new Set()
  if (!Array.isArray(publicIndexes)) throw mockError(400, '公开歌单选择无效')
  for (const index of publicIndexes) {
    if (!indexSet.has(index) || publicSet.has(index)) throw mockError(400, '公开设置只能应用于已选中的歌单')
    publicSet.add(index)
  }

  const preview = createPlaylistBackupPreview(backup, user)
  const choices = new Map()
  if (!Array.isArray(rawChoices) || rawChoices.length > 10000) throw mockError(400, '人工匹配曲目数量超出上限')
  for (const choice of rawChoices) {
    if (!choice || !indexSet.has(choice.playlistIndex) || !Number.isInteger(choice.trackIndex)) {
      throw mockError(400, '曲目匹配选择无效')
    }
    const track = preview.playlists[choice.playlistIndex]?.tracks?.[choice.trackIndex]
    if (track?.status !== 'ambiguous' || !track.candidates.some((candidate) => candidate.id === String(choice.songId))) {
      throw mockError(400, '所选歌曲不属于此曲目的候选项')
    }
    const key = `${choice.playlistIndex}:${choice.trackIndex}`
    if (choices.has(key)) throw mockError(400, '同一曲目不能选择多个匹配项')
    choices.set(key, String(choice.songId))
  }

  const usedNames = new Set(state.playlists.filter((playlist) => playlist.creatorId === user.id).map((playlist) => normalizePlaylistName(playlist.name)))
  const imported = []
  let importedSongCount = 0
  let missingSongCount = 0
  let ambiguousSkippedCount = 0
  for (let playlistIndex = 0; playlistIndex < backup.playlists.length; playlistIndex += 1) {
    if (!indexSet.has(playlistIndex)) continue
    const source = backup.playlists[playlistIndex]
    const matchedPlaylist = preview.playlists[playlistIndex]
    const songIds = []
    const uniqueSongs = new Set()
    let missingCount = 0
    let skippedAmbiguous = 0
    for (const track of matchedPlaylist.tracks) {
      let targetId = track.status === 'matched' ? track.resolvedSongId : null
      if (track.status === 'ambiguous') {
        targetId = choices.get(`${playlistIndex}:${track.index}`) || null
        if (!targetId) skippedAmbiguous += 1
      }
      if (track.status === 'missing') missingCount += 1
      const parsedId = Number(targetId)
      if (targetId && Number.isSafeInteger(parsedId) && !uniqueSongs.has(parsedId)) {
        uniqueSongs.add(parsedId)
        songIds.push(parsedId)
      }
    }

    let name = matchedPlaylist.suggestedName
    if (usedNames.has(normalizePlaylistName(name))) name = uniqueImportedPlaylistName(name, usedNames)
    else usedNames.add(normalizePlaylistName(name))
    const playlist = {
      id: state.genId(),
      name,
      cover: '',
      description: source.description || '',
      creatorId: user.id,
      isPublic: publicSet.has(playlistIndex) ? 1 : 0,
      playCount: 0,
      createTime: new Date().toISOString().slice(0, 19).replace('T', ' ')
    }
    state.playlists.push(playlist)
    let sort = 0
    let added = 0
    for (const songId of songIds) {
      const song = state.songs.find((row) => row.id === songId && row.status === 1)
      if (!song) continue
      state.playlistSongs.push({ id: state.genId(), playlistId: playlist.id, songId, sort: ++sort, createTime: new Date().toISOString().slice(0, 19).replace('T', ' ') })
      added += 1
    }
    imported.push({
      playlistId: String(playlist.id),
      sourceName: source.name,
      importedName: name,
      addedSongCount: added,
      missingSongCount: missingCount,
      ambiguousSkippedCount: skippedAmbiguous,
      isPublic: publicSet.has(playlistIndex)
    })
    importedSongCount += added
    missingSongCount += missingCount
    ambiguousSkippedCount += skippedAmbiguous
  }
  return {
    importedPlaylistCount: imported.length,
    importedSongCount,
    missingSongCount,
    ambiguousSkippedCount,
    playlists: imported
  }
})

route('get', '/playlist/page', async (ctx) => {
  const { pageNum = 1, pageSize = 12, keyword, onlyMine } = ctx.params
  let list = state.playlists
  if (keyword) list = list.filter((p) => p.name.includes(keyword))
  if (onlyMine === 'true' || onlyMine === true) {
    if (!ctx.user) return pageOf([], num(pageNum, 1), num(pageSize, 12))
    list = list.filter((p) => p.creatorId === ctx.user.id)
  } else {
    list = list.filter((p) => p.isPublic === 1 || (ctx.user && p.creatorId === ctx.user.id))
  }
  list = [...list].sort((a, b) => b.playCount - a.playCount || b.id - a.id)
  const paged = pageOf(list, num(pageNum, 1), num(pageSize, 12))
  paged.records = paged.records.map(playlistVO)
  return paged
})

route('get', '/playlist/:id', async (ctx) => {
  const playlist = state.playlists.find((p) => p.id === num(ctx.params.id))
  if (!playlist) throw mockError(500, '歌单不存在')
  if (playlist.isPublic !== 1 && !(ctx.user && (ctx.user.role === 0 || playlist.creatorId === ctx.user.id))) {
    throw mockError(404, '歌单不存在')
  }
  return playlistVO(playlist)
})

route('get', '/playlist/:id/songs', async (ctx) => {
  const id = num(ctx.params.id)
  const playlist = state.playlists.find((p) => p.id === id)
  if (!playlist) throw mockError(500, '歌单不存在')
  if (playlist.isPublic !== 1 && !(ctx.user && (ctx.user.role === 0 || playlist.creatorId === ctx.user.id))) {
    throw mockError(404, '歌单不存在')
  }
  const relations = state.playlistSongs
    .filter((ps) => ps.playlistId === id)
    .sort((a, b) => a.sort - b.sort)
  const result = []
  for (const rel of relations) {
    const song = state.songs.find((s) => s.id === rel.songId)
    if (song) result.push(songListVO(song))
  }
  return result
})

route('post', '/playlist', async (ctx) => {
  const user = requireUser(ctx)
  const dto = ctx.body
  const playlist = {
    id: state.genId(),
    name: dto.name,
    cover: dto.cover || '',
    description: dto.description || '',
    creatorId: user.id,
    isPublic: dto.isPublic ?? 1,
    playCount: 0,
    createTime: new Date().toISOString().slice(0, 19).replace('T', ' ')
  }
  state.playlists.push(playlist)
  return playlistVO(playlist)
})

route('put', '/playlist', async (ctx) => {
  const user = requireUser(ctx)
  const dto = ctx.body
  const playlist = state.playlists.find((p) => p.id === num(dto.id))
  if (!playlist) throw mockError(500, '歌单不存在')
  if (playlist.creatorId !== user.id && user.role !== 0) throw mockError(403, '只能操作自己创建的歌单')
  playlist.name = dto.name
  playlist.cover = dto.cover ?? playlist.cover
  playlist.description = dto.description ?? playlist.description
  if (dto.isPublic !== undefined) playlist.isPublic = dto.isPublic
  return playlistVO(playlist)
})

route('delete', '/playlist/:id', async (ctx) => {
  const user = requireUser(ctx)
  const id = num(ctx.params.id)
  const playlist = state.playlists.find((p) => p.id === id)
  if (!playlist) throw mockError(500, '歌单不存在')
  if (playlist.creatorId !== user.id && user.role !== 0) throw mockError(403, '只能操作自己创建的歌单')
  state.playlists = state.playlists.filter((p) => p.id !== id)
  state.playlistSongs = state.playlistSongs.filter((ps) => ps.playlistId !== id)
  return null
})

route('post', '/playlist/:id/songs', async (ctx) => {
  const user = requireUser(ctx)
  const id = num(ctx.params.id)
  const playlist = state.playlists.find((p) => p.id === id)
  if (!playlist) throw mockError(500, '歌单不存在')
  if (playlist.creatorId !== user.id && user.role !== 0) throw mockError(403, '只能操作自己创建的歌单')
  const songIds = Array.isArray(ctx.body) ? ctx.body : []
  const existIds = new Set(state.playlistSongs.filter((ps) => ps.playlistId === id).map((ps) => ps.songId))
  let maxSort = state.playlistSongs.filter((ps) => ps.playlistId === id).reduce((m, ps) => Math.max(m, ps.sort || 0), 0)
  let added = 0
  for (const value of songIds) {
    const songId = num(value)
    if (existIds.has(songId)) continue
    if (!state.songs.some((s) => s.id === songId)) continue
    state.playlistSongs.push({ id: state.genId(), playlistId: id, songId, sort: ++maxSort, createTime: new Date().toISOString().slice(0, 19).replace('T', ' ') })
    existIds.add(songId)
    added++
  }
  return added
})

route('delete', '/playlist/:id/songs/:songId', async (ctx) => {
  const user = requireUser(ctx)
  const id = num(ctx.params.id)
  const playlist = state.playlists.find((p) => p.id === id)
  if (!playlist) throw mockError(500, '歌单不存在')
  if (playlist.creatorId !== user.id && user.role !== 0) throw mockError(403, '只能操作自己创建的歌单')
  state.playlistSongs = state.playlistSongs.filter((ps) => !(ps.playlistId === id && ps.songId === num(ctx.params.songId)))
  return null
})

// ---------- 歌曲 / 歌单短评 ----------
route('get', '/review/page', async (ctx) => {
  const targetType = String(ctx.params.targetType || '')
  const targetId = num(ctx.params.targetId, NaN)
  assertReviewTargetVisible(targetType, targetId, ctx.user)
  const list = state.reviews
    .filter((review) => review.targetType === targetType && review.targetId === targetId && (
      review.status === 1 || (ctx.user && review.userId === ctx.user.id && review.status === 0)
    ))
    .sort((a, b) => String(b.createTime).localeCompare(String(a.createTime)) || b.id - a.id)
    .map((review) => musicReviewVO(review, ctx.user))
  return pageOf(list, Math.max(1, num(ctx.params.pageNum, 1)), Math.min(50, Math.max(1, num(ctx.params.pageSize, 10))))
})

route('post', '/review', async (ctx) => {
  const user = requireUser(ctx)
  const { targetType, targetId: rawTargetId, content } = ctx.body
  const targetId = num(rawTargetId, NaN)
  assertReviewTargetVisible(targetType, targetId, user)
  const text = String(content || '').trim()
  if (!text) throw mockError(400, '短评内容不能为空')
  if (text.length > 500) throw mockError(400, '短评最多 500 个字符')
  const since = Date.now() - 60_000
  const recentCount = state.reviews.filter((review) => review.userId === user.id && review.status !== 2 &&
    Date.parse(`${String(review.createTime).replace(' ', 'T')}Z`) >= since).length
  if (recentCount >= 3) throw mockError(429, '发布太频繁，请稍后再试（每分钟最多 3 条）')
  const review = {
    id: state.genId(), targetType, targetId, userId: user.id, content: text,
    likeCount: 0, status: 1, moderationNote: null,
    createTime: new Date().toISOString().slice(0, 19).replace('T', ' ')
  }
  state.reviews.push(review)
  return musicReviewVO(review, user)
})

route('delete', '/review/:id', async (ctx) => {
  const user = requireUser(ctx)
  const review = state.reviews.find((item) => item.id === num(ctx.params.id))
  if (!review) throw mockError(404, '短评不存在')
  if (review.userId !== user.id) throw mockError(403, '只能删除自己发布的短评')
  review.status = 2
  review.moderationNote = null
  return null
})

route('put', '/review/:id/like', async (ctx) => {
  const user = requireUser(ctx)
  const review = state.reviews.find((item) => item.id === num(ctx.params.id) && item.status === 1)
  if (!review) throw mockError(404, '短评不存在或已隐藏')
  assertReviewTargetVisible(review.targetType, review.targetId, user)
  const liked = ctx.body?.liked === true
  const index = state.reviewLikes.findIndex((like) => like.reviewId === review.id && like.userId === user.id)
  if (liked && index < 0) {
    state.reviewLikes.push({ id: state.genId(), reviewId: review.id, userId: user.id })
    review.likeCount++
  } else if (!liked && index >= 0) {
    state.reviewLikes.splice(index, 1)
    review.likeCount = Math.max(0, review.likeCount - 1)
  }
  return { liked, likeCount: review.likeCount }
})

route('post', '/review/:id/report', async (ctx) => {
  const user = requireUser(ctx)
  const review = state.reviews.find((item) => item.id === num(ctx.params.id) && item.status === 1)
  if (!review) throw mockError(404, '短评不存在或已隐藏')
  if (review.userId === user.id) throw mockError(400, '不能举报自己发布的短评')
  assertReviewTargetVisible(review.targetType, review.targetId, user)
  if (state.reviewReports.some((item) => item.reviewId === review.id && item.reporterId === user.id)) {
    throw mockError(409, '你已举报过这条短评，管理员会尽快处理')
  }
  const { reason, details } = ctx.body
  if (!['spam', 'abuse', 'copyright', 'other'].includes(reason)) throw mockError(400, '举报原因无效')
  if (String(details || '').length > 300) throw mockError(400, '补充说明最多 300 个字符')
  state.reviewReports.push({
    id: state.genId(), reviewId: review.id, reporterId: user.id, reason,
    details: String(details || '').trim() || null, status: 0, action: null,
    handledBy: null, adminNote: null, handledAt: null,
    createTime: new Date().toISOString().slice(0, 19).replace('T', ' ')
  })
  return null
})

route('get', '/review/admin/page', async (ctx) => {
  requireAdmin(ctx)
  const { pageNum = 1, pageSize = 10, targetType, targetId, status } = ctx.params
  const filtered = state.reviews.filter((review) => {
    if (targetType && review.targetType !== targetType) return false
    if (targetId && review.targetId !== num(targetId)) return false
    if (status !== undefined && status !== '' && review.status !== num(status)) return false
    if ((status === undefined || status === '') && review.status === 2) return false
    return true
  }).sort((a, b) => String(b.createTime).localeCompare(String(a.createTime)) || b.id - a.id)
    .map((review) => musicReviewVO(review, ctx.user))
  return pageOf(filtered, Math.max(1, num(pageNum, 1)), Math.min(50, Math.max(1, num(pageSize, 10))))
})

route('get', '/review/admin/reports/page', async (ctx) => {
  requireAdmin(ctx)
  const status = ctx.params.status === undefined || ctx.params.status === '' ? 0 : num(ctx.params.status)
  const reports = state.reviewReports.filter((report) => report.status === status)
    .sort((a, b) => String(b.createTime).localeCompare(String(a.createTime)) || b.id - a.id)
  const records = reports.map((report) => {
    const review = state.reviews.find((item) => item.id === report.reviewId)
    const author = state.users.find((item) => item.id === review?.userId)
    const reporter = state.users.find((item) => item.id === report.reporterId)
    const handler = state.users.find((item) => item.id === report.handledBy)
    return {
      ...clone(report),
      targetType: review?.targetType || null,
      targetId: review?.targetId || null,
      targetTitle: review ? reviewTargetTitle(review.targetType, review.targetId) : '短评已删除',
      reviewContent: review?.content || '短评记录不可用',
      reviewStatus: review?.status ?? null,
      authorName: author?.nickname || '音乐听众',
      reporterName: reporter?.nickname || '音乐听众',
      handlerName: handler?.nickname || ''
    }
  })
  return pageOf(records, Math.max(1, num(ctx.params.pageNum, 1)), Math.min(50, Math.max(1, num(ctx.params.pageSize, 10))))
})

route('put', '/review/admin/:id/visibility', async (ctx) => {
  const admin = requireAdmin(ctx)
  const review = state.reviews.find((item) => item.id === num(ctx.params.id))
  if (!review) throw mockError(404, '短评不存在')
  if (review.status === 2) throw mockError(409, '作者已删除该短评，不能恢复')
  const hidden = ctx.body?.hidden === true
  const note = String(ctx.body?.note || '').trim() || null
  review.status = hidden ? 0 : 1
  review.moderationNote = hidden ? note || '经管理员审核，暂时隐藏' : null
  if (hidden) {
    const handledAt = new Date().toISOString().slice(0, 19).replace('T', ' ')
    state.reviewReports.forEach((report) => {
      if (report.reviewId === review.id && report.status === 0) {
        Object.assign(report, {
          status: 1,
          action: 'hide',
          handledBy: admin.id,
          handledAt,
          adminNote: note
        })
      }
    })
  }
  return null
})

route('put', '/review/admin/reports/:id', async (ctx) => {
  const admin = requireAdmin(ctx)
  const report = state.reviewReports.find((item) => item.id === num(ctx.params.id))
  if (!report) throw mockError(404, '举报记录不存在')
  if (report.status !== 0) throw mockError(409, '该举报已处理')
  const note = String(ctx.body?.note || '').trim() || null
  if (ctx.body?.action === 'hide') {
    const review = state.reviews.find((item) => item.id === report.reviewId)
    if (review && review.status !== 2) {
      review.status = 0
      review.moderationNote = note || '经举报审核，短评已隐藏'
    }
    const handledAt = new Date().toISOString().slice(0, 19).replace('T', ' ')
    state.reviewReports.forEach((item) => {
      if (item.reviewId === report.reviewId && item.status === 0) {
        Object.assign(item, { status: 1, action: 'hide', handledBy: admin.id, handledAt, adminNote: note })
      }
    })
    return null
  }
  if (ctx.body?.action !== 'dismiss') throw mockError(400, '处理方式无效')
  Object.assign(report, {
    status: 2, action: 'dismiss', handledBy: admin.id,
    handledAt: new Date().toISOString().slice(0, 19).replace('T', ' '), adminNote: note
  })
  return null
})

// ---------- 播放列表（服务端队列） ----------
const queueOf = (userId) => {
  if (!state.queues[userId]) state.queues[userId] = []
  return state.queues[userId]
}

route('get', '/play/queue', async (ctx) => {
  const user = requireUser(ctx)
  return queueOf(user.id)
    .map((id) => state.songs.find((s) => s.id === id))
    .filter(Boolean)
    .map(songListVO)
})

route('post', '/play/queue/add', async (ctx) => {
  const user = requireUser(ctx)
  const songId = num(ctx.params.songId)
  if (!state.songs.some((s) => s.id === songId)) throw mockError(500, '歌曲不存在：' + songId)
  const queue = queueOf(user.id)
  const idx = queue.indexOf(songId)
  if (idx >= 0) queue.splice(idx, 1)
  queue.push(songId)
  return queue.length
})

route('post', '/play/queue/addBatch', async (ctx) => {
  const user = requireUser(ctx)
  const songIds = Array.isArray(ctx.body) ? ctx.body.map(num) : []
  if (songIds.length === 0) throw mockError(500, '歌曲列表不能为空')
  const queue = queueOf(user.id)
  let added = 0
  for (const id of songIds) {
    if (!state.songs.some((s) => s.id === id)) throw mockError(500, '歌曲不存在：' + id)
    if (!queue.includes(id)) {
      queue.push(id)
      added++
    }
  }
  return queue.length
})

route('delete', '/play/queue/clear', async (ctx) => {
  const user = requireUser(ctx)
  state.queues[user.id] = []
  return null
})

route('delete', '/play/queue/:songId', async (ctx) => {
  const user = requireUser(ctx)
  const queue = queueOf(user.id)
  const idx = queue.indexOf(num(ctx.params.songId))
  if (idx >= 0) queue.splice(idx, 1)
  return null
})

// ---------- 最近播放 ----------
route('get', '/history/page', async (ctx) => {
  const user = requireUser(ctx)
  const { pageNum = 1, pageSize = 20 } = ctx.params
  const list = state.playHistory
    .filter((row) => row.userId === user.id)
    .sort((a, b) => String(b.lastPlayedAt).localeCompare(String(a.lastPlayedAt)))
    .map((row) => {
      const song = state.songs.find((item) => item.id === row.songId)
      if (!song || song.status !== 1) return null
      const vo = songListVO(song)
      vo.personalPlayCount = row.playCount
      vo.lastPlayedAt = row.lastPlayedAt
      vo.favorite = state.favorites.some((f) => f.userId === user.id && f.songId === song.id)
      return vo
    })
    .filter(Boolean)
  return pageOf(list, num(pageNum, 1), Math.min(50, num(pageSize, 20)))
})

route('delete', '/history', async (ctx) => {
  const user = requireUser(ctx)
  state.playHistory = state.playHistory.filter((row) => row.userId !== user.id)
  return null
})

route('delete', '/history/:songId', async (ctx) => {
  const user = requireUser(ctx)
  const songId = num(ctx.params.songId)
  state.playHistory = state.playHistory.filter((row) => !(row.userId === user.id && row.songId === songId))
  return null
})

// ---------- 歌词 ----------
route('get', '/lyric/parse', async (ctx) => {
  const song = state.songs.find((s) => s.id === num(ctx.params.songId))
  if (!song) throw mockError(500, '歌曲不存在')
  return {
    songId: song.id,
    title: song.title,
    lines: parseLrc(song.lyric),
    translationLines: parseLrc(song.lyricTranslation)
  }
})

route('get', '/lyric/export', async (ctx) => {
  const song = state.songs.find((s) => s.id === num(ctx.params.songId))
  if (!song) throw mockError(500, '歌曲不存在')
  const variant = String(ctx.params.variant || 'original').toLowerCase()
  if (!['original', 'translation'].includes(variant)) throw mockError(400, '歌词类型无效')
  const lrc = variant === 'translation' ? song.lyricTranslation : song.lyric
  return new Blob([toLrc(parseLrc(lrc))], { type: 'text/plain;charset=utf-8' })
})

route('put', '/lyric', async (ctx) => {
  requireUser(ctx)
  const { songId, lyric, lyricTranslation } = ctx.body
  validateLrcSize(lyric)
  validateLrcSize(lyricTranslation)
  const song = state.songs.find((s) => s.id === num(songId))
  if (!song) throw mockError(500, '歌曲不存在')
  // 未提交字段时保持原值；提交空字符串才显式清空。
  if (lyric != null) song.lyric = lyric
  if (lyricTranslation != null) song.lyricTranslation = lyricTranslation
  return null
})

route('post', '/lyric/upload', async (ctx) => {
  requireUser(ctx)
  const songId = num(ctx.params.songId)
  const song = state.songs.find((s) => s.id === songId)
  if (!song) throw mockError(500, '歌曲不存在')
  if (!ctx.file) throw mockError(500, '上传文件不能为空')
  const extension = String(ctx.file.name || '').split('.').pop().toLowerCase()
  if (!['lrc', 'txt'].includes(extension)) throw mockError(500, '仅支持 .lrc / .txt 歌词文件')
  if (ctx.file.size > 65_535) throw mockError(500, '单份 LRC 文本不能超过 64 KB')
  const variant = String(ctx.params.variant || 'original').toLowerCase()
  if (!['original', 'translation'].includes(variant)) throw mockError(400, '歌词类型无效')
  const lrc = await readTextFile(ctx.file)
  if (variant === 'translation') song.lyricTranslation = lrc
  else song.lyric = lrc
  return null
})

// ---------- 收藏 ----------
route('post', '/favorite/:songId', async (ctx) => {
  const user = requireUser(ctx)
  const songId = num(ctx.params.songId)
  if (!state.songs.some((s) => s.id === songId)) throw mockError(500, '歌曲不存在')
  if (state.favorites.some((f) => f.userId === user.id && f.songId === songId)) throw mockError(500, '已收藏过该歌曲')
  state.favorites.push({ id: state.genId(), userId: user.id, songId, createTime: new Date().toISOString().slice(0, 19).replace('T', ' ') })
  return null
})

route('delete', '/favorite/:songId', async (ctx) => {
  const user = requireUser(ctx)
  const songId = num(ctx.params.songId)
  state.favorites = state.favorites.filter((f) => !(f.userId === user.id && f.songId === songId))
  return null
})

route('get', '/favorite/page', async (ctx) => {
  const user = requireUser(ctx)
  const { pageNum = 1, pageSize = 10 } = ctx.params
  const list = state.favorites
    .filter((f) => f.userId === user.id)
    .sort((a, b) => (b.createTime || '').localeCompare(a.createTime || ''))
    .map((f) => state.songs.find((s) => s.id === f.songId))
    .filter(Boolean)
  const paged = pageOf(list, num(pageNum, 1), num(pageSize, 10))
  paged.records = paged.records.map((s) => {
    const vo = songListVO(s)
    vo.favorite = true
    return vo
  })
  return paged
})

route('get', '/favorite/ids', async (ctx) => {
  const user = requireUser(ctx)
  return state.favorites.filter((f) => f.userId === user.id).map((f) => f.songId)
})

route('get', '/favorite/check', async (ctx) => {
  const user = requireUser(ctx)
  return state.favorites.some((f) => f.userId === user.id && f.songId === num(ctx.params.songId))
})

// ---------- 公共 ----------
route('get', '/common/dict/all', async () => {
  const map = {}
  for (const d of state.dictData.filter((d) => d.status === 1)) {
    if (!map[d.dictType]) map[d.dictType] = []
    map[d.dictType].push({ label: d.dictLabel, value: d.dictValue })
  }
  return map
})

route('get', '/common/dict/:dictType', async (ctx) => {
  return state.dictData
    .filter((d) => d.dictType === ctx.params.dictType && d.status === 1)
    .sort((a, b) => a.sort - b.sort)
    .map((d) => ({ label: d.dictLabel, value: d.dictValue }))
})

route('post', '/common/upload', async (ctx) => {
  requireUser(ctx)
  const file = ctx.file
  if (!file) throw mockError(500, '上传文件不能为空')
  return { url: `/profile/mock_${Date.now()}_${file.name}`, name: file.name, size: file.size }
})

route('get', '/common/stats', async (ctx) => {
  requireAdmin(ctx)
  const categoryStats = state.categories.map((c) => ({
    name: c.name,
    value: state.songs.filter((s) => s.categoryId === c.id).length
  })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value)

  const singerStats = state.singers.map((s) => ({
    name: s.name,
    value: state.songs.filter((song) => song.singerId === s.id).length
  })).sort((a, b) => b.value - a.value).slice(0, 10)

  const playStats = state.singers.map((s) => ({
    name: s.name,
    value: state.songs.filter((song) => song.singerId === s.id).reduce((sum, song) => sum + (song.playCount || 0), 0)
  })).sort((a, b) => b.value - a.value).slice(0, 10)

  return {
    userCount: state.users.length,
    singerCount: state.singers.length,
    songCount: state.songs.length,
    playlistCount: state.playlists.length,
    totalPlayCount: state.songs.reduce((sum, s) => sum + (s.playCount || 0), 0),
    categoryStats,
    singerStats,
    playStats
  }
})

// ------------------------------------------------------------
// 请求入口
// ------------------------------------------------------------
export async function mockRequest(config) {
  const method = (config.method || 'get').toLowerCase()
  const url = (config.url || '').replace(/\/+$/, '')
  const found = matchRoute(method, url)

  const isForm = config.data instanceof FormData
  const ctx = {
    params: { ...(found?.pathParams || {}), ...(config.params || {}) },
    body: isForm ? Object.fromEntries(config.data.entries()) : (config.data || {}),
    file: isForm ? config.data.get('file') : null,
    user: currentUser(config)
  }

  try {
    if (!found) throw mockError(404, `Mock 未实现的接口: ${method.toUpperCase()} ${url}`)
    // 模拟少量网络耗时
    await sleep(60 + Math.floor(Math.random() * 140))
    return await found.handler(ctx)
  } catch (e) {
    const code = e.code || 500
    const msg = e.msg || e.message || '请求失败'
    if (code === 401) {
      const userStore = useUserStore()
      userStore.logoutLocal()
      if (router.currentRoute.value.path !== '/login') {
        router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } })
      }
    }
    ElMessage.error(msg)
    throw e
  }
}
