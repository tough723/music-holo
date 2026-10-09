import { describe, expect, it } from 'vitest'
import {
  MAX_PLAYLIST_BACKUP_BYTES,
  PLAYLIST_BACKUP_FORMAT,
  PLAYLIST_BACKUP_VERSION,
  parsePlaylistBackup,
  serializePlaylistBackup
} from '@/utils/playlistBackup'

const validBackup = (overrides = {}) => ({
  format: PLAYLIST_BACKUP_FORMAT,
  version: PLAYLIST_BACKUP_VERSION,
  exportedAt: '2026-10-09T08:00:00.000Z',
  playlists: [{
    name: '夜航歌单',
    description: '仅保存歌单文本与曲库引用。',
    sourcePublic: true,
    songs: [{ id: '9007199254740993', title: '远方', singerName: '林澈', album: '夜航', duration: 190 }]
  }],
  ...overrides
})

describe('歌单 JSON 备份校验', () => {
  it('保留大整数曲库 ID 为字符串，只输出显式允许字段', () => {
    const input = validBackup()
    input.password = 'must not be exported'
    input.playlists[0].songs[0].audioUrl = 'https://media.example.test/signed'
    input.playlists[0].songs[0].lyric = '[00:01.00]secret lyric'
    input.playlists[0].songs[0].script = 'untrusted code'

    const parsed = parsePlaylistBackup(input)
    expect(parsed.playlists[0].songs[0].id).toBe('9007199254740993')
    expect(parsed).not.toHaveProperty('password')
    expect(parsed.playlists[0].songs[0]).not.toHaveProperty('audioUrl')
    expect(parsed.playlists[0].songs[0]).not.toHaveProperty('lyric')
    expect(parsed.playlists[0].songs[0]).not.toHaveProperty('script')
    expect(serializePlaylistBackup(input)).not.toMatch(/\"(?:password|audioUrl|lyric|lyricTranslation|script|audio)\"\s*:/)
  })

  it('拒绝错误格式、未知版本、无效歌单字段和不安全的大整数 number', () => {
    expect(() => parsePlaylistBackup(validBackup({ format: 'other' }))).toThrow(/不是 Music Holo/)
    expect(() => parsePlaylistBackup(validBackup({ version: 2 }))).toThrow(/不支持/)
    expect(() => parsePlaylistBackup(validBackup({ playlists: [{ name: ' ', songs: [] }] }))).toThrow(/歌单名称/)
    const unsafeId = validBackup()
    unsafeId.playlists[0].songs[0].id = 9007199254740993
    expect(() => parsePlaylistBackup(unsafeId)).toThrow(/歌曲 ID/)
    const outOfRangeId = validBackup()
    outOfRangeId.playlists[0].songs[0].id = '9223372036854775808'
    expect(() => parsePlaylistBackup(outOfRangeId)).toThrow(/歌曲 ID/)
    const maxLongId = validBackup()
    maxLongId.playlists[0].songs[0].id = '9223372036854775807'
    expect(parsePlaylistBackup(maxLongId).playlists[0].songs[0].id).toBe('9223372036854775807')
  })

  it('按 UTF-8 字节限制文件大小并限制歌单/曲目数量', () => {
    const tooLarge = JSON.stringify(validBackup()) + ' '.repeat(MAX_PLAYLIST_BACKUP_BYTES)
    expect(() => parsePlaylistBackup(tooLarge)).toThrow(/不能超过 2 MB/)
    const tooMany = validBackup({ playlists: Array.from({ length: 201 }, (_, index) => ({ name: `歌单 ${index}`, songs: [] })) })
    expect(() => parsePlaylistBackup(tooMany)).toThrow(/最多支持 200 张/)
    const tooManyTracks = validBackup({ playlists: [{ name: '超限', songs: Array.from({ length: 2001 }, () => ({ title: '曲目' })) }] })
    expect(() => parsePlaylistBackup(tooManyTracks)).toThrow(/最多 2000 首/)
  })
})
