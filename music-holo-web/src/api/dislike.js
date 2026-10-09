import { api } from './request'

/** 当前账号的不喜欢歌曲与歌手 */
export const summary = () => api({
  url: '/dislike',
  method: 'get'
})

/** 屏蔽一首歌曲；重复添加由服务端视为成功 */
export const addSong = (songId) => api({
  url: `/dislike/song/${songId}`,
  method: 'post'
})

export const removeSong = (songId) => api({
  url: `/dislike/song/${songId}`,
  method: 'delete'
})

/** 屏蔽一位歌手的自动播放与推荐 */
export const addSinger = (singerId) => api({
  url: `/dislike/singer/${singerId}`,
  method: 'post'
})

export const removeSinger = (singerId) => api({
  url: `/dislike/singer/${singerId}`,
  method: 'delete'
})
