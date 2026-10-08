<template>
  <div class="daily-page">
    <section class="daily-hero glass-panel" v-loading="loading">
      <div class="daily-copy">
        <div class="daily-eyebrow"><el-icon><Calendar /></el-icon> DAILY SOUND · 每日灵感</div>
        <div class="daily-date-line">
          <strong>{{ dayNumber }}</strong>
          <span><b>{{ monthYear }}</b><small>{{ weekday }}</small></span>
        </div>
        <h1>每日推荐<span class="holo-text">，遇见新声音</span></h1>
        <p>{{ intro }}</p>
        <div class="daily-actions">
          <el-button type="primary" round size="large" :disabled="songs.length === 0" @click="playAll">
            <el-icon><VideoPlay /></el-icon> 播放今日推荐
          </el-button>
          <el-button round size="large" :disabled="songs.length === 0" @click="addAllToQueue">
            <el-icon><Plus /></el-icon> 加入播放队列
          </el-button>
        </div>
        <div class="daily-stats">
          <span><b>{{ songs.length }}</b> 首今日精选</span>
          <i></i>
          <span><b>{{ matchedCategoryCount }}</b> 种声音</span>
          <i></i>
          <span>{{ userStore.isLogin ? '按你的音乐偏好整理' : '热门歌曲精选' }}</span>
        </div>
      </div>
      <div class="daily-stage" aria-label="今日推荐歌曲全息投影">
        <div class="stage-orbit stage-orbit-one"></div>
        <div class="stage-orbit stage-orbit-two"></div>
        <HoloProjector
          :cover="featuredSong?.cover"
          :title="featuredSong?.title || '今日灵感'"
          :singer="featuredSong?.singerName || 'Music Holo'"
          :playing="playerStore.playing && playerStore.currentSong?.id === featuredSong?.id"
          :size="220"
          show-caption
        />
        <div class="stage-tag"><el-icon><Headset /></el-icon> TODAY'S ROTATION</div>
      </div>
    </section>

    <section class="daily-list glass-panel">
      <div class="list-heading">
        <div>
          <div class="list-title">为你挑选的声音</div>
          <div class="list-subtitle">从熟悉的节拍出发，慢慢发现新的喜欢</div>
        </div>
        <el-tag effect="plain" round>{{ filteredSongs.length }} 首</el-tag>
      </div>

      <div class="category-filter" role="group" aria-label="按音乐分类筛选每日推荐">
        <el-button round :type="selectedCategory === null ? 'primary' : 'default'" @click="selectedCategory = null">全部</el-button>
        <el-button
          v-for="category in availableCategories"
          :key="category.id"
          round
          :type="selectedCategory === category.id ? 'primary' : 'default'"
          @click="selectedCategory = category.id"
        >
          {{ category.name }}
        </el-button>
      </div>

      <SongList
        v-if="filteredSongs.length || loading"
        :songs="filteredSongs"
        :loading="loading"
        :favorite-ids="favoriteIds"
        show-album
        @play="onPlay"
        @toggle-favorite="onToggleFavorite"
        @add-queue="onAddQueue"
      />
      <el-empty v-else description="暂时没有推荐歌曲，去曲库发现更多声音吧。" :image-size="112">
        <el-button type="primary" @click="router.push('/songs')">探索曲库</el-button>
      </el-empty>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import * as recommendApi from '@/api/recommend'
import * as categoryApi from '@/api/category'
import * as favoriteApi from '@/api/favorite'
import { usePlayerStore } from '@/store/player'
import { useUserStore } from '@/store/user'
import SongList from '@/components/SongList.vue'
import HoloProjector from '@/components/HoloProjector.vue'

const router = useRouter()
const playerStore = usePlayerStore()
const userStore = useUserStore()
const loading = ref(false)
const songs = ref([])
const categories = ref([])
const favoriteIds = ref([])
const selectedCategory = ref(null)

