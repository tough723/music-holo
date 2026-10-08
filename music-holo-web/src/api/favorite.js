import { api } from './request'

/** 歌曲收藏相关接口 */
export const add = (songId) => api({ url: `/favorite/${songId}`, method: 'post' })
export const cancel = (songId) => api({ url: `/favorite/${songId}`, method: 'delete' })
export const page = (params) => api({ url: '/favorite/page', method: 'get', params })
export const ids = () => api({ url: '/favorite/ids', method: 'get' })
export const check = (songId) => api({ url: '/favorite/check', method: 'get', params: { songId } })
