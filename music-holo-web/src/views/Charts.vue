<template>
  <div class="charts-page">
    <section class="charts-hero glass-panel">
      <div>
        <div class="eyebrow"><el-icon><TrendCharts /></el-icon> HOLO CHARTS</div>
        <h1>此刻，大家正在听</h1>
        <p>默认展示在线平台实时榜单；切换到“本站播放榜”可查看 Music Holo 本地曲库热度。</p>
      </div>
      <div class="hero-mark"><el-icon><Headset /></el-icon></div>
    </section>

    <section class="chart-panel glass-panel">
      <div class="chart-source-tabs" role="tablist" aria-label="排行榜来源">
        <el-button :type="chartSource === 'online' ? 'primary' : 'default'" @click="chartSource = 'online'">在线平台榜单</el-button>
        <el-button :type="chartSource === 'local' ? 'primary' : 'default'" @click="chartSource = 'local'">本站播放榜</el-button>
      </div>
      <template v-if="chartSource === 'local'">
      <div class="chart-heading">
        <div>
          <div class="section-title">{{ selectedName }}</div>
          <div class="section-sub">热度参考全站播放量 · 每次播放后自动更新</div>
        </div>
        <div class="chart-tabs">
          <el-button :type="categoryId === null ? 'primary' : 'default'" round @click="selectCategory(null)">全站</el-button>
          <el-button
            v-for="category in categories"
            :key="category.id"
            :type="categoryId === category.id ? 'primary' : 'default'"
            round
            @click="selectCategory(category.id)"
          >
            {{ category.name }}
          </el-button>
        </div>
      </div>
      <ol v-if="songs.length" class="podium" aria-label="榜单前三">
        <li v-for="(song, index) in songs.slice(0, 3)" :key="song.id" :class="`place-${index + 1}`">
          <button type="button" :aria-label="`从第${index + 1}名播放《${song.title}》`" @click="onPlay(song)">
            <span>{{ index + 1 }}</span>
            <strong>{{ song.title }}</strong>
            <small>{{ song.singerName || '未知歌手' }} · {{ song.playCount || 0 }} 次</small>
          </button>
        </li>
      </ol>
      <SongList
        :songs="songs"
        :loading="loading"
        :favorite-ids="favoriteIds"
        show-album
        show-play-count
        @play="onPlay"
        @toggle-favorite="onToggleFavorite"
        @add-queue="onAddQueue"
      />
      <el-empty v-if="!loading && songs.length === 0" description="这个分类暂时还没有歌曲。" :image-size="100" />
      </template>
    </section>

    <section v-if="chartSource === 'online'" class="chart-panel glass-panel online-chart-panel">
      <div class="chart-heading">
        <div>
          <div class="section-title">在线平台榜单</div>
          <div class="section-sub">动态读取平台公开榜单，不是本站固定播放榜。</div>
        </div>
        <div class="online-chart-actions">
          <el-select v-model="onlinePlatform" size="small" aria-label="在线榜单平台" style="width: 150px" @change="loadOnlineCharts">
            <el-option label="网易云音乐" value="wy" />
            <el-option label="酷我音乐" value="kw" />
          </el-select>
          <el-button size="small" :loading="onlineLoading" @click="loadOnlineCharts">刷新榜单</el-button>
        </div>
      </div>
      <div v-if="onlineError" class="online-error">{{ onlineError }}</div>
      <template v-else>
        <div v-if="onlineCharts.length" class="online-chart-picker">
          <button
            v-for="chart in onlineCharts"
            :key="chart.id"
            type="button"
            class="online-chart-card"
            :class="{ 'is-selected': onlineChartId === chart.id }"
            @click="selectOnlineChart(chart.id)"
          >
            <img v-if="chart.coverUrl" :src="chart.coverUrl" :alt="`${chart.name} 封面`" loading="lazy" />
            <span v-else class="online-chart-card-placeholder"><el-icon><TrendCharts /></el-icon></span>
            <span class="online-chart-card-copy"><strong>{{ chart.name }}</strong><small>{{ chart.updateFrequency || '平台实时榜单' }}</small></span>
          </button>
        </div>
        <div v-if="onlineTracks.length" class="online-chart-tracks">
          <div v-for="track in onlineTracks" :key="`${track.platform}-${track.musicInfo?.id || track.name}`" class="online-chart-track">
            <span class="online-track-copy"><strong>{{ track.name }}</strong><small>{{ track.singer || '未知歌手' }}<template v-if="track.album"> · {{ track.album }}</template></small></span>
            <div class="online-track-actions">
              <el-button size="small" :loading="onlinePlaying === track" @click="queueOnlineTrack(track)">加入队列</el-button>
              <el-button size="small" type="primary" :loading="onlinePlaying === track" @click="playOnlineTrack(track)">播放</el-button>
            </div>
          </div>
        </div>
        <el-empty v-if="onlineLoaded && !onlineCharts.length" description="该平台没有返回可用榜单" :image-size="70" />
        <el-empty v-else-if="onlineLoaded && onlineChartId && !onlineTracks.length" description="该榜单没有返回曲目" :image-size="70" />
      </template>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import * as songApi from '@/api/song'
