<template>
  <section class="search-settings" aria-label="搜索与隐私设置">
    <article class="search-setting-card glass-panel">
      <div class="setting-heading">
        <div class="setting-symbol"><el-icon><Search /></el-icon></div>
        <div class="setting-copy">
          <h2>搜索体验</h2>
          <p>管理搜索首页的探索提示与最近搜索记录。</p>
        </div>
      </div>

      <div class="setting-row">
        <div>
          <strong>显示探索关键词</strong>
          <small>在未输入查询时展示 Music Holo 提供的静态灵感词。</small>
        </div>
        <el-switch
          :model-value="preferences.showSearchSuggestions"
          aria-label="显示探索关键词"
          @change="preferences.setShowSearchSuggestions"
        />
      </div>

      <div class="setting-row history-row">
        <div>
          <strong>记住最近搜索</strong>
          <small>最近搜索最多保存在本机浏览器 {{ preferences.searchHistoryLimit }} 条；关闭时立即清除已有记录。</small>
        </div>
        <el-switch
          :model-value="preferences.rememberSearchHistory"
          aria-label="记住最近搜索"
          @change="preferences.setRememberSearchHistory"
        />
      </div>

      <div v-if="preferences.rememberSearchHistory" class="history-tools">
        <label class="history-limit">
          <span>保留条数</span>
          <el-select
            :model-value="preferences.searchHistoryLimit"
            aria-label="最近搜索保留条数"
            @change="preferences.setSearchHistoryLimit"
          >
            <el-option v-for="limit in SEARCH_HISTORY_LIMITS" :key="limit" :label="`${limit} 条`" :value="limit" />
          </el-select>
        </label>
        <div class="history-count" role="status">本机已有 {{ recentCount }} 条</div>
        <el-button text type="danger" :disabled="recentCount === 0" @click="clearHistory">清空搜索记录</el-button>
      </div>
    </article>

    <article class="privacy-note glass-panel">
      <div class="setting-symbol"><el-icon><Lock /></el-icon></div>
      <div class="setting-copy">
        <h2>本机隐私说明</h2>
        <p>搜索记录仅在当前浏览器本机保存，不会随设置备份导出，也不会上传到 Music Holo 服务器。搜索请求仍会把你提交的关键词发送给当前 Music Holo 服务以返回结果。</p>
      </div>
    </article>
  </section>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  RECENT_SEARCH_STORAGE_KEY,
  SEARCH_HISTORY_LIMITS,
  usePreferencesStore
} from '@/store/preferences'

const preferences = usePreferencesStore()
const recentCount = ref(0)

function readRecentCount() {
  if (!preferences.rememberSearchHistory) {
    recentCount.value = 0
    return
  }
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_SEARCH_STORAGE_KEY) || '[]')
    recentCount.value = Array.isArray(stored)
      ? [...new Set(stored.filter((term) => typeof term === 'string').map((term) => term.trim()).filter(Boolean))]
        .slice(0, preferences.searchHistoryLimit).length
      : 0
  } catch {
    recentCount.value = 0
  }
}

function clearHistory() {
  preferences.clearSearchHistory()
  recentCount.value = 0
  ElMessage.success('本机搜索记录已清空')
}

watch(
  () => [preferences.rememberSearchHistory, preferences.searchHistoryLimit],
  readRecentCount
)
onMounted(readRecentCount)
</script>

<style scoped>
.search-settings { display: grid; gap: 14px; min-width: 0; }
.search-setting-card, .privacy-note { min-width: 0; padding: 20px; }
.setting-heading, .privacy-note { display: flex; align-items: flex-start; gap: 12px; }
.setting-symbol { display: grid; place-items: center; flex: 0 0 36px; width: 36px; height: 36px; border: 1px solid color-mix(in srgb, var(--holo-primary) 28%, var(--border-color)); border-radius: 11px; color: var(--holo-primary); background: color-mix(in srgb, var(--holo-primary) 9%, transparent); }
.setting-copy { min-width: 0; flex: 1; }
.setting-copy h2 { color: var(--text-main); font-size: 14px; font-weight: 700; }
.setting-copy p { margin-top: 5px; color: var(--text-sub); font-size: 12px; line-height: 1.7; }
.setting-row { display: flex; justify-content: space-between; align-items: center; gap: 18px; margin: 16px 0 0 48px; padding-top: 14px; border-top: 1px solid var(--border-color); }
.setting-row > div { display: grid; gap: 5px; }
.setting-row strong { font-size: 12px; }
.setting-row small { color: var(--text-sub); font-size: 10px; line-height: 1.6; }
.history-tools { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin: 14px 0 0 48px; }
.history-limit { display: flex; align-items: center; gap: 8px; color: var(--text-sub); font-size: 11px; }
.history-limit :deep(.el-select) { width: 100px; }
.history-count { color: var(--text-sub); font-size: 11px; }
.privacy-note { border-color: color-mix(in srgb, var(--holo-primary) 22%, var(--border-color)); background: color-mix(in srgb, var(--holo-primary) 4%, var(--bg-panel)); }
@media (max-width: 680px) {
  .search-setting-card, .privacy-note { padding: 16px; }
  .setting-row, .history-tools { margin-left: 0; }
  .privacy-note { flex-wrap: wrap; }
  .privacy-note .setting-copy { flex-basis: calc(100% - 50px); }
}
</style>
