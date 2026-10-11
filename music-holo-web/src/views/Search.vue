<template>
  <div class="search-page">
    <section class="search-hero glass-panel">
      <div class="eyebrow"><el-icon><Search /></el-icon> MUSIC DISCOVERY</div>
      <h1>把记忆里的旋律，搜出来。</h1>
      <p>支持歌曲、歌手、专辑、歌词片段与公开歌单，一次找到相关内容。</p>
      <el-input
        v-model="keyword"
        size="large"
        clearable
        class="search-input"
        placeholder="试试歌名、歌手名，或记得的一句歌词…"
        aria-label="搜索音乐内容"
        @keyup.enter="submitSearch"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
        <template #append><el-button type="primary" @click="submitSearch">搜索</el-button></template>
      </el-input>
      <div class="search-tip">快捷键：Ctrl / ⌘ + K</div>
    </section>

    <section
      v-if="!route.query.q && (preferences.showSearchSuggestions || (preferences.rememberSearchHistory && recentTerms.length))"
      class="discovery glass-panel"
    >
      <template v-if="preferences.showSearchSuggestions">
        <div class="section-title">从一段灵感开始</div>
        <p>搜歌词、想起的歌名，或从这些关键词探索音乐。</p>
        <div class="chip-list">
          <el-tag v-for="term in suggestionTerms" :key="term" effect="plain" round @click="searchFor(term)">
            {{ term }}
          </el-tag>
        </div>
      </template>
      <div v-if="preferences.rememberSearchHistory && recentTerms.length" class="recent-searches">
        <div class="minor-title">最近搜索 · 仅此设备</div>
        <div class="chip-list">
          <el-tag v-for="term in recentTerms" :key="term" type="info" effect="plain" round @click="searchFor(term)">
            {{ term }}
          </el-tag>
          <el-button text size="small" @click="clearRecent">清空</el-button>
        </div>
      </div>
    </section>

    <section v-else class="results-panel glass-panel">
      <div class="results-heading">
        <div>
          <div class="section-title">“{{ results.keyword || route.query.q }}” 的搜索结果</div>
          <div class="minor-title">本站歌曲 {{ results.songs.length }} · 歌手 {{ results.singers.length }} · 歌单 {{ results.playlists.length }} · 在线平台 {{ onlineResults.length }}</div>
        </div>
        <el-button text type="primary" @click="router.push('/charts')">
          <el-icon><TrendCharts /></el-icon> 去排行榜发现
        </el-button>
      </div>

      <el-tabs v-model="activeTab" v-loading="loading" class="result-tabs">
        <el-tab-pane :label="`歌曲 ${results.songs.length}`" name="songs">
          <SongList
            v-if="results.songs.length"
            :songs="results.songs"
            :favorite-ids="favoriteIds"
            show-album
            @play="onPlay"
            @toggle-favorite="onToggleFavorite"
            @add-queue="onAddQueue"
          />
          <el-empty v-else description="本站曲库未找到相关歌曲；可以切换到“在线平台”搜索实时平台曲目。" :image-size="90" />
        </el-tab-pane>
        <el-tab-pane :label="`歌手 ${results.singers.length}`" name="singers">
          <div v-if="results.singers.length" class="entity-grid">
            <button v-for="singer in results.singers" :key="singer.id" class="entity-card" @click="router.push(`/singers/${singer.id}`)">
              <Cover :src="singer.avatar" :text="singer.name" :size="72" />
              <span class="entity-name">{{ singer.name }}</span>
              <span class="entity-meta">{{ singer.region || '音乐人' }} · {{ singer.songCount || 0 }} 首作品</span>
            </button>
          </div>
          <el-empty v-else description="没有找到相关歌手。" :image-size="90" />
        </el-tab-pane>
        <el-tab-pane :label="`歌单 ${results.playlists.length}`" name="playlists">
          <div v-if="results.playlists.length" class="entity-grid playlist-grid">
            <button v-for="playlist in results.playlists" :key="playlist.id" class="entity-card" @click="router.push(`/playlists/${playlist.id}`)">
              <Cover :src="playlist.cover" :text="playlist.name" :size="88" />
              <span class="entity-name">{{ playlist.name }}</span>
              <span class="entity-meta">{{ playlist.songCount || 0 }} 首 · {{ fmtCount(playlist.playCount) }} 次播放</span>
            </button>
          </div>
          <el-empty v-else description="没有找到公开歌单。" :image-size="90" />
        </el-tab-pane>
        <el-tab-pane :label="`在线平台 ${onlineTotalCount}`" name="online">
          <el-tabs v-model="activeOnlinePlatform" class="online-platform-tabs" @tab-change="onOnlinePlatformChange">
            <el-tab-pane v-for="platform in ONLINE_PLATFORMS" :key="platform.key" :name="platform.key" :label="`${platform.name} ${onlineResultsByPlatform[platform.key].length}`">
              <div class="online-tab-toolbar">
                <span class="minor-title">{{ platform.name }} · {{ currentOnlineState.loaded ? '已加载' : '等待搜索' }}</span>
                <el-button size="small" type="primary" :loading="currentOnlineState.loading" @click="loadOnlineResults(platform.key, true)">搜索当前平台</el-button>
              </div>
              <div v-if="currentOnlineState.error" class="online-error" role="alert">{{ currentOnlineState.error }}</div>
              <div v-else-if="currentOnlineResults.length" class="online-results" aria-label="在线平台结果">
                <div v-for="track in currentOnlineResults" :key="`${track.platform}-${track.musicInfo?.id || track.musicInfo?.songmid || track.name}`" class="online-track">
                  <div class="online-track-copy">
                    <strong>{{ track.name }}</strong>
                    <span>{{ track.singer || '未知歌手' }}<template v-if="track.album"> · {{ track.album }}</template></span>
                  </div>
                  <el-button size="small" type="primary" :loading="onlinePlaying === track" @click="playOnline(track)">播放</el-button>
                </div>
              </div>
              <el-empty v-else-if="currentOnlineState.loaded && !currentOnlineState.loading" description="在线平台未找到曲目" :image-size="70" />
              <div v-else class="online-hint">切换或点击“搜索当前平台”加载实时平台结果。</div>
            </el-tab-pane>
          </el-tabs>
        </el-tab-pane>
      </el-tabs>
    </section>


  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import * as searchApi from '@/api/search'
