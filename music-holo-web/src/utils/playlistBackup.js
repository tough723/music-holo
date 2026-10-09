export const PLAYLIST_BACKUP_FORMAT = 'music-holo-playlists'
export const PLAYLIST_BACKUP_VERSION = 1
export const MAX_PLAYLIST_BACKUP_BYTES = 2 * 1024 * 1024
export const MAX_PLAYLIST_BACKUP_PLAYLISTS = 200
export const MAX_PLAYLIST_BACKUP_SONGS = 10_000

function backupError(message) {
  const error = new Error(message)
  error.name = 'PlaylistBackupError'
  return error
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function cleanText(value, field, maxLength, { required = false } = {}) {
  if (value == null) {
    if (required) throw backupError(`${field}不能为空。`)
    return ''
  }
  if (typeof value !== 'string') throw backupError(`${field}字段无效。`)
  const trimmed = value.trim()
  if (required && !trimmed) throw backupError(`${field}不能为空。`)
  if (trimmed.length > maxLength) throw backupError(`${field}超过 ${maxLength} 个字符。`)
  return trimmed
}

function cleanSongId(value) {
  if (value == null || value === '') return null
  if (typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value)
    && (value.length < 19 || value <= '9223372036854775807')) return value
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value)
  throw backupError('歌曲 ID 字段无效。')
}

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength
}

/**
 * Parse and project an imported JSON file onto the supported schema. Unknown fields are
 * discarded, so tokens, scripts, lyrics, and media URLs are never sent back to the server.
 */
export function parsePlaylistBackup(input) {
  let payload = input
  if (typeof input === 'string') {
    if (byteLength(input) > MAX_PLAYLIST_BACKUP_BYTES) throw backupError('歌单备份文件不能超过 2 MB。')
    try {
      payload = JSON.parse(input)
    } catch {
      throw backupError('文件不是有效的 JSON。')
    }
  }

  if (!isObject(payload)) throw backupError('歌单备份结构无效。')
  if (payload.format !== PLAYLIST_BACKUP_FORMAT) throw backupError('这不是 Music Holo 歌单备份。')
  if (payload.version !== PLAYLIST_BACKUP_VERSION) throw backupError('暂不支持此歌单备份版本。')
  if (!Array.isArray(payload.playlists) || payload.playlists.length > MAX_PLAYLIST_BACKUP_PLAYLISTS) {
    throw backupError('歌单数量无效，单次最多支持 200 张。')
  }

  const playlists = []
  let totalSongs = 0
  for (const source of payload.playlists) {
    if (!isObject(source)) throw backupError('备份中包含无效歌单。')
    const name = cleanText(source.name, '歌单名称', 100, { required: true })
    const description = cleanText(source.description, '歌单描述', 500)
    if (!Array.isArray(source.songs) || source.songs.length > 2000) {
      throw backupError(`歌单「${name}」的曲目数量无效，单张最多 2000 首。`)
    }
    totalSongs += source.songs.length
    if (totalSongs > MAX_PLAYLIST_BACKUP_SONGS) throw backupError('单次最多支持 10000 首歌曲。')

    const songs = source.songs.map((track) => {
      if (!isObject(track)) throw backupError(`歌单「${name}」中包含无效曲目。`)
      const title = cleanText(track.title, '歌曲名称', 200, { required: true })
      const singerName = cleanText(track.singerName, '歌手名称', 120)
      const album = cleanText(track.album, '专辑名称', 200)
      const id = cleanSongId(track.id)
      let duration = null
      if (track.duration !== undefined && track.duration !== null) {
        if (!Number.isInteger(track.duration) || track.duration < 0 || track.duration > 86400) {
          throw backupError(`歌曲「${title}」的时长字段无效。`)
        }
        duration = track.duration
      }
      return { id, title, singerName, album, duration }
    })

    if (source.sourcePublic !== undefined && source.sourcePublic !== null && typeof source.sourcePublic !== 'boolean') {
      throw backupError(`歌单「${name}」的公开状态字段无效。`)
    }
    playlists.push({
      name,
      description,
      sourcePublic: typeof source.sourcePublic === 'boolean' ? source.sourcePublic : null,
      songs
    })
  }

  const backup = {
    format: PLAYLIST_BACKUP_FORMAT,
    version: PLAYLIST_BACKUP_VERSION,
    exportedAt: cleanText(payload.exportedAt, '导出时间', 40, { required: true }),
    playlists
  }
  if (byteLength(JSON.stringify(backup)) > MAX_PLAYLIST_BACKUP_BYTES) {
    throw backupError('歌单备份文件不能超过 2 MB。')
  }
  return backup
}

export function serializePlaylistBackup(payload) {
  const backup = parsePlaylistBackup(payload)
  return JSON.stringify(backup)
}