import * as categoryApi from '@/api/category'
import * as favoriteApi from '@/api/favorite'
import { usePlayerStore } from '@/store/player'
import { useUserStore } from '@/store/user'
import SongList from '@/components/SongList.vue'
import { fetchOnlineChartTracks, listOnlineCharts, resolveOnlineTrack } from '@/utils/onlineTrackService'

const router = useRouter()
const playerStore = usePlayerStore()
const userStore = useUserStore()
const songs = ref([])
const categories = ref([])
const favoriteIds = ref([])
const loading = ref(false)
const categoryId = ref(null)
const selectedName = computed(() => categoryId.value === null
  ? '全站热歌榜'
  : `${categories.value.find((item) => item.id === categoryId.value)?.name || '分类'}热歌榜`)
const chartSource = ref('online')
const onlinePlatform = ref('wy')
const onlineCharts = ref([])
const onlineChartId = ref('')
const onlineTracks = ref([])
const onlineLoading = ref(false)
const onlineLoaded = ref(false)
const onlineError = ref('')
const onlinePlaying = ref(null)

const loadSongs = async () => {
  loading.value = true
  try {
    const page = await songApi.page({ pageNum: 1, pageSize: 50, ...(categoryId.value ? { categoryId: categoryId.value } : {}) })
    songs.value = page.records || []
  } catch {
    songs.value = []
  } finally {
    loading.value = false
  }
}

const selectCategory = (id) => {
  categoryId.value = id
  loadSongs()
}

const selectOnlineChart = async (id) => {
  if (onlineChartId.value === id && onlineTracks.value.length) return
  onlineChartId.value = id
  onlineTracks.value = []
  await loadOnlineTracks()
}

const onPlay = (song) => playerStore.playAll(songs.value, song.id)
const onAddQueue = (song) => {
  playerStore.addToQueue(song)
  ElMessage.success(`已加入播放队列：《${song.title}》`)
}
const loadOnlineCharts = async () => {
  onlineLoading.value = true
  onlineError.value = ''
  onlineLoaded.value = false
  try {
    // 榜单目录是公开平台能力，不应被某个自定义音源初始化失败阻断。
    onlineCharts.value = await listOnlineCharts(onlinePlatform.value)
    onlineChartId.value = onlineCharts.value[0]?.id || ''
    if (onlineChartId.value) await loadOnlineTracks()
  } catch (error) {
    onlineError.value = error?.message || '在线榜单加载失败，请检查网络/CORS'
    onlineCharts.value = []
    onlineTracks.value = []
  } finally {
    onlineLoaded.value = true
    onlineLoading.value = false
  }
}
const loadOnlineTracks = async () => {
  if (!onlineChartId.value) return
  try { onlineTracks.value = await fetchOnlineChartTracks(onlinePlatform.value, onlineChartId.value, { limit: 20 }) } catch (error) { onlineError.value = error?.message || '在线榜单曲目加载失败' }
}
const resolveChartTrack = async (track) => resolveOnlineTrack(track, { quality: '320k' })
const playOnlineTrack = async (track) => {
  onlinePlaying.value = track
  try { await playerStore.playSong(await resolveChartTrack(track)); ElMessage.success(`已开始播放《${track.name}》`) }
  catch (error) { ElMessage.warning(error?.message || '在线曲目解析失败，请先导入自动音源') }
  finally { onlinePlaying.value = null }
}
const queueOnlineTrack = async (track) => {
  onlinePlaying.value = track
  try { playerStore.addToQueue(await resolveChartTrack(track)); ElMessage.success(`已加入队列《${track.name}》`) }
  catch (error) { ElMessage.warning(error?.message || '在线曲目解析失败，请先导入自动音源') }
  finally { onlinePlaying.value = null }
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
    } else {
      await favoriteApi.add(song.id)
      favoriteIds.value.push(song.id)
    }
  } catch { /* 请求拦截器已提示 */ }
}

