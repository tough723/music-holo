<template>
  <section class="review-panel glass-panel" aria-label="歌曲与歌单短评">
    <div class="review-heading">
      <div>
        <div class="section-title">听众短评 <span v-if="!loading && !loadError" class="review-total">{{ total }}</span></div>
        <div class="review-subtitle">分享听感与发现，保持友善；被举报内容由管理员审核。</div>
      </div>
      <el-button v-if="!userStore.isLogin" size="small" type="primary" plain @click="goLogin">
        登录后参与
      </el-button>
    </div>

    <form v-if="userStore.isLogin" class="review-composer" @submit.prevent="publish">
      <el-input
        v-model="content"
        type="textarea"
        :rows="3"
        maxlength="500"
        show-word-limit
        resize="vertical"
        :aria-label="`为${targetTitle || '当前内容'}写短评`"
        placeholder="说说这首歌/这张歌单打动你的地方……（最多 500 字）"
      />
      <div class="composer-footer">
        <span>每分钟最多发布 3 条；短评公开展示，可被举报。</span>
        <el-button type="primary" native-type="submit" :loading="publishing" :disabled="!content.trim()">
          发布短评
        </el-button>
      </div>
    </form>

    <div v-if="loading" class="review-loading" role="status">正在加载短评…</div>
    <div v-else-if="loadError" class="review-load-error" role="alert">
      <span>短评暂时无法加载；这不代表当前没有短评，请检查网络后重试。</span>
      <el-button text type="primary" @click="loadReviews">重试</el-button>
    </div>
    <el-empty v-else-if="reviews.length === 0" description="还没有短评，来分享你的第一感受。" :image-size="76" />
    <div v-else class="review-list" aria-live="polite">
      <article v-for="review in reviews" :key="review.id" class="review-card" :data-review-id="review.id">
        <div class="review-avatar" aria-hidden="true">{{ (review.authorName || '听').slice(0, 1) }}</div>
        <div class="review-body">
          <div class="review-meta">
            <strong>{{ review.authorName || '音乐听众' }}</strong>
            <el-tag v-if="review.mine" size="small" effect="plain">我</el-tag>
            <el-tag v-if="review.status === 0" size="small" type="warning" effect="plain">审核隐藏</el-tag>
            <time>{{ fmtDateTime(review.createTime) }}</time>
          </div>
          <p class="review-content">{{ review.content }}</p>
          <p v-if="review.mine && review.status === 0 && review.moderationNote" class="moderation-note">
            管理说明：{{ review.moderationNote }}
          </p>
          <div class="review-actions">
            <el-button
              v-if="review.status === 1"
              text
              size="small"
              :type="review.liked ? 'primary' : 'default'"
              :aria-label="review.liked ? '取消点赞' : '点赞短评'"
              @click="toggleLike(review)"
            >
              <el-icon><StarFilled v-if="review.liked" /><Star v-else /></el-icon>
              {{ review.likeCount || 0 }}
            </el-button>
            <el-button v-if="review.mine && review.status !== 2" text size="small" type="danger" @click="removeReview(review)">
              删除
            </el-button>
            <el-button v-else-if="review.status === 1" text size="small" @click="openReport(review)">
              举报
            </el-button>
          </div>
        </div>
      </article>
    </div>

    <div v-if="total > pageSize" class="review-pagination">
      <el-pagination
        v-model:current-page="pageNum"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next"
        background
        @current-change="loadReviews"
      />
    </div>

    <el-dialog v-model="reportVisible" title="举报短评" width="440px" append-to-body>
      <p class="report-intro">举报「{{ reportingReview?.authorName }}」的短评，由管理员审核；请勿滥用举报功能。</p>
      <el-form label-position="top">
        <el-form-item label="举报原因">
          <el-select v-model="reportForm.reason" class="report-field">
            <el-option label="垃圾信息 / 广告" value="spam" />
            <el-option label="辱骂 / 不当内容" value="abuse" />
            <el-option label="版权或侵权问题" value="copyright" />
            <el-option label="其他原因" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="补充说明（选填）">
          <el-input v-model="reportForm.details" type="textarea" :rows="3" maxlength="300" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reportVisible = false">取消</el-button>
        <el-button type="danger" :loading="reporting" @click="submitReport">提交举报</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '@/store/user'
import * as reviewApi from '@/api/review'
import { fmtDateTime } from '@/utils/format'

const props = defineProps({
  targetType: { type: String, required: true, validator: (value) => ['song', 'playlist'].includes(value) },
  targetId: { type: [String, Number], required: true },
  targetTitle: { type: String, default: '' }
})

const userStore = useUserStore()
const route = useRoute()
const router = useRouter()
const pageSize = 8
const pageNum = ref(1)
const reviews = ref([])
const total = ref(0)
const loading = ref(false)
const loadError = ref(false)
let latestReviewRequest = 0
const publishing = ref(false)
const content = ref('')
const reportVisible = ref(false)
const reportingReview = ref(null)
const reporting = ref(false)
const reportForm = ref({ reason: 'spam', details: '' })

const validTarget = computed(() => Number(props.targetId) > 0)

