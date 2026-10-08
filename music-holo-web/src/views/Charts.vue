<template>
  <div class="charts-page">
    <section class="charts-hero glass-panel">
      <div>
        <div class="eyebrow"><el-icon><TrendCharts /></el-icon> HOLO CHARTS</div>
        <h1>此刻，大家正在听</h1>
        <p>按平台累计播放量整理的热歌榜，切换分类，找到同频的声音。</p>
      </div>
      <div class="hero-mark"><el-icon><Headset /></el-icon></div>
    </section>

    <section class="chart-panel glass-panel">
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

const onPlay = (song) => playerStore.playAll(songs.value, song.id)
const onAddQueue = (song) => {
  playerStore.addToQueue(song)
  ElMessage.success(`已加入播放队列：《${song.title}》`)
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
.chart-tabs {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.chart-tabs .el-button + .el-button {
  margin-left: 0;
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
}
</style>
