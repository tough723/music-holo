<template>
  <div class="history-page">
    <section class="history-hero glass-panel">
      <div>
        <div class="eyebrow"><el-icon><Clock /></el-icon> YOUR LISTENING TRAIL</div>
        <h1>最近播放</h1>
        <p>把刚刚听过的旋律，留在触手可及的地方。</p>
      </div>
      <el-button :disabled="songs.length === 0" plain type="danger" @click="clearHistory">
        <el-icon><Delete /></el-icon> 清空记录
      </el-button>
    </section>

    <section class="history-list glass-panel">
      <div class="list-heading">
        <div class="section-title">播放历史</div>
        <span>{{ total }} 首歌曲</span>
      </div>
      <SongList
        v-if="songs.length || loading"
        :songs="songs"
        :loading="loading"
        :favorite-ids="favoriteIds"
        :show-history="true"
        show-album
        @play="onPlay"
        @toggle-favorite="onToggleFavorite"
        @add-queue="onAddQueue"
      >
        <template #actions="{ row }">
          <el-tooltip content="从最近播放中移除" placement="top">
            <el-button circle size="small" type="danger" plain @click.stop="removeSong(row)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </el-tooltip>
        </template>
      </SongList>
      <el-empty v-else description="还没有播放记录，听过的歌曲会出现在这里。" :image-size="112">
        <el-button type="primary" @click="router.push('/songs')">去听点音乐</el-button>
      </el-empty>
      <el-pagination
        v-if="total > pageSize"
        v-model:current-page="pageNum"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next"
        background
        class="pagination"
        @current-change="loadHistory"
      />
    </section>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as historyApi from '@/api/history'
import * as favoriteApi from '@/api/favorite'
import { usePlayerStore } from '@/store/player'
import { useUserStore } from '@/store/user'
import SongList from '@/components/SongList.vue'

const router = useRouter()
const playerStore = usePlayerStore()
const userStore = useUserStore()
const songs = ref([])
const favoriteIds = ref([])
const loading = ref(false)
const pageNum = ref(1)
const pageSize = 20
const total = ref(0)
let refreshTimer

const loadHistory = async () => {
  loading.value = true
  try {
    const page = await historyApi.page({ pageNum: pageNum.value, pageSize })
    songs.value = page.records || []
    total.value = page.total || 0
  } catch {
    songs.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

const onPlay = (song) => {
  playerStore.playAll(songs.value, song.id)
  window.clearTimeout(refreshTimer)
  refreshTimer = window.setTimeout(loadHistory, 450)
}

const removeSong = async (song) => {
  try {
    await historyApi.remove(song.id)
    ElMessage.success('已从最近播放中移除')
    if (songs.value.length === 1 && pageNum.value > 1) pageNum.value -= 1
    await loadHistory()
  } catch { /* 请求拦截器已提示 */ }
}

const clearHistory = async () => {
  try {
    await ElMessageBox.confirm('这会清空你的全部最近播放记录，且无法撤销。', '清空播放历史', {
      type: 'warning',
      confirmButtonText: '确认清空',
      cancelButtonText: '取消'
    })
    await historyApi.clear()
    pageNum.value = 1
    songs.value = []
    total.value = 0
    ElMessage.success('播放历史已清空')
  } catch { /* 用户取消 */ }
}

const onToggleFavorite = async (song) => {
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

const onAddQueue = (song) => {
  playerStore.addToQueue(song)
  ElMessage.success(`已加入播放队列：《${song.title}》`)
}

onMounted(async () => {
  const tasks = [loadHistory()]
  if (userStore.isLogin) tasks.push(favoriteApi.ids().then((ids) => { favoriteIds.value = ids }).catch(() => {}))
  await Promise.all(tasks)
})
onBeforeUnmount(() => window.clearTimeout(refreshTimer))
</script>

<style scoped>
.history-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.history-hero,
.history-list {
  padding: 24px 28px;
  border-radius: 18px;
}
.history-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  background: radial-gradient(ellipse at 85% 5%, color-mix(in srgb, var(--holo-primary) 17%, transparent), transparent 44%);
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
  margin: 12px 0 6px;
  font-size: clamp(26px, 4vw, 36px);
}
.history-hero p {
  margin: 0;
  color: var(--text-sub);
}
.list-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.list-heading span {
  color: var(--text-sub);
  font-size: 12px;
}
.section-title {
  font-size: 18px;
  font-weight: 700;
}
.pagination {
  justify-content: flex-end;
  margin-top: 18px;
}
@media (max-width: 600px) {
  .history-hero,
  .history-list {
    padding: 20px 15px;
  }
  .history-hero {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
