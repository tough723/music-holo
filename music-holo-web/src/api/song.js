import { api } from './request'

/** 歌曲相关接口 */
export const page = (params) => api({ url: '/song/page', method: 'get', params })
export const detail = (id) => api({ url: `/song/${id}`, method: 'get' })
export const save = (data) => api({ url: '/song', method: data.id ? 'put' : 'post', data })
export const remove = (id) => api({ url: `/song/${id}`, method: 'delete' })

/** 歌曲播放（播放量 +1） */
export const play = (id) => api({ url: `/song/${id}/play`, method: 'put' })
