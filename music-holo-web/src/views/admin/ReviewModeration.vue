<template>
  <div class="page review-admin">
    <div class="page-head">
      <div>
        <div class="page-title">短评审核</div>
        <div class="page-subtitle">管理员负责举报处理与内容可见性；作者删除的内容不可恢复。</div>
      </div>
      <el-tag type="warning" effect="plain">用户短评即时公开，举报后进入审核队列</el-tag>
    </div>

    <div class="moderation-note glass-panel">
      <el-icon><InfoFilled /></el-icon>
      <span>处理举报时选择“隐藏并解决”会隐藏短评，并将同一短评的待处理举报一并结案；“驳回举报”不会改变短评可见性。</span>
    </div>

    <div class="glass-panel moderation-panel">
      <el-tabs v-model="activeTab" @tab-change="onTabChange">
        <el-tab-pane label="举报队列" name="reports">
          <div class="toolbar">
            <el-select v-model="reportStatus" aria-label="举报处理状态" style="width: 170px" @change="loadReports">
              <el-option label="待处理" :value="0" />
              <el-option label="已隐藏并处理" :value="1" />
              <el-option label="已驳回" :value="2" />
            </el-select>
            <el-button @click="loadReports"><el-icon><Refresh /></el-icon>刷新</el-button>
            <span class="total-label">{{ reportTotal }} 条</span>
          </div>
          <el-table v-loading="reportsLoading" :data="reports" row-key="id" class="moderation-table">
            <el-table-column label="短评 / 对象" min-width="250">
              <template #default="{ row }">
                <div class="content-cell">
                  <strong>{{ row.targetType === 'song' ? '歌曲' : '歌单' }} · {{ row.targetTitle }}</strong>
                  <p>{{ row.reviewContent }}</p>
                  <small>作者：{{ row.authorName }}</small>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="举报信息" min-width="220">
              <template #default="{ row }">
                <div>{{ reasonLabel(row.reason) }} · {{ row.reporterName }}</div>
                <p v-if="row.details" class="secondary-text">{{ row.details }}</p>
              </template>
            </el-table-column>
            <el-table-column label="提交时间" prop="createTime" width="170" />
            <el-table-column label="处理结果" width="130">
              <template #default="{ row }">
                <el-tag :type="reportStatusType(row.status)" size="small" effect="plain">{{ reportStatusLabel(row.status) }}</el-tag>
                <p v-if="row.adminNote" class="secondary-text">{{ row.adminNote }}</p>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="190" fixed="right">
              <template #default="{ row }">
                <template v-if="row.status === 0">
                  <el-button size="small" type="danger" plain @click="handleReport(row, 'hide')">隐藏并解决</el-button>
                  <el-button size="small" plain @click="handleReport(row, 'dismiss')">驳回</el-button>
                </template>
                <span v-else class="secondary-text">{{ row.handlerName || '—' }}</span>
              </template>
            </el-table-column>
          </el-table>
          <div class="pagination-wrap">
            <el-pagination
              v-model:current-page="reportPageNum"
              v-model:page-size="pageSize"
              :total="reportTotal"
              :page-sizes="[10, 20, 50]"
              layout="total, sizes, prev, pager, next"
              background
              @current-change="loadReports"
              @size-change="loadReports"
            />
          </div>
        </el-tab-pane>

        <el-tab-pane label="短评管理" name="reviews">
          <div class="toolbar">
            <el-select v-model="reviewStatus" aria-label="短评显示状态" style="width: 180px" @change="loadReviews">
              <el-option label="全部（未删除）" value="all" />
              <el-option label="公开" :value="1" />
              <el-option label="已隐藏" :value="0" />
              <el-option label="作者已删除" :value="2" />
            </el-select>
            <el-select v-model="targetType" aria-label="短评对象类型" style="width: 150px" @change="loadReviews">
              <el-option label="全部对象" value="all" />
              <el-option label="歌曲短评" value="song" />
              <el-option label="歌单短评" value="playlist" />
            </el-select>
            <el-button @click="loadReviews"><el-icon><Refresh /></el-icon>刷新</el-button>
            <span class="total-label">{{ reviewTotal }} 条</span>
          </div>
          <el-table v-loading="reviewsLoading" :data="reviewRows" row-key="id" class="moderation-table">
            <el-table-column label="对象" min-width="190">
              <template #default="{ row }">
                {{ row.targetType === 'song' ? '歌曲' : '歌单' }} · {{ row.targetTitle }}
              </template>
            </el-table-column>
            <el-table-column label="短评内容" min-width="280" prop="content" show-overflow-tooltip />
            <el-table-column label="作者" prop="authorName" width="130" />
            <el-table-column label="点赞" prop="likeCount" width="80" align="center" />
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <el-tag :type="reviewStatusType(row.status)" size="small" effect="plain">{{ reviewStatusLabel(row.status) }}</el-tag>
                <p v-if="row.moderationNote" class="secondary-text">{{ row.moderationNote }}</p>
              </template>
            </el-table-column>
            <el-table-column label="发布时间" prop="createTime" width="170" />
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button v-if="row.status === 1" size="small" type="danger" plain @click="setVisibility(row, true)">隐藏</el-button>
                <el-button v-else-if="row.status === 0" size="small" type="primary" plain @click="setVisibility(row, false)">恢复公开</el-button>
                <span v-else class="secondary-text">—</span>
              </template>
            </el-table-column>
          </el-table>
          <div class="pagination-wrap">
            <el-pagination
              v-model:current-page="reviewPageNum"
              v-model:page-size="pageSize"
              :total="reviewTotal"
              :page-sizes="[10, 20, 50]"
              layout="total, sizes, prev, pager, next"
              background
              @current-change="loadReviews"
              @size-change="loadReviews"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as reviewApi from '@/api/review'

