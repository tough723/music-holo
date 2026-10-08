<template>
  <div class="page">
    <div class="page-head">
      <div>
        <div class="page-title">我的收藏</div>
        <div class="page-subtitle">收藏的歌曲会一直在这里等你</div>
      </div>
      <div class="page-tools">
        <el-button :disabled="list.length === 0" round @click="playAll">
          <el-icon><VideoPlay /></el-icon> 播放全部
        </el-button>
      </div>
    </div>

    <SongList
      :songs="list"
      :loading="loading"
      :favorite-ids="favoriteIds"
      show-album
      @play="onPlay"
      @toggle-favorite="onToggleFavorite"
      @add-queue="onAddQueue"
    />

    <div class="pagination-wrap">
      <el-pagination
        v-model:current-page="pageNum"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="loadData"
        @size-change="loadData"
      />
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import * as favoriteApi from '@/api/favorite'
import { usePlayerStore } from '@/store/player'
import SongList from '@/components/SongList.vue'

const playerStore = usePlayerStore()

const loading = ref(false)
const list = ref([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const favoriteIds = ref([])

const loadData = async () => {
  loading.value = true
  try {
    const res = await favoriteApi.page({ pageNum: pageNum.value, pageSize: pageSize.value })
    list.value = res.records || []
    total.value = res.total || 0
    favoriteIds.value = list.value.map((s) => s.id)
  } finally {
    loading.value = false
  }
}

const playAll = () => {
  if (list.value.length === 0) return
  playerStore.playAll(list.value, list.value[0].id)
}

const onPlay = (song) => {
  playerStore.playAll(list.value, song.id)
}

const onToggleFavorite = async (song) => {
  try {
    await favoriteApi.cancel(song.id)
    ElMessage.success('已取消收藏')
    loadData()
  } catch (e) { /* 拦截器已提示 */ }
}

const onAddQueue = (song) => {
  playerStore.addToQueue(song)
  ElMessage.success(`已加入播放队列：《${song.title}》`)
}

onMounted(loadData)
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}
.page-tools {
  display: flex;
  gap: 10px;
}
.pagination-wrap {
  display: flex;
  justify-content: center;
}
</style>
