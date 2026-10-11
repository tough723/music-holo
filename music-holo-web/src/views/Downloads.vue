<template>
  <div class="page">
    <div class="page-head">
      <div>
        <div class="page-title">下载中心</div>
        <div class="page-subtitle">
          {{ store.isDesktop ? '桌面端流式落盘，支持断点续传与指定目录' : '网页版经浏览器另存为保存，目录由浏览器决定' }}
        </div>
      </div>
      <div class="page-tools">
        <el-button round :disabled="!store.stats.completed" @click="store.clearFinished()">
          <el-icon><Delete /></el-icon> 清除已结束
        </el-button>
      </div>
    </div>

    <div class="glass-panel download-config">
      <div class="config-row">
        <span class="config-label">保存目录</span>
        <el-input
          :model-value="store.directory"
          :placeholder="store.isDesktop ? '选择用于保存音频的目录' : '网页版由浏览器下载目录决定'"
          :disabled="!store.isDesktop"
          readonly
          class="config-input"
          @click="onPickDirectory"
        />
        <el-button :disabled="!store.isDesktop" round @click="onPickDirectory">
          <el-icon><FolderOpened /></el-icon> 选择目录
        </el-button>
      </div>
      <div class="config-row">
        <span class="config-label">命名模板</span>
        <el-select :model-value="store.template" class="config-input" @change="store.setTemplate($event)">
          <el-option v-for="item in TEMPLATES" :key="item" :label="item" :value="item" />
        </el-select>
        <span class="config-hint">可用占位符：{title} {artist} {album} {quality} {platform} {index} {year}</span>
      </div>
      <div class="config-row">
        <span class="config-label">同时下载</span>
        <el-select :model-value="store.concurrency" class="config-concurrency" @change="store.setConcurrency($event)">
          <el-option v-for="count in [1, 2, 3, 4]" :key="count" :label="`${count} 个`" :value="count" />
        </el-select>
        <span class="config-hint">
          进行中 {{ store.stats.downloading }} · 排队 {{ store.stats.queued }} · 已完成 {{ store.stats.completed }} · 失败 {{ store.stats.failed }}
        </span>
      </div>
      <div v-if="store.statusMessage" class="config-message">{{ store.statusMessage }}</div>
    </div>

    <div class="glass-panel download-panel">
      <el-table :data="rows" height="460px" empty-text="还没有下载任务：在歌曲列表或播放器中选择「下载」即可加入">
        <el-table-column label="曲目" min-width="220">
          <template #default="{ row }">
            <div class="song-cell">
              <Cover :src="row.song?.cover" :size="40" :alt="row.song?.title || '封面'" />
              <div class="song-meta">
                <strong>{{ row.song?.title || row.song?.name || row.fileName }}</strong>
                <small>{{ row.song?.singerName || row.song?.singer || '未知歌手' }}<span v-if="row.quality"> · {{ row.quality }}</span></small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="文件名" min-width="180" prop="fileName" show-overflow-tooltip />
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="stateType(row.state)" size="small" effect="plain">{{ stateLabel(row.state) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="进度" min-width="200">
          <template #default="{ row }">
            <el-progress
              :percentage="Number(row.progress.toFixed(1))"
              :status="row.state === 'completed' ? 'success' : row.state === 'failed' ? 'exception' : undefined"
              :stroke-width="8"
            />
            <small class="progress-text">
              {{ formatBytes(row.receivedBytes) }}<template v-if="row.totalBytes"> / {{ formatBytes(row.totalBytes) }}</template>
              <template v-if="row.speed && row.state === 'downloading'"> · {{ formatBytes(row.speed) }}/s<template v-if="row.etaSeconds"> · 剩余 {{ formatDuration(row.etaSeconds) }}</template></template>
            </small>
            <small v-if="row.error" class="progress-error">{{ row.error }}</small>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.state === 'downloading' || row.state === 'queued'" size="small" round @click="store.pause(row.id)">暂停</el-button>
            <el-button v-if="row.state === 'paused'" size="small" type="primary" round @click="store.resume(row.id)">继续</el-button>
            <el-button v-if="row.state === 'failed' || row.state === 'canceled'" size="small" type="warning" round @click="store.retry(row.id)">重试</el-button>
            <el-button v-if="!['completed'].includes(row.state)" size="small" type="danger" plain round @click="store.cancel(row.id)">取消</el-button>
            <el-button size="small" plain round @click="store.remove(row.id)">移除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount } from 'vue'
import { Delete, FolderOpened } from '@element-plus/icons-vue'
import Cover from '@/components/Cover.vue'
import { useDownloadStore } from '@/store/downloads'
import { formatBytes, formatDuration } from '@/utils/format'
import { DOWNLOAD_STATES } from '@/utils/downloadCenter'

const store = useDownloadStore()
const TEMPLATES = ['{artist} - {title}', '{title}', '{title} - {artist}', '{index}. {artist} - {title}', '{platform} - {artist} - {title}']

const rows = computed(() => [...store.tasks].sort((left, right) => right.order - left.order))

const STATE_LABELS = {
  [DOWNLOAD_STATES.QUEUED]: '排队中',
  [DOWNLOAD_STATES.DOWNLOADING]: '下载中',
  [DOWNLOAD_STATES.PAUSED]: '已暂停',
  [DOWNLOAD_STATES.COMPLETED]: '已完成',
  [DOWNLOAD_STATES.FAILED]: '失败',
  [DOWNLOAD_STATES.CANCELED]: '已取消'
}

function stateLabel(state) {
  return STATE_LABELS[state] || state
}

function stateType(state) {
  if (state === DOWNLOAD_STATES.COMPLETED) return 'success'
  if (state === DOWNLOAD_STATES.FAILED) return 'danger'
  if (state === DOWNLOAD_STATES.DOWNLOADING) return 'primary'
  if (state === DOWNLOAD_STATES.PAUSED || state === DOWNLOAD_STATES.CANCELED) return 'info'
  return 'warning'
}

async function onPickDirectory() {
  if (!store.isDesktop) return
  await store.pickDirectory()
}

onBeforeUnmount(() => {
  // 离开页面不中断下载：任务由下载中心继续在后台执行。
})
</script>

<style scoped>
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
.download-config {
  padding: 16px 18px;
  display: grid;
  gap: 12px;
  margin-bottom: 14px;
}
.config-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.config-label {
  width: 72px;
  color: var(--text-sub);
  font-size: 13px;
}
.config-input {
  flex: 1 1 260px;
  max-width: 420px;
}
.config-concurrency {
  width: 120px;
}
.config-hint {
  color: var(--text-sub);
  font-size: 12px;
}
.config-message {
  color: var(--holo-primary);
  font-size: 12px;
}
.download-panel {
  padding: 8px 12px;
}
.song-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.song-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.song-meta strong {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.song-meta small {
  color: var(--text-sub);
  font-size: 12px;
}
.progress-text {
  display: block;
  margin-top: 4px;
  color: var(--text-sub);
  font-size: 12px;
}
.progress-error {
  display: block;
  margin-top: 2px;
  color: var(--el-color-danger);
  font-size: 12px;
}
</style>
