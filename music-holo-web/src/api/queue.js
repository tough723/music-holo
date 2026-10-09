import { api } from './request'

/** 播放列表相关接口（服务端 Redis 队列） */
export const getQueue = () => api({ url: '/play/queue', method: 'get' })
export const add = (songId) => api({ url: '/play/queue/add', method: 'post', params: { songId } })
export const addBatch = (songIds) => api({ url: '/play/queue/addBatch', method: 'post', data: songIds })
export const remove = (songId) => api({ url: `/play/queue/${songId}`, method: 'delete' })
export const clear = () => api({ url: '/play/queue/clear', method: 'delete' })