const activeTab = ref('reports')
const pageSize = ref(10)
const reportPageNum = ref(1)
const reportStatus = ref(0)
const reports = ref([])
const reportTotal = ref(0)
const reportsLoading = ref(false)
const reviewPageNum = ref(1)
const reviewStatus = ref('all')
const targetType = ref('all')
const reviewRows = ref([])
const reviewTotal = ref(0)
const reviewsLoading = ref(false)

const reasonLabel = (reason) => ({
  spam: '垃圾信息 / 广告',
  abuse: '辱骂 / 不当内容',
  copyright: '版权 / 侵权问题',
  other: '其他原因'
})[reason] || '其他原因'
const reportStatusLabel = (status) => ({ 0: '待处理', 1: '已隐藏并处理', 2: '已驳回' })[status] || '未知'
const reportStatusType = (status) => ({ 0: 'warning', 1: 'danger', 2: 'info' })[status] || 'info'
const reviewStatusLabel = (status) => ({ 0: '已隐藏', 1: '公开', 2: '作者已删除' })[status] || '未知'
const reviewStatusType = (status) => ({ 0: 'warning', 1: 'success', 2: 'info' })[status] || 'info'

async function loadReports() {
  reportsLoading.value = true
  try {
    const result = await reviewApi.adminReportsPage({
      pageNum: reportPageNum.value,
      pageSize: pageSize.value,
      status: reportStatus.value
    })
    reports.value = result?.records || []
    reportTotal.value = result?.total || 0
  } finally {
    reportsLoading.value = false
  }
}

async function loadReviews() {
  reviewsLoading.value = true
  try {
    const params = {
      pageNum: reviewPageNum.value,
      pageSize: pageSize.value,
      ...(reviewStatus.value === 'all' ? {} : { status: reviewStatus.value }),
      ...(targetType.value === 'all' ? {} : { targetType: targetType.value })
    }
    const result = await reviewApi.adminPage(params)
    reviewRows.value = result?.records || []
    reviewTotal.value = result?.total || 0
  } finally {
    reviewsLoading.value = false
  }
}

function onTabChange(tab) {
  if (tab === 'reports') loadReports()
  else loadReviews()
}

async function handleReport(report, action) {
  const message = action === 'hide'
    ? '将隐藏这条短评，并结案该短评的所有待处理举报。'
    : '将驳回该举报，短评保持当前可见状态。'
  try {
    await ElMessageBox.confirm(message, action === 'hide' ? '隐藏短评' : '驳回举报', { type: action === 'hide' ? 'warning' : 'info' })
    await reviewApi.handleReport(report.id, {
      action,
      note: action === 'hide' ? '经管理员审核，短评已隐藏' : '经管理员审核，未发现违规'
    })
    ElMessage.success(action === 'hide' ? '短评已隐藏，待处理举报已结案' : '举报已驳回')
    await loadReports()
  } catch {
    // 用户取消或请求失败；请求拦截器负责显示网络/业务错误。
  }
}

async function setVisibility(review, hidden) {
  try {
    await ElMessageBox.confirm(
      hidden ? '隐藏后仅作者与管理员可查看短评。' : '恢复后该短评会重新对所有访客公开。',
      hidden ? '隐藏短评' : '恢复短评',
      { type: hidden ? 'warning' : 'info' }
    )
    await reviewApi.setVisibility(review.id, hidden, hidden ? '经管理员审核，暂时隐藏' : '')
    ElMessage.success(hidden ? '短评已隐藏' : '短评已恢复公开')
    await loadReviews()
  } catch {
    // 用户取消或请求失败。
  }
}

onMounted(loadReports)
</script>

<style scoped>
.review-admin {
  gap: 16px;
}
.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}
.moderation-note {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 12px 16px;
  color: var(--text-sub);
  font-size: 12px;
  line-height: 1.6;
}
.moderation-note :deep(.el-icon) {
  color: var(--holo-primary);
  flex: 0 0 auto;
}
.moderation-panel {
  min-width: 0;
  padding: 14px 16px 8px;
  border-radius: 16px;
}
.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 4px 0 14px;
}
.total-label {
  margin-left: auto;
  color: var(--text-sub);
  font-size: 12px;
}
.moderation-table {
  width: 100%;
}
.content-cell strong {
  display: block;
  margin-bottom: 5px;
  color: var(--text-main);
}
.content-cell p,
.secondary-text {
  margin: 4px 0;
  color: var(--text-sub);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.content-cell small {
  color: var(--text-sub);
}
.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  padding: 16px 0 8px;
}
@media (max-width: 680px) {
  .page-head {
    align-items: flex-start;
    flex-direction: column;
  }
  .moderation-panel {
    padding: 10px 8px;
  }
  .pagination-wrap {
    justify-content: center;
  }
}
</style>