const now = new Date()
const dayNumber = computed(() => String(now.getDate()).padStart(2, '0'))
const monthYear = computed(() => new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(now))
const weekday = computed(() => new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(now))
const featuredSong = computed(() => songs.value[0] || null)
const availableCategories = computed(() => categories.value.filter((category) =>
  songs.value.some((song) => song.categoryId === category.id)
))
const matchedCategoryCount = computed(() => availableCategories.value.length)
const filteredSongs = computed(() => selectedCategory.value === null
  ? songs.value
  : songs.value.filter((song) => song.categoryId === selectedCategory.value))
const intro = computed(() => userStore.isLogin
  ? '结合近期收听与收藏，为你整理一份轻松开听的专属歌单。'
  : '先从平台热歌开始，登录后还能根据你的收听与收藏发现更多同频声音。')

const loadData = async () => {
  loading.value = true
  try {
    const [recommendations, categoryList, favorites] = await Promise.all([
      recommendApi.songs(24),
      categoryApi.list().catch(() => []),
      userStore.isLogin ? favoriteApi.ids().catch(() => []) : Promise.resolve([])
    ])
    songs.value = recommendations || []
    categories.value = categoryList || []
    favoriteIds.value = favorites || []
  } catch (error) {
    songs.value = []
  } finally {
    loading.value = false
  }
}

const playAll = () => {
  if (filteredSongs.value.length) playerStore.playAll(filteredSongs.value, filteredSongs.value[0].id)
}

const addAllToQueue = () => {
  const before = playerStore.queue.length
  filteredSongs.value.forEach((song) => playerStore.addToQueue(song))
  const added = playerStore.queue.length - before
  ElMessage.success(added ? `已加入 ${added} 首，重复歌曲已自动跳过` : '这些歌曲已在播放队列中')
}

const onPlay = (song) => playerStore.playAll(filteredSongs.value, song.id)

const onAddQueue = (song) => {
  const existing = playerStore.queue.some((item) => item.id === song.id)
  playerStore.addToQueue(song)
  ElMessage.success(existing ? '这首歌已在播放队列中' : `已加入播放队列：《${song.title}》`)
}

const onToggleFavorite = async (song) => {
  if (!userStore.isLogin) {
    ElMessage.warning('请先登录后再收藏')
    router.push({ path: '/login', query: { redirect: '/daily' } })
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
  } catch (error) {
    // 错误提示已由 API 层处理
  }
}

onMounted(loadData)
</script>

