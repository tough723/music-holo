<template>
  <div class="page">
    <div class="page-head">
      <div>
        <div class="page-title">歌曲管理</div>
        <div class="page-subtitle">维护曲库，支持音频 / 封面 / 歌词上传</div>
      </div>
    </div>

    <div class="toolbar glass-panel">
      <el-input
        v-model="keyword"
        placeholder="搜索歌曲 / 专辑"
        clearable
        style="width: 220px"
        :prefix-icon="Search"
        @clear="loadData"
        @keyup.enter="loadData"
      />
      <el-select v-model="categoryId" placeholder="全部分类" clearable filterable style="width: 140px" @change="loadData">
        <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-select v-model="singerId" placeholder="全部歌手" clearable filterable style="width: 140px" @change="loadData">
        <el-option v-for="s in singers" :key="s.id" :label="s.name" :value="s.id" />
      </el-select>
      <el-button type="primary" @click="loadData">
        <el-icon><Search /></el-icon> 搜索
      </el-button>
      <div class="toolbar-right">
        <el-button type="primary" @click="openAdd">
          <el-icon><Plus /></el-icon> 新增歌曲
        </el-button>
      </div>
    </div>

    <div class="glass-panel table-panel">
      <el-table v-loading="loading" :data="list">
        <el-table-column label="ID" prop="id" width="80" />
        <el-table-column label="封面" width="70" align="center">
          <template #default="{ row }">
            <div class="cell-cover"><Cover :src="row.cover" :text="row.title" :size="40" /></div>
          </template>
        </el-table-column>
        <el-table-column label="标题" prop="title" min-width="160" />
        <el-table-column label="歌手" width="120">
          <template #default="{ row }">{{ row.singerName || '-' }}</template>
        </el-table-column>
        <el-table-column label="分类" width="100">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.categoryName || '-' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="专辑" prop="album" min-width="120" show-overflow-tooltip />
        <el-table-column label="时长" width="80" align="center">
          <template #default="{ row }">{{ fmtDuration(row.duration) }}</template>
        </el-table-column>
        <el-table-column label="播放量" prop="playCount" width="100" align="center" />
        <el-table-column label="操作" width="220" align="center" fixed="right">
          <template #default="{ row }">
            <el-button size="small" :aria-label="`播放《${row.title}》`" @click="playerStore.playSong(row)">播放</el-button>
            <el-button size="small" :aria-label="`编辑《${row.title}》`" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" plain :aria-label="`删除《${row.title}》`" @click="onDelete(row)">删除</el-button>
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
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑歌曲' : '新增歌曲'" width="560px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="标题" required>
          <el-input v-model="form.title" placeholder="请输入歌曲标题" />
        </el-form-item>
        <el-form-item label="歌手" required>
          <el-select v-model="form.singerId" placeholder="请选择歌手" filterable style="width: 100%">
            <el-option v-for="s in singers" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="分类" required>
          <el-select v-model="form.categoryId" placeholder="请选择分类" filterable style="width: 100%">
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="专辑">
          <el-input v-model="form.album" placeholder="请输入专辑名" />
        </el-form-item>
        <el-form-item label="时长(秒)">
          <el-input-number v-model="form.duration" :min="1" controls-position="right" style="width: 160px" />
        </el-form-item>
        <el-form-item label="音频">
          <div class="upload-row">
            <el-input v-model="form.audioUrl" placeholder="音频地址（可上传）" clearable />
            <el-upload :show-file-list="false" :http-request="onUploadAudio" accept="audio/*">
              <el-button>上传</el-button>
            </el-upload>
          </div>
        </el-form-item>
        <el-form-item label="封面">
          <div class="upload-row">
            <el-input v-model="form.cover" placeholder="封面地址（可上传）" clearable />
            <el-upload :show-file-list="false" :http-request="onUploadCover" accept="image/*">
              <el-button>上传</el-button>
            </el-upload>
          </div>
        </el-form-item>
        <el-form-item label="歌词">
          <div class="lyric-row">
            <el-input
              v-model="form.lyric"
              type="textarea"
              :rows="5"
              :disabled="lyricLoading"
              placeholder="LRC 格式歌词，如 [00:01.00]第一句歌词"
            />
            <el-upload :show-file-list="false" :http-request="onUploadLyric" accept=".lrc,.txt" :disabled="lyricLoading">
              <el-button>上传原歌词 .lrc</el-button>
            </el-upload>
          </div>
        </el-form-item>
        <el-form-item label="罗马音">
          <div class="lyric-row">
            <el-input
              v-model="form.lyricRomaji"
              type="textarea"
              :rows="4"
              :disabled="lyricLoading"
              placeholder="可选 LRC 罗马音，只接受导入，不抓取外部歌词"
            />
            <el-upload :show-file-list="false" :http-request="onUploadLyricRomaji" accept=".lrc,.txt" :disabled="lyricLoading">
              <el-button>上传罗马音 .lrc</el-button>
            </el-upload>
          </div>
        </el-form-item>
        <el-form-item label="译文歌词">
          <div class="lyric-row">
            <el-input
              v-model="form.lyricTranslation"
              type="textarea"
              :rows="4"
              :disabled="lyricLoading"
              placeholder="可选 LRC 译文；建议与原歌词使用对应时间标签"
            />
            <el-upload :show-file-list="false" :http-request="onUploadLyricTranslation" accept=".lrc,.txt" :disabled="lyricLoading">
              <el-button>上传译文 .lrc</el-button>
            </el-upload>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving || lyricLoading" :disabled="lyricLoadFailed" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as songApi from '@/api/song'
