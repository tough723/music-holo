<template>
  <div class="home">
    <!-- Hero：大全息投影器 -->
    <section class="hero glass-panel">
      <div class="hero-visual">
        <HoloProjector
          :cover="playerStore.currentSong?.cover"
          :anonymous-cover="Boolean(playerStore.currentSong?.isCustomSource)"
          :title="playerStore.currentSong?.title || '3D 全息音乐'"
          :singer="playerStore.currentSong?.singerName || 'Music Holo'"
          :playing="playerStore.playing"
          :size="260"
          show-caption
        />
      </div>
      <div class="hero-text">
        <div class="hero-badge">
          <el-icon><Headset /></el-icon> 3D HOLOGRAPHIC MUSIC PLATFORM
        </div>
        <h1 class="hero-title">
          让音乐<br />
          <span class="holo-text">全息投影</span>
        </h1>
        <p class="hero-desc">
          前后端分离的沉浸式音乐平台，旋转的全息碟片、实时同步的歌词、
          多彩的全息主题，把每一首歌都唱成一场视觉盛宴。
        </p>
        <div class="hero-actions">
          <el-button type="primary" size="large" round :disabled="hotSongs.length === 0" @click="playHot">
            <el-icon><VideoPlay /></el-icon> 随便听听
          </el-button>
          <el-button size="large" round @click="$router.push('/songs')">
            <el-icon><Search /></el-icon> 去发现
          </el-button>
        </div>
        <div class="hero-stats">
          <div class="stat-item">
            <div class="stat-num holo-text">{{ hotSongs.length }}</div>
            <div class="stat-label">热门歌曲</div>
          </div>
          <div class="stat-item">
            <div class="stat-num holo-text">{{ singers.length }}</div>
            <div class="stat-label">入驻歌手</div>
          </div>
          <div class="stat-item">
            <div class="stat-num holo-text">{{ playlists.length }}</div>
            <div class="stat-label">精选歌单</div>
          </div>
        </div>
      </div>
    </section>

    <div v-if="loadError" class="home-load-warning glass-panel" role="alert">
      <span>{{ loadError }}</span>
      <el-button text type="primary" :disabled="loading" @click="loadData">
        {{ loading ? '正在重试…' : '重试' }}
      </el-button>
    </div>

    <!-- 延续收听：为已登录用户提供首页一键续播入口 -->
    <section v-if="userStore.isLogin && recentSongs.length" class="section continue-section" aria-label="继续收听">
      <div class="section-head">
        <div>
          <div class="section-title">继续收听</div>
          <div class="section-sub">从最近听过的旋律接着播放</div>
        </div>
        <el-link type="primary" @click="$router.push('/recent')">全部播放历史</el-link>
      </div>
      <div class="continue-list">
        <div
          v-for="song in recentSongs"
          :key="song.id"
          role="button"
          tabindex="0"
          class="continue-card glass-panel"
          :aria-label="`继续播放《${song.title}》`"
          @click="playRecent(song)"
          @keydown.enter.prevent="playRecent(song)"
          @keydown.space.prevent="playRecent(song)"
        >
          <div class="continue-cover">
            <Cover :src="song.cover" :text="song.title" :size="64" />
            <span class="continue-play" aria-hidden="true"><el-icon><VideoPlay /></el-icon></span>
          </div>
          <div class="continue-details">
            <strong>{{ song.title }}</strong>
            <span>{{ song.singerName || '未知歌手' }}</span>
            <small v-if="song.lastPlayedAt">最近听过 · {{ fmtDateTime(song.lastPlayedAt) }}</small>
          </div>
        </div>
      </div>
    </section>

    <!-- 分类快捷入口 -->
    <section v-if="categories.length" class="section">
      <div class="category-chips">
        <div
          v-for="cat in categories"
          :key="cat.id"
          class="category-chip"
          @click="goSongs(cat.id)"
        >
          {{ cat.name }}
        </div>
      </div>
    </section>

    <!-- 热门歌曲 -->
    <section class="section">
      <div class="section-head">
        <div>
          <div class="section-title">热门歌曲</div>
          <div class="section-sub">按播放量排序，点击即可播放</div>
        </div>
        <el-link type="primary" @click="$router.push('/songs')">查看全部</el-link>
      </div>
      <SongList
        :songs="hotSongs"
        :loading="loading"
        :favorite-ids="favoriteIds"
        show-album
        @play="onPlay"
        @toggle-favorite="onToggleFavorite"
        @add-queue="onAddQueue"
      />
    </section>

    <!-- 行为驱动的猜你喜欢 -->
    <section class="section">
      <div class="section-head">
        <div>
          <div class="section-title">猜你喜欢</div>
          <div class="section-sub">
            {{ userStore.isLogin ? '根据你的近期收听与收藏，继续发现相似声音' : '从高热歌曲出发，找到下一首喜欢的歌' }}
          </div>
        </div>
        <div class="discovery-links">
          <el-link type="primary" @click="$router.push('/daily')"><el-icon><Calendar /></el-icon> 每日推荐</el-link>
          <el-link @click="$router.push('/charts')">查看排行榜</el-link>
        </div>
      </div>
      <SongList
        :songs="visibleRecommendations"
        :loading="loading"
        :favorite-ids="favoriteIds"
        show-album
        @play="onRecommendPlay"
        @toggle-favorite="onToggleFavorite"
        @add-queue="onAddQueue"
      />
    </section>

    <!-- 推荐歌单 -->
    <section class="section">
      <div class="section-head">
        <div>
          <div class="section-title">推荐歌单</div>
          <div class="section-sub">为你精心挑选的全息歌单</div>
        </div>
        <el-link type="primary" @click="$router.push('/playlists')">查看全部</el-link>
      </div>
      <div class="playlist-grid">
        <div
          v-for="pl in playlists"
          :key="pl.id"
          class="playlist-card glass-panel"
          @click="$router.push(`/playlists/${pl.id}`)"
        >
          <div class="playlist-cover">
            <Cover :src="pl.cover" :text="pl.name" :size="120" />
            <div class="playlist-mask">
              <el-icon><VideoPlay /></el-icon>
            </div>
            <div class="playlist-count">
              <el-icon><Headset /></el-icon> {{ pl.songCount || 0 }} 首
            </div>
          </div>
          <div class="playlist-name">{{ pl.name }}</div>
          <div class="playlist-desc">{{ pl.description || '暂无描述' }}</div>
        </div>
      </div>
    </section>

    <!-- 入驻歌手 -->
    <section class="section">
      <div class="section-head">
        <div>
          <div class="section-title">入驻歌手</div>
          <div class="section-sub">认识全息舞台上的声音</div>
        </div>
        <el-link type="primary" @click="$router.push('/singers')">查看全部</el-link>
      </div>
      <div class="singer-grid">
        <div
          v-for="singer in singers"
          :key="singer.id"
          class="singer-card glass-panel"
          @click="$router.push(`/singers/${singer.id}`)"
        >
          <div class="singer-avatar">
            <Cover :src="singer.avatar" :text="singer.name" :size="84" />
          </div>
          <div class="singer-name">{{ singer.name }}</div>
          <div class="singer-tags">
            <el-tag size="small" effect="plain">{{ genderText(singer.gender) }}</el-tag>
            <el-tag size="small" effect="plain" type="info">{{ singer.region || '未知地区' }}</el-tag>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import * as songApi from '@/api/song'
