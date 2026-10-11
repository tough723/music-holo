import { api, rawPost } from './request'
import { downloadFile } from '@/utils/download'

/** 歌词处理相关接口 */
export const parse = (songId) => api({ url: '/lyric/parse', method: 'get', params: { songId } })

/** 导出原歌词或译文为 .lrc 文件 */
export const exportLrc = (songId, title, variant = 'original') => {
  const suffix = variant === 'translation' ? '-translation' : variant === 'romaji' ? '-romaji' : ''
  return downloadFile('/lyric/export', { songId, variant }, `${title || 'lyric'}${suffix}.lrc`)
}

/** 保存原歌词和/或译文；未提交的字段保持服务端现值 */
export const save = (data) => api({ url: '/lyric', method: 'put', data })

/**
 * 歌词时间轴校正（众包）。服务端接口见 music-holo-server 的 LyricOffsetController。
 * @param {number|string} songId
 * @param {number} offsetMs 正值＝歌词提前出现
 */
export const fetchLyricOffset = (songId) =>
  api({ url: '/lyric/offset', method: 'get', params: { songId } })

/** 提交自己校准的结果；同一账号对同一首歌是覆盖语义。 */
export const submitLyricOffset = (songId, offsetMs) =>
  api({ url: '/lyric/offset', method: 'post', data: { songId, offsetMs } })

/** 撤回自己提交过的校正。 */
export const withdrawLyricOffset = (songId) =>
  api({ url: '/lyric/offset', method: 'delete', params: { songId } })

/** 上传原歌词或译文文件 */
export const upload = (songId, file, variant = 'original') => {
  const formData = new FormData()
  formData.append('file', file)
  return rawPost('/lyric/upload', formData, { params: { songId, variant } })
}
