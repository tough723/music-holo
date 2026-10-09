import { api, rawPost } from './request'
import { downloadFile } from '@/utils/download'

/** 歌词处理相关接口 */
export const parse = (songId) => api({ url: '/lyric/parse', method: 'get', params: { songId } })

/** 导出原歌词或译文为 .lrc 文件 */
export const exportLrc = (songId, title, variant = 'original') => {
  const suffix = variant === 'translation' ? '-translation' : ''
  return downloadFile('/lyric/export', { songId, variant }, `${title || 'lyric'}${suffix}.lrc`)
}

/** 保存原歌词和/或译文；未提交的字段保持服务端现值 */
export const save = (data) => api({ url: '/lyric', method: 'put', data })

/** 上传原歌词或译文文件 */
export const upload = (songId, file, variant = 'original') => {
  const formData = new FormData()
  formData.append('file', file)
  return rawPost('/lyric/upload', formData, { params: { songId, variant } })
}