onMounted(async () => {
  try { categories.value = await categoryApi.list() } catch { categories.value = [] }
  if (userStore.isLogin) {
    try { favoriteIds.value = await favoriteApi.ids() } catch { /* ignore */ }
  }
  await loadSongs()
  loadOnlineCharts()
})
</script>

<style scoped>
.charts-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.charts-hero,
.chart-panel {
  padding: 26px 30px;
  border-radius: 18px;
}
.chart-source-tabs { display: flex; gap: 10px; margin-bottom: 16px; }
.charts-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  overflow: hidden;
  background: radial-gradient(ellipse at 80% 25%, color-mix(in srgb, var(--holo-primary) 20%, transparent), transparent 42%);
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
  margin: 13px 0 7px;
  font-size: clamp(25px, 4vw, 36px);
}
.charts-hero p,
.section-sub {
  margin: 0;
  color: var(--text-sub);
  font-size: 13px;
}
.hero-mark {
  display: grid;
  place-items: center;
  width: 112px;
  height: 112px;
  border-radius: 50%;
  color: var(--holo-primary);
  font-size: 56px;
  background: color-mix(in srgb, var(--holo-primary) 10%, transparent);
  box-shadow: 0 0 50px var(--holo-glow);
}
.chart-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 18px;
  margin-bottom: 18px;
}
.section-title {
  font-size: 19px;
  font-weight: 700;
}
.section-sub {
  margin-top: 6px;
}
.online-chart-panel { margin-top: 0; }
.online-chart-actions { display: flex; align-items: center; gap: 8px; }
.online-chart-picker { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; margin: 16px 0; }
.online-chart-card { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 10px; border: 1px solid var(--border-color); border-radius: 14px; color: inherit; text-align: left; background: rgba(148, 163, 184, 0.05); cursor: pointer; transition: border-color .18s, transform .18s, background .18s; }
.online-chart-card:hover, .online-chart-card.is-selected { border-color: var(--holo-primary); background: color-mix(in srgb, var(--holo-primary) 10%, transparent); transform: translateY(-2px); }
.online-chart-card img, .online-chart-card-placeholder { flex: 0 0 48px; width: 48px; height: 48px; border-radius: 10px; object-fit: cover; }
.online-chart-card-placeholder { display: grid; place-items: center; color: var(--holo-primary); background: color-mix(in srgb, var(--holo-primary) 12%, transparent); }
.online-chart-card-copy { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.online-chart-card-copy strong, .online-chart-card-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.online-chart-card-copy small { color: var(--text-sub); font-size: 11px; }
.online-chart-tracks { display: grid; gap: 8px; margin-top: 14px; }
.online-chart-track { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 10px; }
.online-track-copy { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.online-track-copy strong, .online-track-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.online-track-copy small { color: var(--text-sub); font-size: 12px; }
.online-track-actions { display: flex; flex: 0 0 auto; gap: 6px; }
.online-error { color: var(--el-color-danger); font-size: 13px; margin: 10px 0; }
.chart-tabs {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.chart-tabs .el-button + .el-button {
  margin-left: 0;
}
.podium {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 0 0 18px;
  padding: 0;
  list-style: none;
}
.podium button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  min-height: 108px;
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--holo-primary) 24%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--holo-primary) 8%, transparent);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.podium .place-1 button {
  min-height: 128px;
  background: color-mix(in srgb, var(--holo-primary) 16%, transparent);
}
.podium button span {
  color: var(--holo-primary);
  font-size: 22px;
  font-weight: 700;
}
.podium small {
  color: var(--text-sub);
}
@media (max-width: 700px) {
  .charts-hero,
  .chart-panel {
    padding: 20px 16px;
  }
  .hero-mark {
    width: 76px;
    height: 76px;
    font-size: 38px;
  }
  .chart-heading {
    flex-direction: column;
  }
  .chart-tabs {
    justify-content: flex-start;
  }
  .podium {
    grid-template-columns: 1fr;
  }
}
</style>