async function loadReviews() {
  const requestId = ++latestReviewRequest
  if (!validTarget.value) {
    reviews.value = []
    total.value = 0
    loadError.value = false
    loading.value = false
    return
  }
  loading.value = true
  loadError.value = false
  try {
    const result = await reviewApi.page({
      targetType: props.targetType,
      targetId: props.targetId,
      pageNum: pageNum.value,
      pageSize
    })
    if (requestId !== latestReviewRequest) return
    reviews.value = result?.records || []
    total.value = result?.total || 0
  } catch {
    if (requestId !== latestReviewRequest) return
    reviews.value = []
    total.value = 0
    loadError.value = true
  } finally {
    if (requestId === latestReviewRequest) loading.value = false
  }
}

function goLogin() {
  router.push({ path: '/login', query: { redirect: route.fullPath } })
}

async function publish() {
  const text = content.value.trim()
  if (!text || publishing.value) return
  publishing.value = true
  try {
    await reviewApi.create({ targetType: props.targetType, targetId: Number(props.targetId), content: text })
    content.value = ''
    pageNum.value = 1
    ElMessage.success('短评已发布')
    await loadReviews()
  } catch {
    // 统一请求拦截器已显示后端校验或频率限制说明。
  } finally {
    publishing.value = false
  }
}

async function toggleLike(review) {
  if (!userStore.isLogin) {
    goLogin()
    return
  }
  try {
    const result = await reviewApi.setLiked(review.id, !review.liked)
    review.liked = result?.liked ?? !review.liked
    review.likeCount = result?.likeCount ?? review.likeCount
  } catch {
    // 统一请求拦截器已提示。
  }
}

async function removeReview(review) {
  try {
    await ElMessageBox.confirm('删除后短评不会再公开显示，举报审核记录会保留。确定继续吗？', '删除短评', { type: 'warning' })
    await reviewApi.remove(review.id)
    ElMessage.success('短评已删除')
    await loadReviews()
  } catch {
    // 用户取消或请求错误；请求错误已由拦截器提示。
  }
}

function openReport(review) {
  if (!userStore.isLogin) {
    goLogin()
    return
  }
  reportingReview.value = review
  reportForm.value = { reason: 'spam', details: '' }
  reportVisible.value = true
}

async function submitReport() {
  if (!reportingReview.value || reporting.value) return
  reporting.value = true
  try {
    await reviewApi.report(reportingReview.value.id, reportForm.value)
    reportVisible.value = false
    ElMessage.success('举报已提交，管理员会尽快审核')
  } catch {
    // 统一请求拦截器已提示。
  } finally {
    reporting.value = false
  }
}

watch(() => [props.targetType, props.targetId], () => {
  pageNum.value = 1
  loadReviews()
})

onMounted(loadReviews)
</script>

<style scoped>
.review-panel {
  padding: 22px 24px;
  border-radius: 16px;
}
.review-heading,
.composer-footer,
.review-meta,
.review-actions {
  display: flex;
  align-items: center;
}
.review-heading {
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 16px;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 700;
}
.review-total {
  color: var(--holo-primary);
  font-size: 13px;
  font-weight: 600;
}
.review-subtitle,
.composer-footer > span {
  margin-top: 5px;
  color: var(--text-sub);
  font-size: 12px;
  line-height: 1.6;
}
.review-composer {
  padding: 14px;
  margin-bottom: 16px;
  border: 1px solid color-mix(in srgb, var(--holo-primary) 22%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--holo-primary) 4%, rgba(10, 17, 38, 0.55));
}
.composer-footer {
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
}
.review-list {
  display: grid;
  gap: 10px;
}
.review-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 1px solid rgba(180, 207, 255, 0.1);
  border-radius: 12px;
  background: rgba(8, 15, 34, 0.4);
}
.review-avatar {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  display: grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--holo-primary) 50%, transparent);
  border-radius: 50%;
  color: var(--holo-primary);
  background: radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--holo-primary) 22%, transparent), rgba(9, 16, 35, 0.8));
  box-shadow: 0 0 14px color-mix(in srgb, var(--holo-primary) 18%, transparent);
  font-weight: 700;
}
.review-body {
  min-width: 0;
  flex: 1;
}
.review-meta {
  flex-wrap: wrap;
  gap: 7px;
  min-height: 22px;
  font-size: 12px;
}
.review-meta strong {
  font-size: 13px;
}
.review-meta time {
  margin-left: auto;
  color: var(--text-sub);
  font-size: 11px;
}
.review-content {
  margin: 8px 0;
  color: var(--text-main);
  font-size: 14px;
  line-height: 1.7;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.moderation-note {
  margin: 0 0 6px;
  color: var(--el-color-warning);
  font-size: 12px;
}
.review-actions {
  gap: 4px;
  margin-left: -8px;
}
.review-loading {
  padding: 26px 0;
  color: var(--text-sub);
  text-align: center;
}
.review-load-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--el-color-danger) 32%, var(--border-color));
  border-radius: 10px;
  color: var(--text-sub);
  font-size: 12px;
  line-height: 1.6;
}
.review-pagination {
  display: flex;
  justify-content: center;
  margin-top: 14px;
}
.report-intro {
  margin-top: 0;
  color: var(--text-sub);
  font-size: 13px;
  line-height: 1.7;
}
.report-field {
  width: 100%;
}
@media (max-width: 600px) {
  .review-panel {
    padding: 16px 14px;
  }
  .composer-footer {
    align-items: flex-start;
    flex-direction: column;
  }
  .review-meta time {
    width: 100%;
    margin-left: 0;
  }
}
</style>
