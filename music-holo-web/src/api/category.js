import { api } from './request'

/** 歌曲分类相关接口 */
export const list = () => api({ url: '/category/list', method: 'get' })
export const save = (data) => api({ url: '/category', method: data.id ? 'put' : 'post', data })
export const remove = (id) => api({ url: `/category/${id}`, method: 'delete' })
