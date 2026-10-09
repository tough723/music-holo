import { defineStore } from 'pinia'
import * as dislikeApi from '@/api/dislike'
import { isSkippedByDislike, sameId } from '@/utils/dislikeSkip'

function songView(song) {
  return {
    id: song.id,
    title: song.title || '未命名歌曲',
    singerId: song.singerId ?? null,
    singerName: song.singerName || '',
    cover: song.cover || ''
  }
}

function singerView(singer) {
  return {
    id: singer.id,
    name: singer.name || '未命名歌手',
    avatar: singer.avatar || '',
    region: singer.region || ''
  }
}

/** 账号级不喜欢规则。只存在内存中，退出登录即清空，避免串到下一个账号。 */
export const useDislikeStore = defineStore('dislike', {
  state: () => ({
    songIds: [],
    singerIds: [],
    songs: [],
    singers: [],
    songLimit: 500,
    singerLimit: 200,
    loaded: false,
    loadSeq: 0
  }),
  getters: {
    hasSong: (state) => (songId) => state.songIds.some((id) => sameId(id, songId)),
    hasSinger: (state) => (singerId) => state.singerIds.some((id) => sameId(id, singerId))
  },
  actions: {
    apply(data) {
      this.songIds = Array.isArray(data?.songIds) ? data.songIds : []
      this.singerIds = Array.isArray(data?.singerIds) ? data.singerIds : []
      this.songs = Array.isArray(data?.songs) ? data.songs : []
      this.singers = Array.isArray(data?.singers) ? data.singers : []
      this.songLimit = Number(data?.songLimit) > 0 ? Number(data.songLimit) : 500
      this.singerLimit = Number(data?.singerLimit) > 0 ? Number(data.singerLimit) : 200
      this.loaded = true
    },
    matches(song) {
      return isSkippedByDislike(song, this)
    },
    clear() {
      this.loadSeq += 1
      this.songIds = []
      this.singerIds = []
      this.songs = []
      this.singers = []
      this.loaded = false
    },
    async load() {
      const seq = ++this.loadSeq
      const data = await dislikeApi.summary()
      if (seq !== this.loadSeq) return data
      this.apply(data)
      return data
    },
    async addSong(song) {
      if (!song?.id || song.isLocal) return false
      await dislikeApi.addSong(song.id)
      this.loadSeq += 1
      if (!this.hasSong(song.id)) {
        this.songIds = [...this.songIds, song.id]
        this.songs = [songView(song), ...this.songs.filter((item) => !sameId(item.id, song.id))]
      }
      this.loaded = true
      return true
    },
    async removeSong(songId) {
      await dislikeApi.removeSong(songId)
      this.loadSeq += 1
      this.songIds = this.songIds.filter((id) => !sameId(id, songId))
      this.songs = this.songs.filter((item) => !sameId(item.id, songId))
      this.loaded = true
    },
    async addSinger(singer) {
      if (!singer?.id) return false
      await dislikeApi.addSinger(singer.id)
      this.loadSeq += 1
      if (!this.hasSinger(singer.id)) {
        this.singerIds = [...this.singerIds, singer.id]
        this.singers = [singerView(singer), ...this.singers.filter((item) => !sameId(item.id, singer.id))]
      }
      this.loaded = true
      return true
    },
    async removeSinger(singerId) {
      await dislikeApi.removeSinger(singerId)
      this.loadSeq += 1
      this.singerIds = this.singerIds.filter((id) => !sameId(id, singerId))
      this.singers = this.singers.filter((item) => !sameId(item.id, singerId))
      this.loaded = true
    }
  }
})
