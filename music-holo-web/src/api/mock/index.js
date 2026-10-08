/**
 * 内置 Mock 服务：VITE_API_MOCK=true 时接管全部 API 请求，
 * 无需启动后端即可完整体验前端（登录/播放/收藏/管理后台等）。
 */
import { ElMessage } from 'element-plus'
import router from '@/router'
import { useUserStore } from '@/store/user'
import { createSeed, clone } from './seed'

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

function singerVO(singer) {
  const songCount = state.songs.filter((s) => s.singerId === singer.id).length
  return { ...clone(singer), songCount }
}

function playlistVO(playlist) {
  const songCount = state.playlistSongs.filter((ps) => ps.playlistId === playlist.id).length
  const creator = state.users.find((u) => u.id === playlist.creatorId)
  return { ...clone(playlist), songCount, creatorName: creator?.nickname || creator?.username || '' }
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
  return { theme: current, global, themes: ['cyan', 'magenta', 'amber', 'lime'] }
})

route('put', '/system/theme', async (ctx) => {
  const user = requireUser(ctx)
  const { theme, scope } = ctx.body
  const themes = ['cyan', 'magenta', 'amber', 'lime']
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
    .map(songVO)
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
  paged.records = paged.records.map((s) => {
    const vo = songVO(s)
    delete vo.lyric // 列表不返回歌词
    return vo
  })
  return paged
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
  song.playCount = (song.playCount || 0) + 1
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
  return playlistVO(playlist)
})

route('get', '/playlist/:id/songs', async (ctx) => {
  const id = num(ctx.params.id)
  if (!state.playlists.some((p) => p.id === id)) throw mockError(500, '歌单不存在')
  const relations = state.playlistSongs
    .filter((ps) => ps.playlistId === id)
    .sort((a, b) => a.sort - b.sort)
  const result = []
  for (const rel of relations) {
    const song = state.songs.find((s) => s.id === rel.songId)
    if (song) result.push(songVO(song))
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
  const existIds = state.playlistSongs.filter((ps) => ps.playlistId === id).map((ps) => ps.songId)
  let maxSort = state.playlistSongs.filter((ps) => ps.playlistId === id).reduce((m, ps) => Math.max(m, ps.sort || 0), 0)
  let added = 0
  for (const songId of songIds) {
    if (existIds.includes(num(songId))) continue
    if (!state.songs.some((s) => s.id === num(songId))) continue
    state.playlistSongs.push({ id: state.genId(), playlistId: id, songId: num(songId), sort: ++maxSort, createTime: new Date().toISOString().slice(0, 19).replace('T', ' ') })
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
    .map(songVO)
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

// ---------- 歌词 ----------
route('get', '/lyric/parse', async (ctx) => {
  const song = state.songs.find((s) => s.id === num(ctx.params.songId))
  if (!song) throw mockError(500, '歌曲不存在')
  return { songId: song.id, title: song.title, lines: parseLrc(song.lyric) }
})

route('get', '/lyric/export', async (ctx) => {
  const song = state.songs.find((s) => s.id === num(ctx.params.songId))
  if (!song) throw mockError(500, '歌曲不存在')
  return new Blob([toLrc(parseLrc(song.lyric))], { type: 'text/plain;charset=utf-8' })
})

route('put', '/lyric', async (ctx) => {
  requireUser(ctx)
  const { songId, lyric } = ctx.body
  const song = state.songs.find((s) => s.id === num(songId))
  if (!song) throw mockError(500, '歌曲不存在')
  song.lyric = lyric || ''
  return null
})

route('post', '/lyric/upload', async (ctx) => {
  requireUser(ctx)
  const songId = num(ctx.params.songId)
  const song = state.songs.find((s) => s.id === songId)
  if (!song) throw mockError(500, '歌曲不存在')
  if (!ctx.file) throw mockError(500, '上传文件不能为空')
  song.lyric = await ctx.file.text()
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
    const vo = songVO(s)
    delete vo.lyric
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