import * as favoriteApi from '@/api/favorite'
import { usePlayerStore } from '@/store/player'
import { usePreferencesStore, RECENT_SEARCH_STORAGE_KEY } from '@/store/preferences'
import { useUserStore } from '@/store/user'
import { fmtCount } from '@/utils/format'
import { bootstrapOnlineSources, searchOnlineTracks, resolveOnlineTrack } from '@/utils/onlineTrackService'
import { ONLINE_PLATFORMS, createOnlinePlatformResults, createOnlinePlatformStates } from '@/utils/onlinePlatformState'
import SongList from '@/components/SongList.vue'
import Cover from '@/components/Cover.vue'

const route = useRoute()
const router = useRouter()
const playerStore = usePlayerStore()
const preferences = usePreferencesStore()
const userStore = useUserStore()
const keyword = ref('')
const loading = ref(false)
const activeTab = ref('songs')
const favoriteIds = ref([])
const recentTerms = ref([])
const results = ref({ keyword: '', songs: [], singers: [], playlists: [] })
const suggestionTerms = ['霓虹', '月光', '夏夜', '回声', '远方']
const activeOnlinePlatform = ref('wy')
const onlineResultsByPlatform = reactive(createOnlinePlatformResults())
const onlineStateByPlatform = reactive(createOnlinePlatformStates())
const onlinePlaying = ref(null)
const onlineTotalCount = computed(() => Object.values(onlineResultsByPlatform).reduce((total, items) => total + items.length, 0))
const currentOnlineResults = computed(() => onlineResultsByPlatform[activeOnlinePlatform.value] || [])
const currentOnlineState = computed(() => onlineStateByPlatform[activeOnlinePlatform.value] || { loading: false, loaded: false, error: '' })
let onlineSearchGeneration = 0

