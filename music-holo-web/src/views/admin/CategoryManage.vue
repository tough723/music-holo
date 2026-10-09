<template>
  <div class="page">
    <div class="page-head">
      <div>
        <div class="page-title">分类管理</div>
        <div class="page-subtitle">维护歌曲分类（分类下有歌曲时不可删除）</div>
      </div>
    </div>

    <div class="toolbar glass-panel">
      <div class="toolbar-right">
        <el-button type="primary" @click="openAdd">
          <el-icon><Plus /></el-icon> 新增分类
        </el-button>
      </div>
    </div>

    <div class="glass-panel table-panel">
      <el-table v-loading="loading" :data="list">
        <el-table-column label="ID" prop="id" width="90" />
        <el-table-column label="分类名称" prop="name" min-width="160" />
        <el-table-column label="排序" prop="sort" width="100" align="center" />
        <el-table-column label="歌曲数" width="100" align="center">
          <template #default="{ row }">{{ songCountOf(row.id) }}</template>
        </el-table-column>
        <el-table-column label="创建时间" prop="createTime" width="180" />
        <el-table-column label="操作" width="160" align="center" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" plain @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 新增 / 编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑分类' : '新增分类'" width="440px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="分类名称" required>
          <el-input v-model="form.name" placeholder="请输入分类名称" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" controls-position="right" />
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
import * as categoryApi from '@/api/category'
import * as songApi from '@/api/song'

const loading = ref(false)
const list = ref([])
const songCounts = ref({})

const dialogVisible = ref(false)
const saving = ref(false)
const form = reactive({ id: null, name: '', sort: 0 })

const songCountOf = (categoryId) => songCounts.value[categoryId] ?? 0

const loadData = async () => {
  loading.value = true
  try {
    list.value = (await categoryApi.list()) || []
    // 统计每个分类下的歌曲数量
    const res = await songApi.page({ pageNum: 1, pageSize: 500 })
    const counts = {}
    for (const song of res.records || []) {
      counts[song.categoryId] = (counts[song.categoryId] || 0) + 1
    }
    songCounts.value = counts
  } finally {
    loading.value = false
  }
}

const openAdd = () => {
  Object.assign(form, { id: null, name: '', sort: 0 })
  dialogVisible.value = true
}

const openEdit = (row) => {
  Object.assign(form, { id: row.id, name: row.name, sort: row.sort ?? 0 })
  dialogVisible.value = true
}

const onSave = async () => {
  if (!form.name) {
    ElMessage.warning('请输入分类名称')
    return
  }
  saving.value = true
  try {
    await categoryApi.save({ ...form })
    ElMessage.success('保存成功')
    dialogVisible.value = false
    loadData()
  } finally {
    saving.value = false
  }
}

const onDelete = async (row) => {
  await ElMessageBox.confirm(`确定删除分类「${row.name}」吗？`, '提示', { type: 'warning' })
  await categoryApi.remove(row.id)
  ElMessage.success('删除成功')
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
}
.toolbar-right {
  margin-left: auto;
  display: flex;
  gap: 10px;
}
.table-panel {
  padding: 6px 12px;
}
</style>