import * as singerApi from '@/api/singer'
import * as playlistApi from '@/api/playlist'
import * as categoryApi from '@/api/category'
import * as favoriteApi from '@/api/favorite'
import * as historyApi from '@/api/history'
import * as recommendApi from '@/api/recommend'
import { fmtDateTime } from '@/utils/format'
import { usePlayerStore } from '@/store/player'
import { useUserStore } from '@/store/user'
import { useDislikeStore } from '@/store/dislike'
import SongList from '@/components/SongList.vue'
import HoloProjector from '@/components/HoloProjector.vue'
import Cover from '@/components/Cover.vue'

const router = useRouter()
const playerStore = usePlayerStore()
const userStore = useUserStore()
const dislikeStore = useDislikeStore()

const loading = ref(false)
const loadError = ref('')
const hotSongs = ref([])
const recommendedSongs = ref([])
const visibleRecommendations = computed(() => recommendedSongs.value.filter((song) => !dislikeStore.matches(song)))
const recentSongs = ref([])
const singers = ref([])
const playlists = ref([])
const categories = ref([])
const favoriteIds = ref([])

const genderText = (g) => ({ 0: '保密', 1: '男', 2: '女' })[g] || '保密'

const loadData = async () => {
  loading.value = true
  loadError.value = ''
  const failedSections = []
  try {
    const responses = await Promise.allSettled([
      songApi.page({ pageNum: 1, pageSize: 8 }),
      singerApi.page({ pageNum: 1, pageSize: 6 }),
      playlistApi.page({ pageNum: 1, pageSize: 6 }),
      categoryApi.list(),
      recommendApi.songs(8),
      userStore.isLogin ? historyApi.page({ pageNum: 1, pageSize: 6 }) : Promise.resolve({ records: [] }),
      userStore.isLogin ? favoriteApi.ids() : Promise.resolve([])
    ])
    const valueOrPrevious = (index, section, previousValue) => {
      const response = responses[index]
      if (response.status === 'fulfilled') return response.value
      failedSections.push(section)
      return previousValue
    }

    const songPage = valueOrPrevious(0, '热门歌曲', { records: hotSongs.value })
    const singerPage = valueOrPrevious(1, '歌手', { records: singers.value })
    const playlistPage = valueOrPrevious(2, '推荐歌单', { records: playlists.value })
    const categoryList = valueOrPrevious(3, '分类', categories.value)
    const recommendations = valueOrPrevious(4, '猜你喜欢', recommendedSongs.value)
    const historyPage = valueOrPrevious(5, '最近播放', { records: recentSongs.value })
    const favoriteList = valueOrPrevious(6, '收藏状态', favoriteIds.value)

    hotSongs.value = songPage?.records || []
    recommendedSongs.value = recommendations || []
    recentSongs.value = historyPage?.records || []
    singers.value = singerPage?.records || []
    playlists.value = playlistPage?.records || []
    categories.value = categoryList || []
    favoriteIds.value = favoriteList || []
    loadError.value = failedSections.length
      ? `暂时无法加载：${failedSections.join('、')}。其他已加载内容仍可使用。`
      : ''
  } finally {
    loading.value = false
  }
}