<style scoped>
.daily-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.daily-hero {
  position: relative;
  min-height: 330px;
  padding: 28px 42px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(250px, 340px);
  align-items: center;
  gap: 22px;
  overflow: hidden;
  isolation: isolate;
  background:
    radial-gradient(ellipse at 12% 2%, color-mix(in srgb, var(--holo-primary) 18%, transparent), transparent 42%),
    radial-gradient(ellipse at 86% 80%, color-mix(in srgb, var(--holo-secondary) 16%, transparent), transparent 45%);
}
.daily-hero::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  opacity: 0.35;
  background-image: linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
  background-size: 42px 42px;
  mask-image: linear-gradient(135deg, #000, transparent 75%);
}
.daily-copy {
  position: relative;
  z-index: 2;
  min-width: 0;
}
.daily-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--holo-primary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
}
.daily-date-line {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
}
.daily-date-line > strong {
  color: var(--text-main);
  font-size: 46px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.daily-date-line > span {
  display: flex;
  flex-direction: column;
  gap: 3px;
  color: var(--text-sub);
  font-size: 11px;
}
.daily-date-line b {
  color: var(--text-main);
  font-size: 13px;
}
.daily-date-line small {
  font-size: 10px;
}
h1 {
  margin: 12px 0 8px;
  font-size: clamp(28px, 4vw, 44px);
  line-height: 1.2;
  letter-spacing: -0.8px;
}
h1 .holo-text {
  background-image: linear-gradient(95deg, var(--holo-primary), var(--holo-secondary));
}
.daily-copy p {
  max-width: 520px;
  color: var(--text-sub);
  font-size: 13px;
  line-height: 1.8;
}
.daily-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}
.daily-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
  color: var(--text-sub);
  font-size: 11px;
}
.daily-stats b {
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
}
.daily-stats i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--holo-primary);
  box-shadow: 0 0 8px var(--holo-glow);
}
.daily-stage {
  position: relative;
  min-height: 270px;
  display: flex;
  align-items: center;
  justify-content: center;
  transform-style: preserve-3d;
}
.stage-orbit {
  position: absolute;
  width: 270px;
  height: 96px;
  border: 1px solid color-mix(in srgb, var(--holo-primary) 34%, transparent);
  border-radius: 50%;
  transform: rotateX(68deg) rotateZ(-18deg) translateZ(6px);
  box-shadow: 0 0 26px -12px var(--holo-glow), inset 0 0 24px -12px var(--holo-glow);
}
.stage-orbit-one::before,
.stage-orbit-two::before {
  content: '';
  position: absolute;
  inset: 14px 28px;
  border: 1px dashed color-mix(in srgb, var(--holo-secondary) 28%, transparent);
  border-radius: 50%;
}
.stage-orbit-two {
  width: 230px;
  height: 125px;
  border-color: color-mix(in srgb, var(--holo-secondary) 35%, transparent);
  transform: rotateX(64deg) rotateZ(35deg) translateZ(-8px);
}
.daily-stage :deep(.holo) {
  z-index: 2;
  filter: drop-shadow(0 18px 34px rgba(0, 0, 0, 0.48));
  transform: translateZ(24px) rotateY(-7deg);
}
.stage-tag {
  position: absolute;
  right: -4px;
  bottom: 18px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border: 1px solid color-mix(in srgb, var(--holo-primary) 24%, var(--border-color));
  border-radius: 999px;
  color: var(--holo-primary);
  background: var(--bg-panel);
  backdrop-filter: blur(12px);
  font-size: 8px;
  letter-spacing: 1.2px;
}
.daily-list {
  padding: 24px 28px;
  border-radius: 18px;
}
.list-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.list-title {
  font-size: 19px;
  font-weight: 700;
}
.list-subtitle {
  margin-top: 5px;
  color: var(--text-sub);
  font-size: 12px;
}
.category-filter {
  display: flex;
  gap: 8px;
  margin: 18px 0 14px;
  padding-bottom: 4px;
  overflow-x: auto;
  scrollbar-width: thin;
}
.category-filter :deep(.el-button) {
  flex: 0 0 auto;
  margin-left: 0;
}
@media (max-width: 900px) {
  .daily-hero {
    grid-template-columns: minmax(0, 1fr) 260px;
    padding: 26px 28px;
  }
  .daily-stage {
    min-height: 240px;
    transform: scale(0.88);
  }
  .stage-tag {
    right: -14px;
  }
}
@media (max-width: 680px) {
  .daily-hero {
    grid-template-columns: 1fr;
    gap: 0;
    padding: 22px 20px 12px;
  }
  .daily-date-line {
    margin-top: 15px;
  }
  .daily-date-line > strong {
    font-size: 38px;
  }
  h1 {
    font-size: clamp(26px, 7vw, 34px);
  }
  .daily-stage {
    min-height: 220px;
    margin-top: -4px;
    transform: scale(0.84);
  }
  .stage-tag {
    right: 0;
    bottom: 3px;
  }
  .daily-list {
    padding: 18px 14px;
  }
  .list-title {
    font-size: 17px;
  }
  .list-subtitle {
    font-size: 11px;
  }
  .daily-actions :deep(.el-button) {
    padding-right: 14px;
    padding-left: 14px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .daily-stage :deep(.holo) {
    transform: none;
  }
}
</style>
