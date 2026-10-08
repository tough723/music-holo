<template>
  <div class="page">
    <div class="page-head">
      <div>
        <div class="page-title">歌单管理</div>
        <div class="page-subtitle">维护歌单与歌单内的歌曲</div>
      </div>
    </div>

    <div class="toolbar glass-panel">
      <el-input
        v-model="keyword"
        placeholder="搜索歌单名称"
        clearable
        style="width: 220px"
        :prefix-icon="Search"
        @clear="loadData"
        @keyup.enter="loadData"
      />
      <el-button type="primary" @click="loadData">
        <el-icon><Search /></el-icon> 搜索
      </el-button>
      <div class="toolbar-right">
        <el-button type="primary" @click="openAdd">
          <el-icon><Plus /></el-icon> 新建歌单
        </el-button>
      </div>
    </div>

    <div class="glass-panel table-panel">
      <el-table v-loading="loading" :data="list">
        <el-table-column label="ID" prop="id" width="80" />
        <el-table-column label="封面" width="70" align="center">
          <template #default="{ row }">
            <div class="cell-cover"><Cover :src="row.cover" :text="row.name" :size="40" /></div>
          </template>
        </el-table-column>
        <el-table-column label="名称" prop="name" min-width="160" />
        <el-table-column label="创建者" width="120">
          <template #default="{ row }">{{ row.creatorName || '-' }}</template>
        </el-table-column>
        <el-table-column label="歌曲数" prop="songCount" width="90" align="center" />
        <el-table-column label="播放量" prop="playCount" width="100" align="center" />
        <el-table-column label="公开" width="80" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.isPublic === 1 ? 'success' : 'warning'" effect="plain">
              {{ row.isPublic === 1 ? '公开' : '私密' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="描述" prop="description" min-width="180" show-overflow-tooltip />
        <el-table-column label="操作" width="220" align="center" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openSongs(row)">歌曲</el-button>
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" plain @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
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

    <!-- 新增 / 编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑歌单' : '新建歌单'" width="520px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="请输入歌单名称" />
        </el-form-item>
        <el-form-item label="封面">
          <div class="upload-row">
            <el-input v-model="form.cover" placeholder="封面地址（可上传）" clearable />
            <el-upload :show-file-list="false" :http-request="onUploadCover" accept="image/*">
              <el-button>上传</el-button>
            </el-upload>
          </div>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="介绍一下这个歌单" />
        </el-form-item>
        <el-form-item label="是否公开">
          <el-radio-group v-model="form.isPublic">
            <el-radio :value="1">公开</el-radio>
            <el-radio :value="0">私密</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 歌单歌曲管理对话框 -->
    <el-dialog v-model="songsVisible" :title="`歌单歌曲管理：《${current?.name}》`" width="760px">
      <div class="songs-toolbar">
        <el-button type="primary" size="small" @click="openAddSongs">
          <el-icon><Plus /></el-icon> 添加歌曲
        </el-button>
        <span class="songs-tip">共 {{ playlistSongs.length }} 首</span>
      </div>
      <el-table v-loading="songsLoading" :data="playlistSongs" height="360px">
        <el-table-column label="序号" type="index" width="60" align="center" />
        <el-table-column label="歌曲" min-width="200">
          <template #default="{ row }">{{ row.title }}</template>
        </el-table-column>
        <el-table-column label="歌手" width="130">
          <template #default="{ row }">{{ row.singerName }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="center">
          <template #default="{ row }">
            <el-button size="small" type="danger" plain @click="onRemoveSong(row)">移除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <!-- 添加歌曲对话框 -->
    <el-dialog v-model="addSongsVisible" title="添加歌曲到歌单" width="720px" append-to-body>
      <div class="add-songs-tools">
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
      <el-table v-loading="allSongsLoading" :data="allSongs" height="360px" @selection-change="onSelectionChange">
        <el-table-column type="selection" width="46" />
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
        <el-button @click="addSongsVisible = false">取消</el-button>
        <el-button type="primary" :disabled="selectedIds.length === 0" :loading="adding" @click="onAddSongs">
          添加选中的 {{ selectedIds.length }} 首
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as playlistApi from '@/api/playlist'
import * as songApi from '@/api/song'
import * as commonApi from '@/api/common'
import Cover from '@/components/Cover.vue'

const loading = ref(false)
const list = ref([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const keyword = ref('')

const dialogVisible = ref(false)
const saving = ref(false)
const form = reactive({ id: null, name: '', cover: '', description: '', isPublic: 1 })

const songsVisible = ref(false)
const songsLoading = ref(false)
const current = ref(null)
const playlistSongs = ref([])

const addSongsVisible = ref(false)
const allSongs = ref([])
const allSongsLoading = ref(false)
const songKeyword = ref('')
const selectedIds = ref([])
const adding = ref(false)

const loadData = async () => {
  loading.value = true
  try {
    const res = await playlistApi.page({
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      keyword: keyword.value || undefined
    })
    list.value = res.records || []
    total.value = res.total || 0
  } finally {
    loading.value = false
  }
}

const openAdd = () => {
  Object.assign(form, { id: null, name: '', cover: '', description: '', isPublic: 1 })
  dialogVisible.value = true
}

const openEdit = (row) => {
  Object.assign(form, {
    id: row.id,
    name: row.name,
    cover: row.cover || '',
    description: row.description || '',
    isPublic: row.isPublic ?? 1
  })
  dialogVisible.value = true
}

const onUploadCover = async ({ file }) => {
  const res = await commonApi.upload(file)
  form.cover = res.url
  ElMessage.success('封面上传成功')
}

const onSave = async () => {
  if (!form.name) {
    ElMessage.warning('请输入歌单名称')
    return
  }
  saving.value = true
  try {
    await playlistApi.save({ ...form })
    ElMessage.success('保存成功')
    dialogVisible.value = false
    loadData()
  } finally {
    saving.value = false
  }
}

const onDelete = async (row) => {
  await ElMessageBox.confirm(`确定删除歌单「${row.name}」吗？`, '提示', { type: 'warning' })
  await playlistApi.remove(row.id)
  ElMessage.success('删除成功')
  loadData()
}

// ---------- 歌单歌曲管理 ----------
const openSongs = async (row) => {
  current.value = row
  songsVisible.value = true
  await loadPlaylistSongs()
}

const loadPlaylistSongs = async () => {
  songsLoading.value = true
  try {
    playlistSongs.value = (await playlistApi.songsOfPlaylist(current.value.id)) || []
  } finally {
    songsLoading.value = false
  }
}

const openAddSongs = async () => {
  addSongsVisible.value = true
  songKeyword.value = ''
  selectedIds.value = []
  await loadAllSongs()
}

const loadAllSongs = async () => {
  allSongsLoading.value = true
  try {
    const res = await songApi.page({ pageNum: 1, pageSize: 100, keyword: songKeyword.value || undefined })
    allSongs.value = res.records || []
  } finally {
    allSongsLoading.value = false
  }
}

const onSelectionChange = (rows) => {
  selectedIds.value = rows.map((r) => r.id)
}

const onAddSongs = async () => {
  adding.value = true
  try {
    const added = await playlistApi.addSongs(current.value.id, selectedIds.value)
    ElMessage.success(`成功添加 ${added} 首歌曲`)
    addSongsVisible.value = false
    loadPlaylistSongs()
    loadData()
  } finally {
    adding.value = false
  }
}

const onRemoveSong = async (song) => {
  await ElMessageBox.confirm(`确定从歌单中移除《${song.title}》吗？`, '提示', { type: 'warning' })
  await playlistApi.removeSong(current.value.id, song.id)
  ElMessage.success('已移除')
  loadPlaylistSongs()
  loadData()
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
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  flex-wrap: wrap;
}
.toolbar-right {
  margin-left: auto;
  display: flex;
  gap: 10px;
}
.table-panel {
  padding: 6px 12px;
}
.cell-cover {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
}
.upload-row {
  display: flex;
  gap: 10px;
  width: 100%;
}
.pagination-wrap {
  display: flex;
  justify-content: center;
  padding: 14px 0 8px;
}
.songs-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 12px;
}
.songs-tip {
  color: var(--text-sub);
  font-size: 12px;
}
.add-songs-tools {
  margin-bottom: 12px;
}
</style>
