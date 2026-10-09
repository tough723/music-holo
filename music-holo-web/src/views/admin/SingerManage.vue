<template>
  <div class="page">
    <div class="page-head">
      <div>
        <div class="page-title">歌手管理</div>
        <div class="page-subtitle">维护歌手资料，支持 CSV 导入导出</div>
      </div>
    </div>

    <div class="toolbar glass-panel">
      <el-input
        v-model="keyword"
        placeholder="搜索歌手名称"
        clearable
        style="width: 220px"
        :prefix-icon="Search"
        @clear="loadData"
        @keyup.enter="loadData"
      />
      <el-select v-model="gender" placeholder="性别" clearable style="width: 110px" @change="loadData">
        <el-option label="男" :value="1" />
        <el-option label="女" :value="2" />
      </el-select>
      <el-button type="primary" @click="loadData">
        <el-icon><Search /></el-icon> 搜索
      </el-button>
      <div class="toolbar-right">
        <el-button type="primary" @click="openAdd">
          <el-icon><Plus /></el-icon> 新增歌手
        </el-button>
        <el-button @click="onExport">
          <el-icon><Download /></el-icon> 导出 CSV
        </el-button>
        <el-button @click="onDownloadTemplate">
          <el-icon><Document /></el-icon> 下载模板
        </el-button>
        <el-upload
          :show-file-list="false"
          :http-request="onImport"
          accept=".csv"
        >
          <el-button>
            <el-icon><Upload /></el-icon> 导入 CSV
          </el-button>
        </el-upload>
      </div>
    </div>

    <div class="glass-panel table-panel">
      <el-table v-loading="loading" :data="list">
        <el-table-column label="ID" prop="id" width="80" />
        <el-table-column label="头像" width="80" align="center">
          <template #default="{ row }">
            <div class="cell-avatar"><Cover :src="row.avatar" :text="row.name" :size="40" /></div>
          </template>
        </el-table-column>
        <el-table-column label="名称" prop="name" min-width="120" />
        <el-table-column label="性别" width="80" align="center">
          <template #default="{ row }">{{ genderText(row.gender) }}</template>
        </el-table-column>
        <el-table-column label="地区" prop="region" width="100" />
        <el-table-column label="歌曲数" prop="songCount" width="90" align="center" />
        <el-table-column label="排序" prop="sort" width="80" align="center" />
        <el-table-column label="简介" prop="intro" min-width="200" show-overflow-tooltip />
        <el-table-column label="操作" width="150" align="center" fixed="right">
          <template #default="{ row }">
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
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑歌手' : '新增歌手'" width="520px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="请输入歌手名称" />
        </el-form-item>
        <el-form-item label="性别">
          <el-radio-group v-model="form.gender">
            <el-radio :value="0">保密</el-radio>
            <el-radio :value="1">男</el-radio>
            <el-radio :value="2">女</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="地区">
          <el-input v-model="form.region" placeholder="如：内地 / 港台 / 欧美 / 日韩" />
        </el-form-item>
        <el-form-item label="头像">
          <div class="upload-row">
            <el-input v-model="form.avatar" placeholder="头像地址（可上传）" clearable />
            <el-upload :show-file-list="false" :http-request="onUploadAvatar" accept="image/*">
              <el-button>上传</el-button>
            </el-upload>
          </div>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" controls-position="right" />
        </el-form-item>
        <el-form-item label="简介">
          <el-input v-model="form.intro" type="textarea" :rows="3" placeholder="介绍一下这位歌手" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as singerApi from '@/api/singer'
import * as commonApi from '@/api/common'
import Cover from '@/components/Cover.vue'

const loading = ref(false)
const list = ref([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const keyword = ref('')
const gender = ref(null)

const dialogVisible = ref(false)
const saving = ref(false)
const form = reactive({ id: null, name: '', gender: 0, region: '', intro: '', avatar: '', sort: 0 })

const genderText = (g) => ({ 0: '保密', 1: '男', 2: '女' })[g] || '保密'

const loadData = async () => {
  loading.value = true
  try {
    const res = await singerApi.page({
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      keyword: keyword.value || undefined,
      gender: gender.value ?? undefined
    })
    list.value = res.records || []
    total.value = res.total || 0
  } finally {
    loading.value = false
  }
}

const openAdd = () => {
  Object.assign(form, { id: null, name: '', gender: 0, region: '', intro: '', avatar: '', sort: 0 })
  dialogVisible.value = true
}

const openEdit = (row) => {
  Object.assign(form, {
    id: row.id,
    name: row.name,
    gender: row.gender ?? 0,
    region: row.region || '',
    intro: row.intro || '',
    avatar: row.avatar || '',
    sort: row.sort ?? 0
  })
  dialogVisible.value = true
}

const onUploadAvatar = async ({ file }) => {
  const res = await commonApi.upload(file)
  form.avatar = res.url
  ElMessage.success('头像上传成功')
}

const onSave = async () => {
  if (!form.name) {
    ElMessage.warning('请输入歌手名称')
    return
  }
  saving.value = true
  try {
    await singerApi.save({ ...form })
    ElMessage.success('保存成功')
    dialogVisible.value = false
    loadData()
  } finally {
    saving.value = false
  }
}

const onDelete = async (row) => {
  await ElMessageBox.confirm(`确定删除歌手「${row.name}」吗？`, '提示', { type: 'warning' })
  await singerApi.remove(row.id)
  ElMessage.success('删除成功')
  loadData()
}

const onExport = () => {
  singerApi.exportCsv()
}

const onDownloadTemplate = () => {
  singerApi.downloadTemplate()
}

const onImport = async ({ file }) => {
  try {
    const count = await singerApi.importCsv(file)
    ElMessage.success(`导入成功，共 ${count} 条数据`)
    loadData()
  } catch (e) { /* 拦截器已提示 */ }
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
.cell-avatar {
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
</style>
