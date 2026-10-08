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