const readRecent = () => {
  if (!preferences.rememberSearchHistory) {
    recentTerms.value = []
    return
  }
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_SEARCH_STORAGE_KEY) || '[]')
    recentTerms.value = Array.isArray(stored)
      ? [...new Set(stored.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
        .slice(0, preferences.searchHistoryLimit)
      : []
  } catch {
    recentTerms.value = []
  }
}

const rememberSearch = (term) => {
  if (!preferences.rememberSearchHistory) return
  const cleaned = term.trim()
  if (!cleaned) return
  recentTerms.value = [cleaned, ...recentTerms.value.filter((item) => item !== cleaned)]
    .slice(0, preferences.searchHistoryLimit)
  try {
    localStorage.setItem(RECENT_SEARCH_STORAGE_KEY, JSON.stringify(recentTerms.value))
  } catch {
    // Searching should still work if browser storage is unavailable or full.
  }
}

const clearRecent = () => {
  recentTerms.value = []
  preferences.clearSearchHistory()
}

const loadResults = async (value) => {
  const q = String(value || '').trim()
  keyword.value = q
  if (!q) {
    results.value = { keyword: '', songs: [], singers: [], playlists: [] }
    return
  }
  rememberSearch(q)
  loading.value = true
  try {
    const data = await searchApi.search(q, 12)
    results.value = {
      keyword: data?.keyword || q,
      songs: data?.songs || [],
      singers: data?.singers || [],
      playlists: data?.playlists || []
    }
  } catch {
    results.value = { keyword: q, songs: [], singers: [], playlists: [] }
  } finally {
    loading.value = false
  }
}

readRecent()
watch(
  () => [preferences.rememberSearchHistory, preferences.searchHistoryLimit],
  readRecent
)
watch(() => route.query.q, (value) => {
  onlineSearchGeneration += 1
  activeOnlinePlatform.value = 'wy'
  Object.assign(onlineResultsByPlatform, createOnlinePlatformResults())
  Object.assign(onlineStateByPlatform, createOnlinePlatformStates())
  activeTab.value = 'songs'
  loadResults(value)
  if (String(value || '').trim()) loadOnlineResults('wy')
}, { immediate: true })

const submitSearch = () => {
  const q = keyword.value.trim()
  router.push({ path: '/search', query: q ? { q } : {} })
}

const searchFor = (term) => {
  keyword.value = term
  router.push({ path: '/search', query: { q: term } })
}

const onPlay = (song) => playerStore.playAll(results.value.songs, song.id)
const onAddQueue = (song) => {
  playerStore.addToQueue(song)
  ElMessage.success(`已加入播放队列：《${song.title}》`)
}

const loadOnlineResults = async (platform = activeOnlinePlatform.value, force = false) => {
  const q = String(route.query.q || keyword.value || '').trim()
  if (!q || !onlineStateByPlatform[platform] || (onlineStateByPlatform[platform].loaded && !force)) return
  const generation = onlineSearchGeneration
  const state = onlineStateByPlatform[platform]
  state.loading = true
  state.error = ''
  try {
    await bootstrapOnlineSources()
    const resultsForPlatform = await searchOnlineTracks(platform, q, { limit: 10 })
    if (generation !== onlineSearchGeneration) return
    onlineResultsByPlatform[platform] = resultsForPlatform
    state.loaded = true
    if (!results.value.songs.length && onlineTotalCount.value) activeTab.value = 'online'
  } catch (error) {
    if (generation !== onlineSearchGeneration) return
    onlineResultsByPlatform[platform] = []
    state.error = error?.message || '在线平台搜索失败，请检查网络或浏览器跨域授权'
    state.loaded = true
  } finally {
    if (generation === onlineSearchGeneration) state.loading = false
  }
}

