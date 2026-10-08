import { api } from './request'

/** 个性化猜你喜欢；匿名用户由服务端回退热歌榜 */
export const songs = (limit = 8) => api({
  url: '/recommend/songs',
  method: 'get',
  params: { limit }
})
