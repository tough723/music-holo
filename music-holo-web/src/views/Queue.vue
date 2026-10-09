<template>
  <div class="page">
    <div class="page-head">
      <div>
        <div class="page-title">播放列表</div>
        <div class="page-subtitle">服务端保存的播放队列（登录后跨设备同步）</div>
      </div>
      <div class="page-tools">
        <el-button type="primary" :disabled="list.length === 0" round @click="playAll">
          <el-icon><VideoPlay /></el-icon> 播放全部
        </el-button>
        <el-button round @click="openAddOne">
          <el-icon><Plus /></el-icon> 添加一首
        </el-button>
        <el-button round @click="openAddBatch">
          <el-icon><Finished /></el-icon> 批量添加
        </el-button>
        <el-button type="danger" plain round :disabled="list.length === 0" @click="onClear">
          <el-icon><Delete /></el-icon> 清空列表
        </el-button>
      </div>
    </div>

    <div class="glass-panel queue-panel">
      <SongList
        :songs="list"
        :loading="loading"
        :favorite-ids="favoriteIds"
        hide-favorite
        @play="onPlay"
        @add-queue="onAddToLocal"
      >
        <template #actions="{ row }">
          <el-tooltip content="从播放列表移除" placement="top">
            <el-button circle size="small" type="danger" plain @click.stop="onRemove(row)">
              <el-icon><Remove /></el-icon>
            </el-button>
          </el-tooltip>
        </template>
      </SongList>
      <el-empty v-if="!loading && list.length === 0" description="播放列表空空如也，添加几首歌吧～" />
    </div>

    <!-- 添加一首 / 批量添加（共用歌曲选择对话框） -->
    <el-dialog v-model="pickerVisible" :title="pickerMode === 'one' ? '添加一首歌曲' : '批量添加歌曲'" width="720px">
      <div class="picker-tools">
        <el-input
          v-model="songKeyword"
          placeholder="搜索歌曲"
          clearable
          style="width: 240px"
          :prefix-icon="Search"
          @clear="loadAllSongs"
          @keyup.enter="loadAllSongs"
        />
      </div>
      <el-table
        v-loading="songsLoading"
        :data="allSongs"
        height="380px"
        :highlight-current-row="pickerMode === 'one'"
        @selection-change="onSelectionChange"
        @current-change="onCurrentChange"
      >
        <el-table-column v-if="pickerMode === 'batch'" type="selection" width="46" />
        <el-table-column label="歌曲" min-width="220">
          <template #default="{ row }">{{ row.title }}</template>
        </el-table-column>
        <el-table-column label="歌手" width="130">
          <template #default="{ row }">{{ row.singerName }}</template>
        </el-table-column>
        <el-table-column label="分类" width="100">
          <template #default="{ row }">{{ row.categoryName }}</template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="pickerVisible = false">取消</el-button>
        <el-button
          v-if="pickerMode === 'one'"
          type="primary"
          :disabled="!currentSong"
          :loading="submitting"
          @click="onAddOne"
        >
          添加
        </el-button>
        <el-button
          v-else
          type="primary"
          :disabled="selectedIds.length === 0"
          :loading="submitting"
          @click="onAddBatch"
        >
          添加选中的 {{ selectedIds.length }} 首
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as queueApi from '@/api/queue'
import * as songApi from '@/api/song'
import * as favoriteApi from '@/api/favorite'
import { usePlayerStore } from '@/store/player'
import { useUserStore } from '@/store/user'
import SongList from '@/components/SongList.vue'

const playerStore = usePlayerStore()
const userStore = useUserStore()

const loading = ref(false)
const list = ref([])
const favoriteIds = ref([])

const pickerVisible = ref(false)
const pickerMode = ref('one') // one | batch
const allSongs = ref([])
const songsLoading = ref(false)
const songKeyword = ref('')
const selectedIds = ref([])
const currentSong = ref(null)
const submitting = ref(false)

const loadData = async () => {
  loading.value = true
  try {
    list.value = (await queueApi.getQueue()) || []
  } finally {
    loading.value = false
  }
  if (userStore.isLogin) {
    try {
      favoriteIds.value = await favoriteApi.ids()
    } catch (e) { /* ignore */ }
  }
}

const loadAllSongs = async () => {
  songsLoading.value = true
  try {
    const res = await songApi.page({ pageNum: 1, pageSize: 100, keyword: songKeyword.value || undefined })
    allSongs.value = res.records || []
  } finally {
    songsLoading.value = false
  }
}

const openAddOne = async () => {
  pickerMode.value = 'one'
  pickerVisible.value = true
  songKeyword.value = ''
  currentSong.value = null
  await loadAllSongs()
}

const openAddBatch = async () => {
  pickerMode.value = 'batch'
  pickerVisible.value = true
  songKeyword.value = ''
  selectedIds.value = []
  await loadAllSongs()
}

const onSelectionChange = (rows) => {
  selectedIds.value = rows.map((r) => r.id)
}
const onCurrentChange = (row) => {
  currentSong.value = row || null
}

const onAddOne = async () => {
  if (!currentSong.value) return
  submitting.value = true
  try {
    await queueApi.add(currentSong.value.id)
    ElMessage.success(`已添加：《${currentSong.value.title}》`)
    pickerVisible.value = false
    loadData()
  } finally {
    submitting.value = false
  }
}

const onAddBatch = async () => {
  if (selectedIds.value.length === 0) return
  submitting.value = true
  try {
    await queueApi.addBatch(selectedIds.value)
    ElMessage.success(`成功批量添加 ${selectedIds.value.length} 首歌曲`)
    pickerVisible.value = false
    loadData()
  } finally {
    submitting.value = false
  }
}

const onRemove = async (song) => {
  await queueApi.remove(song.id)
  ElMessage.success('已移除')
  loadData()
}

const onClear = async () => {
  await ElMessageBox.confirm('确定清空整个播放列表吗？', '提示', { type: 'warning' })
  await queueApi.clear()
  ElMessage.success('播放列表已清空')
  loadData()
}

const playAll = () => {
  if (list.value.length === 0) return
  playerStore.playAll(list.value, list.value[0].id)
}

const onPlay = (song) => {
  playerStore.playAll(list.value, song.id)
}

const onAddToLocal = (song) => {
  playerStore.addToQueue(song)
  ElMessage.success(`已加入本地播放队列：《${song.title}》`)
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
  flex-wrap: wrap;
}
.queue-panel {
  padding: 6px 12px;
}
.picker-tools {
  margin-bottom: 12px;
}
</style>