const onOnlinePlatformChange = (platform) => {
  activeOnlinePlatform.value = platform
  loadOnlineResults(platform)
}

const playOnline = async (track) => {
  onlinePlaying.value = track
  try {
    const song = await resolveOnlineTrack(track, { quality: '320k' })
    await playerStore.playSong(song)
    ElMessage.success(`已开始播放《${song.title}》`)
  } catch (error) {
    ElMessage.warning(error?.message || '在线曲目解析失败，请先导入自动音源')
  } finally {
    onlinePlaying.value = null
  }
}

const onToggleFavorite = async (song) => {
  if (!userStore.isLogin) {
    ElMessage.warning('请先登录后再收藏')
    router.push({ path: '/login', query: { redirect: route.fullPath } })
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
  } catch { /* 请求拦截器已提示 */ }
}

onMounted(async () => {
  readRecent()
  if (userStore.isLogin) {
    try { favoriteIds.value = await favoriteApi.ids() } catch { /* ignore */ }
  }
})
</script>

<style scoped>
.search-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.search-hero,
.discovery,
.results-panel {
  padding: 26px 30px;
  border-radius: 18px;
}
.search-hero {
  position: relative;
  overflow: hidden;
  background: radial-gradient(ellipse at 85% 5%, color-mix(in srgb, var(--holo-primary) 18%, transparent), transparent 48%);
}
.eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--holo-primary);
  font-size: 11px;
  letter-spacing: 2px;
}
h1 {
  margin: 15px 0 8px;
  font-size: clamp(24px, 4vw, 36px);
  letter-spacing: 1px;
}
.search-hero p,
.discovery > p {
  margin: 0 0 20px;
  color: var(--text-sub);
}
.search-input {
  max-width: 760px;
}
.search-tip {
  margin-top: 10px;
  color: var(--text-sub);
  font-size: 11px;
}
.section-title {
  font-size: 18px;
  font-weight: 700;
}
.minor-title {
  margin-top: 5px;
  color: var(--text-sub);
  font-size: 12px;
}
.chip-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 9px;
}
.chip-list :deep(.el-tag) {
  cursor: pointer;
  padding: 0 13px;
}
.recent-searches {
  margin-top: 25px;
}
.results-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  margin-bottom: 12px;
}
.result-tabs :deep(.el-tabs__content) {
  padding-top: 4px;
}
.online-tab-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.online-panel {
  padding: 22px 30px;
  border-radius: 18px;
}
.online-actions { display: flex; align-items: center; gap: 8px; }
.online-results { display: grid; gap: 8px; }
.online-track { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 14px; border: 1px solid var(--border-color); border-radius: 12px; }
.online-track-copy { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.online-track-copy strong, .online-track-copy span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.online-track-copy span, .online-hint { color: var(--text-sub); font-size: 12px; }
.online-error { color: var(--el-color-danger); font-size: 13px; padding: 10px 0; }
@media (max-width: 600px) { .online-panel { padding: 20px 16px; } .online-actions { width: 100%; } .online-actions :deep(.el-select) { flex: 1; } }
.entity-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 14px;
}
.entity-card {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  color: inherit;
  text-align: left;
  background: rgba(148, 163, 184, 0.04);
  cursor: pointer;
  transition: border-color 0.18s, transform 0.18s, background 0.18s;
}
.entity-card:hover {
  transform: translateY(-2px);
  border-color: var(--holo-primary);
  background: color-mix(in srgb, var(--holo-primary) 6%, transparent);
}
.entity-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 650;
}
.entity-meta {
  color: var(--text-sub);
  font-size: 12px;
}
.playlist-grid {
  grid-template-columns: repeat(auto-fill, minmax(165px, 1fr));
}
@media (max-width: 600px) {
  .search-hero,
  .discovery,
  .results-panel {
    padding: 20px 16px;
  }
  .results-heading {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
