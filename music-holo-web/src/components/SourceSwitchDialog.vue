<template>
  <el-dialog
    v-model="visible"
    :title="`快速换源 · ${song?.title || '当前曲目'}`"
    width="760px"
    :close-on-click-modal="false"
    @closed="onClosed"
  >
    <p class="switch-hint">
      会依次尝试本机自定义音源与平台公开直链；每个候选都会校验地址并发一次 Range 探针确认可取到音频字节。
      <template v-if="song?.singerName">当前曲目：{{ song.singerName }}</template>
    </p>

    <div class="switch-tools">
      <el-select v-model="quality" size="small" class="quality-select" :disabled="running">
        <el-option v-for="item in QUALITIES" :key="item" :label="item" :value="item" />
      </el-select>
      <el-input
        v-model="extraFields"
        type="textarea"
        :rows="2"
        placeholder="可选：平台专属曲目字段（JSON，例如 {"songmid":"xxx"}）"
        :disabled="running"
      />
    </div>

    <el-progress v-if="running" :percentage="progressPercent" :stroke-width="6" />
    <ul class="candidate-list">
      <li v-for="item in candidates" :key="item.key" class="candidate" :class="item.status">
        <div class="candidate-main">
          <strong>{{ item.label }}</strong>
          <small v-if="item.kind === 'custom-source'">自定义音源脚本</small>
          <small v-else-if="item.kind === 'platform'">平台公开直链</small>
          <small v-else>不换源</small>
        </div>
        <div class="candidate-state">
          <el-tag v-if="item.status === 'ok'" type="success" size="small" effect="plain">可用</el-tag>
          <el-tag v-else-if="item.status === 'failed'" type="danger" size="small" effect="plain">不可用</el-tag>
          <el-tag v-else type="info" size="small" effect="plain">等待中</el-tag>
        </div>
        <div class="candidate-detail">
          <span v-if="item.origin" class="candidate-origin">{{ item.origin }}</span>
          <span v-if="item.error" class="candidate-error">{{ item.error }}</span>
        </div>
        <div class="candidate-action">
          <el-button v-if="item.status === 'ok'" size="small" type="primary" round @click="applyCandidate(item)">
            用这个播放
          </el-button>
          <el-button v-if="item.status === 'ok' && item.url" size="small" plain round @click="downloadCandidate(item)">
            下载
          </el-button>
        </div>
      </li>
    </ul>
    <el-empty v-if="!candidates.length && !running" description="点击开始扫描可用音源" />

    <template #footer>
      <el-button round :disabled="running" @click="visible = false">关闭</el-button>
      <el-button type="primary" round :loading="running" @click="run">{{ candidates.length ? '重新扫描' : '开始扫描' }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { usePlayerStore } from '@/store/player'
import { useDownloadStore } from '@/store/downloads'
import { findAlternativeSources } from '@/utils/sourceSwitch'

const props = defineProps({ modelValue: { type: Boolean, default: false }, song: { type: Object, default: null } })
const emit = defineEmits(['update:modelValue'])

const playerStore = usePlayerStore()
const downloadStore = useDownloadStore()
const QUALITIES = ['128k', '320k', 'flac', 'flac24bit']
const quality = ref('320k')
const extraFields = ref('')
const running = ref(false)
const candidates = ref([])
const progress = ref({ index: 0, total: 0 })
let controller = null

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const progressPercent = computed(() => {
  const { index, total } = progress.value
  return total ? Math.round((index / total) * 100) : 0
})

async function run() {
  if (running.value || !props.song) return
  running.value = true
  candidates.value = []
  progress.value = { index: 0, total: 0 }
  controller = new AbortController()
  try {
    const result = await findAlternativeSources(props.song, {
      quality: quality.value,
      extraFields: extraFields.value,
      signal: controller.signal,
      onProgress: ({ index, total, candidate }) => {
        progress.value = { index, total }
        // 先占位，让用户看到正在尝试哪一项。
        if (!candidates.value.some((item) => item.key === candidate.key)) {
          candidates.value = [...candidates.value, { ...candidate, status: 'pending' }]
        }
      }
    })
    candidates.value = result.candidates
    if (!result.best) ElMessage.warning('没有找到可用音源；可补充平台曲目 ID 后重试')
  } catch (error) {
    ElMessage.warning(String(error?.message || error))
  } finally {
    running.value = false
  }
}

function applyCandidate(item) {
  const song = props.song
  if (!song || !item?.url) return
  const replaced = playerStore.applySourceToCurrent({
    audioUrl: item.desktopUrl || item.url,
    sourceName: item.sourceName || (item.kind === 'platform' ? '平台公开直链' : ''),
    sourcePlatform: item.platformName || item.platformKey || '',
    sourceQuality: item.quality || '',
    isCustomSource: true
  })
  if (!replaced) {
    // 当前曲目不在队列中：直接用新地址播放该曲目。
    playerStore.playSong({ ...song, audioUrl: item.desktopUrl || item.url, isCustomSource: true })
  }
  ElMessage.success(`已切换到：${item.label}`)
  visible.value = false
}

function downloadCandidate(item) {
  if (!item?.url) return
  const created = downloadStore.enqueue({
    song: props.song || {},
    url: item.url,
    quality: item.quality || quality.value,
    sourcePlatform: item.platformName || item.platformKey || '',
    sourceName: item.sourceName || ''
  })
  if (created.length) ElMessage.success('已加入下载队列')
  else ElMessage.warning(downloadStore.statusMessage || '无法加入下载队列')
}

function onClosed() {
  controller?.abort()
  controller = null
  candidates.value = []
}
</script>

<style scoped>
.switch-hint {
  margin: 0 0 12px;
  color: var(--text-sub);
  font-size: 13px;
  line-height: 1.6;
}
.switch-tools {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}
.quality-select {
  width: 160px;
}
.candidate-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
  max-height: 340px;
  overflow-y: auto;
}
.candidate {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 12px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--holo-primary) 18%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--holo-primary) 6%, transparent);
}
.candidate.failed {
  border-color: color-mix(in srgb, var(--el-color-danger) 30%, transparent);
  background: color-mix(in srgb, var(--el-color-danger) 6%, transparent);
}
.candidate.ok {
  border-color: color-mix(in srgb, var(--el-color-success) 40%, transparent);
}
.candidate-main {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.candidate-main small {
  color: var(--text-sub);
  font-size: 12px;
}
.candidate-detail {
  grid-column: 1 / 2;
  font-size: 12px;
  color: var(--text-sub);
  word-break: break-all;
}
.candidate-error {
  color: var(--el-color-danger);
}
.candidate-action {
  grid-row: 1 / 3;
  grid-column: 2 / 3;
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
