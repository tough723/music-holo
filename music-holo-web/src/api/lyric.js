import { api, rawPost } from './request'
import { downloadFile } from '@/utils/download'

/** 歌词处理相关接口 */
export const parse = (songId) => api({ url: '/lyric/parse', method: 'get', params: { songId } })

/** 导出歌词 .lrc 文件 */
export const exportLrc = (songId, title) => downloadFile('/lyric/export', { songId }, `${title || 'lyric'}.lrc`)

/** 保存歌词 */
export const save = (data) => api({ url: '/lyric', method: 'put', data })

/** 上传歌词文件 */
export const upload = (songId, file) => {
  const formData = new FormData()
  formData.append('file', file)
  return rawPost(`/lyric/upload?songId=${songId}`, formData)
}
