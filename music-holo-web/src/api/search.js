import { api } from './request'

/** 跨歌曲、歌词、歌手、歌单统一搜索 */
export const search = (keyword, limit = 8) => api({
  url: '/search',
  method: 'get',
  params: { keyword, limit }
})
