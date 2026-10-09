<template>
  <div class="page" v-loading="loading">
    <!-- 歌手信息头 -->
    <div class="singer-header glass-panel" v-if="singer">
      <div class="singer-avatar">
        <Cover :src="singer.avatar" :text="singer.name" :size="110" />
      </div>
      <div class="singer-info">
        <div class="singer-name">
          {{ singer.name }}
          <el-tag size="small" effect="plain">{{ genderText(singer.gender) }}</el-tag>
          <el-tag size="small" effect="plain" type="info">{{ singer.region || '未知地区' }}</el-tag>
        </div>
        <div class="singer-intro">{{ singer.intro || '这位歌手很神秘，什么都没有留下～' }}</div>
        <div class="singer-stats">
          <div class="stat"><span class="num holo-text">{{ singer.songCount || 0 }}</span><span class="label">歌曲</span></div>
        </div>
        <div class="singer-actions">
          <el-button type="primary" round :disabled="songs.length === 0" @click="playAll">
            <el-icon><VideoPlay /></el-icon> 播放全部
          </el-button>
          <el-button round :disabled="songs.length === 0" @click="addAllToQueue">
            <el-icon><Plus /></el-icon> 加入队列
          </el-button>
          <el-button
            round
            :type="singerDisliked ? 'danger' : 'default'"
            :aria-label="singerDisliked ? `取消不喜欢歌手${singer.name}` : `不喜欢歌手${singer.name}`"
            data-testid="dislike-singer"
            :data-disliked="singerDisliked ? 'true' : 'false'"
            @click="toggleSingerDislike"
          >
            {{ singerDisliked ? '已不喜欢这位歌手' : '不喜欢这位歌手' }}
          </el-button>
          <p class="dislike-status" role="status" data-testid="singer-dislike-status">{{ singerDislikeStatus }}</p>
        </div>
      </div>
      <div class="singer-holo">
        <HoloProjector
          :cover="playerStore.currentSong?.singerId === singer.id ? playerStore.currentSong?.cover : ''"
          :anonymous-cover="Boolean(playerStore.currentSong?.singerId === singer.id && playerStore.currentSong?.isCustomSource)"
          :title="playerStore.currentSong?.singerId === singer.id ? playerStore.currentSong?.title : singer.name"
          :playing="playerStore.playing && playerStore.currentSong?.singerId === singer.id"
          :size="150"
        />
      </div>
    </div>

    <!-- 歌曲列表 -->
    <div class="section-head">
      <div>
        <div class="section-title">歌曲</div>
        <div class="section-subtitle">这位歌手的全部作品</div>
      </div>
    </div>
    <SongList
      :songs="songs"
      :favorite-ids="favoriteIds"
      :show-category="false"
      show-album
      @play="onPlay"
      @toggle-favorite="onToggleFavorite"
      @add-queue="onAddQueue"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as singerApi from '@/api/singer'
import * as favoriteApi from '@/api/favorite'
import { usePlayerStore } from '@/store/player'
import { useUserStore } from '@/store/user'
import { useDislikeStore } from '@/store/dislike'
import SongList from '@/components/SongList.vue'
import HoloProjector from '@/components/HoloProjector.vue'
import Cover from '@/components/Cover.vue'

const route = useRoute()
const router = useRouter()
const playerStore = usePlayerStore()
const userStore = useUserStore()
const dislikeStore = useDislikeStore()

const loading = ref(false)
const singer = ref(null)
const singerDisliked = computed(() => singer.value ? dislikeStore.hasSinger(singer.value.id) : false)
const songs = ref([])
const favoriteIds = ref([])

const genderText = (g) => ({ 0: '保密', 1: '男', 2: '女' })[g] || '保密'

const loadData = async () => {
  loading.value = true
  try {
    const id = route.params.id
    const [detail, songList] = await Promise.all([
      singerApi.detail(id),
      singerApi.songsOfSinger(id)
    ])
    singer.value = detail
    songs.value = songList || []
  } finally {
    loading.value = false
  }
  if (userStore.isLogin) {
    try {
      favoriteIds.value = await favoriteApi.ids()
    } catch (e) { /* ignore */ }
  }
}