import * as singerApi from '@/api/singer'
import * as categoryApi from '@/api/category'
import * as commonApi from '@/api/common'
import { usePlayerStore } from '@/store/player'
import { fmtDuration } from '@/utils/format'
import Cover from '@/components/Cover.vue'

const playerStore = usePlayerStore()

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

const dialogVisible = ref(false)
const saving = ref(false)
const lyricLoading = ref(false)
const lyricLoadFailed = ref(false)
let lyricRequestId = 0
const form = reactive({
  id: null,
  title: '',
  singerId: null,
  categoryId: null,
  album: '',
  duration: 10,
  cover: '',
  audioUrl: '',
  lyric: '',
  lyricTranslation: '',
  lyricRomaji: '',
  status: 1
})

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

const loadOptions = async () => {
  const [categoryList, singerPage] = await Promise.all([
    categoryApi.list(),
    singerApi.page({ pageNum: 1, pageSize: 200 })
  ])
  categories.value = categoryList || []
  singers.value = singerPage.records || []
}

const openAdd = () => {
  lyricRequestId++
  lyricLoading.value = false
  lyricLoadFailed.value = false
  Object.assign(form, {
    id: null, title: '', singerId: null, categoryId: null, album: '',
    duration: 10, cover: '', audioUrl: '', lyric: '', lyricTranslation: '', lyricRomaji: '', status: 1
  })
  dialogVisible.value = true
}

const openEdit = (row) => {
  const requestId = ++lyricRequestId
  lyricLoading.value = true
  lyricLoadFailed.value = false
  Object.assign(form, {
    id: row.id,
    title: row.title,
    singerId: row.singerId,
    categoryId: row.categoryId,
    album: row.album || '',
    duration: row.duration || 10,
    cover: row.cover || '',
    audioUrl: row.audioUrl || '',
    lyric: '',
    lyricTranslation: '',
    lyricRomaji: '',
    status: row.status ?? 1
  })
  // 编辑时单独拉取原歌词与译文，避免列表接口返回大段 LRC 正文。
  songApi.detail(row.id).then((detail) => {
    if (requestId !== lyricRequestId) return
    form.lyric = detail.lyric || ''
    form.lyricTranslation = detail.lyricTranslation || ''
    form.lyricRomaji = detail.lyricRomaji || ''
  }).catch(() => {
    if (requestId !== lyricRequestId) return
    lyricLoadFailed.value = true
    ElMessage.error('原歌词和译文加载失败，请关闭后重新打开以免覆盖已有内容')
  }).finally(() => {
    if (requestId === lyricRequestId) lyricLoading.value = false
  })
  dialogVisible.value = true
}

const onUploadAudio = async ({ file }) => {
  const res = await commonApi.upload(file)
  form.audioUrl = res.url
  if (!form.duration) {
    // 尝试读取音频时长
    const url = URL.createObjectURL(file)
    const audio = new Audio(url)
    audio.addEventListener('loadedmetadata', () => {
      form.duration = Math.round(audio.duration) || 10
      URL.revokeObjectURL(url)
    })
  }
  ElMessage.success('音频上传成功')
}

const onUploadCover = async ({ file }) => {
  const res = await commonApi.upload(file)
  form.cover = res.url
  ElMessage.success('封面上传成功')
}

const onUploadLyric = async ({ file }) => {
  const text = await file.text()
  form.lyric = text
  ElMessage.success('原歌词文件已读取，保存后生效')
}

const onUploadLyricRomaji = async ({ file }) => {
  const text = await file.text()
  form.lyricRomaji = text
  ElMessage.success('罗马音歌词文件已读取，保存后生效')
}

const onUploadLyricTranslation = async ({ file }) => {
  const text = await file.text()
  form.lyricTranslation = text
  ElMessage.success('译文歌词文件已读取，保存后生效')
}

const onSave = async () => {
  if (lyricLoading.value || lyricLoadFailed.value) return
  if (!form.title || !form.singerId || !form.categoryId || !form.audioUrl) {
    ElMessage.warning('请填写标题、歌手、分类与音频地址')
    return
  }
  saving.value = true
  try {
    await songApi.save({ ...form })
    ElMessage.success('保存成功')
    dialogVisible.value = false
    loadData()
  } finally {
    saving.value = false
  }
}

const onDelete = async (row) => {
  await ElMessageBox.confirm(`确定删除歌曲《${row.title}》吗？`, '提示', { type: 'warning' })
  await songApi.remove(row.id)
  ElMessage.success('删除成功')
  loadData()
}

onMounted(() => {
  loadData()
  loadOptions()
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
.lyric-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}
.pagination-wrap {
  display: flex;
  justify-content: center;
  padding: 14px 0 8px;
}
</style>
