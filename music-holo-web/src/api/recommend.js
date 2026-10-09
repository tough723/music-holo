import { api } from './request'

/** 个性化猜你喜欢；匿名用户由服务端回退热歌榜 */
export const songs = (limit = 8) => api({
  url: '/recommend/songs',
  method: 'get',
  params: { limit }
})

/** 围绕当前歌曲生成同歌手/同分类的相似电台 */
export const similar = (sourceSongId, limit = 24) => api({
  url: '/recommend/similar',
  method: 'get',
  params: { sourceSongId, limit }
})