const playAll = () => {
  if (songs.value.length === 0) return
  playerStore.playAll(songs.value, songs.value[0].id)
}

const addAllToQueue = () => {
  songs.value.forEach((s) => playerStore.addToQueue(s))
  ElMessage.success(`已将 ${songs.value.length} 首歌曲加入播放队列`)
}

const onPlay = (song) => {
  playerStore.playAll(songs.value, song.id)
}

const onToggleFavorite = async (song) => {
  if (!userStore.isLogin) {
    ElMessage.warning('请先登录后再收藏')
    router.push('/login')
    return
  }
  try {
    if (favoriteIds.value.includes(song.id)) {
      await favoriteApi.cancel(song.id)
      favoriteIds.value = favoriteIds.value.filter((id) => id !== song.id)
      ElMessage.success('已取消收藏')
    } else {
      await favoriteApi.add(song.id)
      favoriteIds.value.push(song.id)
      ElMessage.success('收藏成功')
    }
  } catch (e) { /* 拦截器已提示 */ }
}

const onAddQueue = (song) => {
  playerStore.addToQueue(song)
  ElMessage.success(`已加入播放队列：《${song.title}》`)
}

const singerDislikeStatus = ref('')

const toggleSingerDislike = async () => {
  if (!singer.value) return
  if (!userStore.isLogin) {
    singerDislikeStatus.value = '请先登录后再设置不喜欢'
    ElMessage.warning(singerDislikeStatus.value)
    router.push('/login')
    return
  }
  if (dislikeStore.hasSinger(singer.value.id)) {
    try {
      await dislikeStore.removeSinger(singer.value.id)
      singerDislikeStatus.value = `已取消不喜欢歌手${singer.value.name}`
      ElMessage.success(singerDislikeStatus.value)
    } catch (err) {
      singerDislikeStatus.value = err?.msg || err?.message || '不喜欢设置失败'
    }
    return
  }
  try {
    await ElMessageBox.confirm(
      `自动下一首、每日推荐和相似电台将跳过「${singer.value.name}」的歌曲。搜索、排行榜和手动点播仍可播放，也不会删除曲库。`,
      '不喜欢这位歌手？',
      { confirmButtonText: '确认屏蔽', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }
  try {
    await dislikeStore.addSinger(singer.value)
    singerDislikeStatus.value = `已不喜欢歌手${singer.value.name}，自动切歌和推荐会跳过`
    ElMessage.success(singerDislikeStatus.value)
  } catch (err) {
    singerDislikeStatus.value = err?.msg || err?.message || '不喜欢设置失败'
  }
}

watch(() => route.params.id, () => {
  if (route.params.id) loadData()
})

onMounted(loadData)
</script>

<style scoped>
.dislike-status {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.singer-header {
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 28px 32px;
  position: relative;
  overflow: hidden;
}
.singer-header::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(500px 260px at 85% 20%, var(--holo-glow), transparent 65%);
  pointer-events: none;
}
.singer-avatar {
  width: 110px;
  height: 110px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  border: 2px solid color-mix(in srgb, var(--holo-primary) 50%, transparent);
  box-shadow: 0 0 26px var(--holo-glow);
}
.singer-info {
  flex: 1;
  min-width: 0;
  position: relative;
  z-index: 1;
}
.singer-name {
  font-size: 26px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 10px;
}
.singer-intro {
  margin-top: 10px;
  color: var(--text-sub);
  font-size: 13px;
  line-height: 1.8;
  max-width: 560px;
}
.singer-stats {
  display: flex;
  gap: 28px;
  margin-top: 12px;
}
.stat {
  display: flex;
  flex-direction: column;
}
.stat .num {
  font-size: 20px;
  font-weight: 700;
}
.stat .label {
  font-size: 12px;
  color: var(--text-sub);
}
.singer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 16px;
}
.singer-holo {
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}
.section-head {
  margin-top: 8px;
}
.section-title {
  font-size: 20px;
  font-weight: 600;
}
.section-subtitle {
  font-size: 12px;
  color: var(--text-sub);
  margin-top: 4px;
}
@media (max-width: 900px) {
  .singer-header {
    flex-wrap: wrap;
  }
  .singer-holo {
    display: none;
  }
}
</style>
