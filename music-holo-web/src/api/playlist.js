import { api } from './request'

/** 歌单相关接口 */
export const page = (params) => api({ url: '/playlist/page', method: 'get', params })
export const detail = (id) => api({ url: `/playlist/${id}`, method: 'get' })
export const songsOfPlaylist = (id) => api({ url: `/playlist/${id}/songs`, method: 'get' })
export const save = (data) => api({ url: '/playlist', method: data.id ? 'put' : 'post', data })
export const remove = (id) => api({ url: `/playlist/${id}`, method: 'delete' })

/** 批量添加歌曲到歌单 */
export const addSongs = (id, songIds) => api({ url: `/playlist/${id}/songs`, method: 'post', data: songIds })

/** 从歌单移除一首歌曲 */
export const removeSong = (id, songId) => api({ url: `/playlist/${id}/songs/${songId}`, method: 'delete' })

/** 创建者把歌单内一首歌曲上移或下移一位，direction 为 -1 或 1 */
export const moveSong = (id, songId, direction) => api({
  url: `/playlist/${id}/songs/order`,
  method: 'put',
  data: { songId, direction }
})

/** 当前账号歌单备份的导出、预览和导入 */
export const exportBackup = () => api({ url: '/playlist/backup', method: 'get' })
export const previewBackup = (backup) => api({ url: '/playlist/backup/preview', method: 'post', data: backup })
export const importBackup = (data) => api({ url: '/playlist/backup/import', method: 'post', data })