const playHot = () => {
  if (hotSongs.value.length === 0) return
  playerStore.playAll(hotSongs.value, hotSongs.value[0].id)
}

const goSongs = (categoryId) => {
  router.push({ path: '/songs', query: { categoryId } })
}

const onPlay = (song, index) => {
  playerStore.playAll(hotSongs.value, song.id ?? hotSongs.value[index]?.id)
}

const onRecommendPlay = (song, index) => {
  playerStore.playAll(visibleRecommendations.value, song.id ?? visibleRecommendations.value[index]?.id)
}

const playRecent = (song) => {
  playerStore.playAll(recentSongs.value, song.id)
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

onMounted(loadData)
</script>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.home-load-warning {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid rgba(245, 181, 90, 0.28);
  border-radius: 12px;
  color: var(--text-sub);
  font-size: 13px;
}
.continue-list {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 3px 2px 12px;
  scrollbar-width: thin;
}
.continue-card {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 260px;
  min-width: 0;
  padding: 10px;
  border: 1px solid rgba(180, 207, 255, 0.13);
  border-radius: 14px;
  color: var(--text-main);
  text-align: left;
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}
.continue-card:hover,
.continue-card:focus-visible {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--holo-primary) 55%, transparent);
  box-shadow: 0 8px 22px var(--holo-glow);
  outline: none;
}
.continue-cover {
  position: relative;
  flex: 0 0 64px;
  width: 64px;
  height: 64px;
  overflow: hidden;
  border-radius: 10px;
}
.continue-play {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  background: rgba(5, 8, 22, 0.5);
  opacity: 0;
  transition: opacity 0.18s ease;
}
.continue-card:hover .continue-play,
.continue-card:focus-visible .continue-play {
  opacity: 1;
}
.continue-details {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 4px;
}
.continue-details strong,
.continue-details > span,
.continue-details small {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.continue-details strong {
  font-size: 13px;
}
.continue-details > span,
.continue-details small {
  color: var(--text-sub);
  font-size: 11px;
}

/* Hero */
.hero {
  display: flex;
  align-items: center;
  gap: 30px;
  padding: 36px 44px;
  overflow: hidden;
  position: relative;
}
.hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(600px 300px at 20% 0%, var(--holo-glow), transparent 65%);
  pointer-events: none;
}
.hero-visual {
  flex-shrink: 0;
}
.hero-text {
  position: relative;
  z-index: 1;
}
.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  letter-spacing: 2px;
  color: var(--holo-primary);
  border: 1px solid color-mix(in srgb, var(--holo-primary) 45%, transparent);
  border-radius: 999px;
  padding: 5px 14px;
}
.hero-title {
  font-size: 46px;
  line-height: 1.25;
  margin: 16px 0 12px;
  font-weight: 700;
}
.hero-desc {
  color: var(--text-sub);
  font-size: 14px;
  line-height: 1.9;
  max-width: 520px;
}
.hero-actions {
  display: flex;
  gap: 14px;
  margin-top: 22px;
}
.hero-stats {
  display: flex;
  gap: 40px;
  margin-top: 28px;
}
.stat-num {
  font-size: 24px;
  font-weight: 700;
}
.stat-label {
  font-size: 12px;
  color: var(--text-sub);
  margin-top: 2px;
}

