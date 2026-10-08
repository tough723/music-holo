import { api } from './request'

/** 当前用户最近播放记录 */
export const page = (params = {}) => api({ url: '/history/page', method: 'get', params })
export const remove = (songId) => api({ url: `/history/${songId}`, method: 'delete' })
export const clear = () => api({ url: '/history', method: 'delete' })
