<template>
  <div class="page">
    <div class="page-head">
      <div>
        <div class="page-title">歌曲</div>
        <div class="page-subtitle">发现好音乐，随时随地全息播放</div>
      </div>
    </div>

    <!-- 过滤栏 -->
    <div class="filter-bar glass-panel">
      <el-input
        v-model="keyword"
        placeholder="搜索歌曲 / 专辑"
        clearable
        class="filter-input"
        :prefix-icon="Search"
        @clear="onSearch"
        @keyup.enter="onSearch"
      />
      <el-select v-model="categoryId" placeholder="全部分类" clearable class="filter-select" @change="onSearch">
        <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-select v-model="singerId" placeholder="全部歌手" clearable filterable class="filter-select" @change="onSearch">
        <el-option v-for="s in singers" :key="s.id" :label="s.name" :value="s.id" />
      </el-select>
      <el-button type="primary" @click="onSearch">
        <el-icon><Search /></el-icon> 搜索
      </el-button>
      <div class="filter-right">
        <el-button :disabled="list.length === 0" @click="playAll">
          <el-icon><VideoPlay /></el-icon> 播放全部
        </el-button>
        <el-button :disabled="list.length === 0" @click="addAllToQueue">
          <el-icon><Plus /></el-icon> 加入队列
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
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import * as songApi from '@/api/song'
import * as singerApi from '@/api/singer'
import * as categoryApi from '@/api/category'
import * as favoriteApi from '@/api/favorite'
import { usePlayerStore } from '@/store/player'
import { useUserStore } from '@/store/user'
import SongList from '@/components/SongList.vue'

const route = useRoute()
const router = useRouter()
const playerStore = usePlayerStore()
const userStore = useUserStore()

const loading = ref(false)
const list = ref([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const keyword = ref('')
const categoryId = ref(null)
const singerId = ref(null)
const categories = ref([])
const singers = ref([])
const favoriteIds = ref([])

const loadData = async () => {
  loading.value = true
  try {
    const res = await songApi.page({
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      keyword: keyword.value || undefined,
      categoryId: categoryId.value ?? undefined,
      singerId: singerId.value ?? undefined
    })
    list.value = res.records || []
    total.value = res.total || 0
  } finally {
    loading.value = false
  }
}

const loadFilters = async () => {
  const [categoryList, singerPage] = await Promise.all([
    categoryApi.list(),
    singerApi.page({ pageNum: 1, pageSize: 100 })
  ])
  categories.value = categoryList || []
  singers.value = singerPage.records || []
}

const loadFavorites = async () => {
  if (!userStore.isLogin) return
  try {
    favoriteIds.value = await favoriteApi.ids()
  } catch (e) { /* ignore */ }
}

const onSearch = () => {
  pageNum.value = 1
  loadData()
}

const playAll = () => {
  if (list.value.length === 0) return
  playerStore.playAll(list.value, list.value[0].id)
}

const addAllToQueue = () => {
  list.value.forEach((s) => playerStore.addToQueue(s))
  ElMessage.success(`已将 ${list.value.length} 首歌曲加入播放队列`)
}

const onPlay = (song) => {
  playerStore.playAll(list.value, song.id)
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

// 从首页分类 chip 跳转过来时带上 categoryId
watch(() => route.query.categoryId, (val) => {
  if (val) {
    categoryId.value = Number(val)
    onSearch()
  }
}, { immediate: true })

onMounted(() => {
  loadFilters()
  loadFavorites()
})
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
}
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  flex-wrap: wrap;
}
.filter-input {
  width: 240px;
  max-width: 100%;
}
.filter-select {
  width: 150px;
}
.filter-right {
  margin-left: auto;
  display: flex;
  gap: 10px;
}
.pagination-wrap {
  display: flex;
  justify-content: center;
}
</style>