/* 分类 chips */
.category-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.category-chip {
  padding: 8px 20px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.category-chip:hover {
  color: var(--holo-primary);
  border-color: var(--holo-primary);
  box-shadow: 0 0 14px var(--holo-glow);
  transform: translateY(-2px);
}

/* 通用区块 */
.section {
  padding: 4px 2px;
}
.section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 16px;
}
.discovery-links {
  display: flex;
  align-items: center;
  gap: 16px;
}
.section-title {
  font-size: 20px;
  font-weight: 600;
}
.section-sub {
  font-size: 12px;
  color: var(--text-sub);
  margin-top: 4px;
}

/* 歌单卡片 */
.playlist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}
.playlist-card {
  padding: 14px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}
.playlist-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px var(--holo-glow);
}
.playlist-cover {
  position: relative;
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
}
.playlist-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 34px;
  color: #fff;
  background: rgba(5, 8, 22, 0.45);
  opacity: 0;
  transition: opacity 0.2s;
}
.playlist-card:hover .playlist-mask {
  opacity: 1;
}
.playlist-count {
  position: absolute;
  right: 8px;
  bottom: 8px;
  font-size: 11px;
  color: #fff;
  background: rgba(5, 8, 22, 0.6);
  border-radius: 999px;
  padding: 2px 8px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.playlist-name {
  margin-top: 10px;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.playlist-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-sub);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 歌手卡片 */
.singer-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 16px;
}
.singer-card {
  padding: 22px 14px 16px;
  text-align: center;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}
.singer-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px var(--holo-glow);
}
.singer-avatar {
  width: 84px;
  height: 84px;
  margin: 0 auto;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid color-mix(in srgb, var(--holo-primary) 50%, transparent);
  box-shadow: 0 0 20px var(--holo-glow);
}
.singer-name {
  margin-top: 12px;
  font-size: 15px;
  font-weight: 600;
}
.singer-tags {
  margin-top: 8px;
  display: flex;
  justify-content: center;
  gap: 6px;
}

@media (max-width: 900px) {
  .hero {
    flex-direction: column;
    text-align: center;
    padding: 28px 20px;
  }
  .hero-desc {
    margin: 0 auto;
  }
  .hero-actions,
  .hero-stats {
    justify-content: center;
  }
  .hero-title {
    font-size: 34px;
  }
  .discovery-links {
    gap: 10px;
  }
}
</style>
