import { api } from './request'

/** 专辑浏览；专辑由现有歌曲曲库聚合，不单独复制曲目数据。 */
export const page = (params = {}) => api({ url: '/album/page', method: 'get', params })
export const detail = (album, singerId) => api({
  url: '/album/detail',
  method: 'get',
  params: { album, singerId }
})
export const songs = (album, singerId) => api({
  url: '/album/songs',
  method: 'get',
  params: { album, singerId }
})
