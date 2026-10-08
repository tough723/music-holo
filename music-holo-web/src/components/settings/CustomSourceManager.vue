<template>
  <section class="source-manager">
    <div class="source-manager-head glass-panel">
      <div class="source-manager-copy">
        <div class="source-eyebrow">LOCAL SOURCE LIBRARY</div>
        <h2>自定义音源</h2>
        <p>导入并整理个人音源脚本，按当前账号保存在本机浏览器中。</p>
      </div>
      <div class="source-manager-actions">
        <input
          ref="fileInput"
          class="source-file-input"
          type="file"
          accept=".js,.mjs,text/javascript,application/javascript"
          aria-label="选择音源脚本文件"
          data-testid="custom-source-file"
          @change="onFileSelected"
        >
        <input
          ref="backupInput"
          class="source-file-input"
          type="file"
          accept=".json,application/json"
          aria-label="选择音源备份文件"
          data-testid="custom-source-backup-file"
          @change="onBackupFileSelected"
        >
        <el-button type="primary" :loading="importing" @click="openFilePicker">
          <el-icon><Upload /></el-icon>
          导入 .js 音源
        </el-button>
      </div>
    </div>

    <div class="source-url-import glass-panel">
      <el-input v-model="sourceUrl" clearable placeholder="粘贴 HTTPS 音源脚本地址" aria-label="音源脚本地址" @keyup.enter="importFromUrl" />
      <el-button :loading="importingUrl" :disabled="!sourceUrl.trim()" @click="importFromUrl">从 URL 导入</el-button>
      <small>跨域不可读时，请在浏览器下载脚本后使用文件导入。</small>
    </div>

    <el-alert class="source-safety-alert" type="warning" :closable="false" show-icon>
      <template #title>脚本执行尚未开放</template>
      <template #default>
        当前版本支持导入、识别信息、重命名、排序、查看、导出与删除；不会运行导入脚本，也不会将其接入歌曲搜索或播放。兼容运行时需先完成隔离沙箱与安全审计。
      </template>
    </el-alert>

    <div class="source-library-toolbar">
      <div>
        <strong>本机音源库</strong>
        <span>{{ sources.length }} / {{ MAX_CUSTOM_SOURCES }} 个脚本</span>
      </div>
      <div class="source-backup-actions">
        <el-button text @click="openBackupPicker">
          <el-icon><Upload /></el-icon>
          导入备份
        </el-button>
        <el-button text :disabled="sources.length === 0" @click="exportAllSources">
          <el-icon><Download /></el-icon>
          导出备份
        </el-button>
      </div>
    </div>

    <div v-if="sources.length === 0" class="source-empty glass-panel">
      <div class="source-empty-icon"><el-icon><FolderAdd /></el-icon></div>
      <strong>还没有导入自定义音源</strong>
      <span>选择本地 .js / .mjs 文件后，它会保存在本设备，不会上传。</span>
      <el-button type="primary" plain @click="openFilePicker">选择音源文件</el-button>
    </div>

    <div v-else class="source-list" aria-label="自定义音源列表">
      <article v-for="(source, index) in sources" :key="source.id" class="source-card glass-panel" :data-source-id="source.id">
        <div class="source-card-top">
          <div class="source-rank" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</div>
          <div class="source-info">
            <div class="source-title-row">
              <h3>{{ source.name }}</h3>
              <el-tag size="small" effect="plain">v{{ source.version }}</el-tag>
              <el-tag size="small" type="info" effect="plain">已导入 · 未执行</el-tag>
            </div>
            <p v-if="source.description" class="source-description">{{ source.description }}</p>
            <p v-else class="source-description source-filename">{{ source.fileName }}</p>
            <div class="source-meta">
              <span>{{ formatSourceSize(source.sizeBytes) }}</span>
              <span>指纹 {{ source.hash }}</span>
              <span>导入于 {{ formatDate(source.importedAt) }}</span>
            </div>
          </div>
        </div>

        <div class="source-card-footer">
          <div class="source-order-actions">
            <el-button text size="small" :disabled="index === 0" :aria-label="`上移 ${source.name}`" @click="moveSource(index, -1)">上移</el-button>
            <el-button text size="small" :disabled="index === sources.length - 1" :aria-label="`下移 ${source.name}`" @click="moveSource(index, 1)">下移</el-button>
          </div>
          <div class="source-file-actions">
            <el-button text size="small" @click="renameSource(source)">重命名</el-button>
            <el-button text size="small" @click="toggleSourceCode(source.id)">{{ expandedSourceId === source.id ? '收起代码' : '查看代码' }}</el-button>
            <el-button text size="small" @click="exportSource(source)">导出</el-button>
            <el-popconfirm
              title="删除后将从本机音源库移除该脚本。"
              confirm-button-text="删除"
              cancel-button-text="取消"
              @confirm="removeSource(source.id)"
            >
              <template #reference>
                <el-button text type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </div>
        </div>

        <el-input
          v-if="expandedSourceId === source.id"
          class="source-code-view"
          type="textarea"
          :rows="12"
          :model-value="source.script"
          readonly
          resize="vertical"
          :aria-label="`${source.name} 源码，只读`"
        />
      </article>
    </div>

    <div class="source-footnote"><el-icon><Lock /></el-icon>脚本内容只保存在本机浏览器存储中；不会上传到 Music Holo 服务器。</div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '@/store/user'
import {
  CUSTOM_SOURCE_STORAGE_KEY,
  MAX_CUSTOM_SOURCE_BYTES,
  MAX_CUSTOM_SOURCES,
  formatSourceSize,
  parseCustomSourceFile,
  parseCustomSourceUrl,
  readCustomSources,
  sourceFileNameFromUrl,
  writeCustomSources
} from '@/utils/customSources'

const userStore = useUserStore()
const fileInput = ref(null)
const backupInput = ref(null)
const sourceUrl = ref('')
const importing = ref(false)
const importingUrl = ref(false)
const expandedSourceId = ref('')
const sourceOwner = computed(() => userStore.userInfo?.id ?? userStore.userInfo?.username ?? 'local')
const storageKey = computed(() => `${CUSTOM_SOURCE_STORAGE_KEY}:${String(sourceOwner.value).replace(/[^a-zA-Z0-9._-]/g, '_')}`)
const sources = ref(readCustomSources(localStorage, storageKey.value))

watch(storageKey, (key) => {
  sources.value = readCustomSources(localStorage, key)
  expandedSourceId.value = ''
})

function persist(nextSources) {
  if (!writeCustomSources(nextSources, localStorage, storageKey.value)) {
    ElMessage.error('本机存储空间不足或音源数据无效，请先导出备份或删除不需要的脚本')
    return false
  }
  sources.value = nextSources
  return true
}

function openFilePicker() {
  fileInput.value?.click()
}

function openBackupPicker() {
  backupInput.value?.click()
}

function addSource(fileName, script) {
  const source = parseCustomSourceFile(fileName, script)
  if (sources.value.some((item) => item.script === source.script)) {
    ElMessage.info('这个音源脚本已经导入')
    return false
  }
  if (sources.value.length >= MAX_CUSTOM_SOURCES) {
    ElMessage.warning(`最多保存 ${MAX_CUSTOM_SOURCES} 个音源，请先删除不需要的脚本`)
    return false
  }
  if (persist([source, ...sources.value])) {
    ElMessage.success(`已导入「${source.name}」，脚本不会被执行`)
    return true
  }
  return false
}

async function onFileSelected(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (file.size > MAX_CUSTOM_SOURCE_BYTES) {
    ElMessage.warning('单个音源文件不能超过 128 KB')
    return
  }

  importing.value = true
  try {
    addSource(file.name, await file.text())
  } catch (error) {
    ElMessage.warning(error?.message || '音源文件读取失败')
  } finally {
    importing.value = false
  }
}

async function onBackupFileSelected(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (file.size > 8 * 1024 * 1024) {
    ElMessage.warning('备份文件不能超过 8 MB')
    return
  }

  importing.value = true
  try {
    const backup = JSON.parse(await file.text())
    if (backup?.format !== 'music-holo-local-source-backup' || backup?.version !== 1 || !Array.isArray(backup.sources)) {
      throw new Error('备份格式不兼容')
    }
    if (backup.sources.length > MAX_CUSTOM_SOURCES) throw new Error(`备份中最多只能包含 ${MAX_CUSTOM_SOURCES} 个音源`)

    const imported = []
    for (const item of backup.sources) {
      const source = parseCustomSourceFile(item?.fileName, item?.script, item?.importedAt || new Date().toISOString())
      source.name = String(item?.name || source.name).trim().slice(0, 80) || source.name
      source.description = String(item?.description || source.description).slice(0, 180)
      if (!sources.value.some((existing) => existing.script === source.script) &&
          !imported.some((existing) => existing.script === source.script)) imported.push(source)
    }
    if (!imported.length) {
      ElMessage.info('备份中的音源已全部存在')
      return
    }
    if (sources.value.length + imported.length > MAX_CUSTOM_SOURCES) {
      throw new Error(`导入后会超过 ${MAX_CUSTOM_SOURCES} 个音源上限，请先删除部分脚本`)
    }
    if (persist([...imported, ...sources.value])) ElMessage.success(`已恢复 ${imported.length} 个音源，脚本不会被执行`)
  } catch (error) {
    ElMessage.warning(error?.message || '音源备份读取失败')
  } finally {
    importing.value = false
  }
}

async function readResponseTextLimited(response) {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CUSTOM_SOURCE_BYTES) {
    throw new Error('远程音源文件不能超过 128 KB')
  }
  if (!response.body?.getReader) {
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > MAX_CUSTOM_SOURCE_BYTES) throw new Error('远程音源文件不能超过 128 KB')
    return text
  }

  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_CUSTOM_SOURCE_BYTES) {
      await reader.cancel()
      throw new Error('远程音源文件不能超过 128 KB')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

async function importFromUrl() {
  let url
  try {
    url = parseCustomSourceUrl(sourceUrl.value)
  } catch (error) {
    ElMessage.warning(error?.message || '音源地址无效')
    return
  }

  importingUrl.value = true
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(url.href, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: controller.signal
    })
    if (!response.ok) throw new Error(`音源服务器返回 HTTP ${response.status}`)
    const script = await readResponseTextLimited(response)
    if (addSource(sourceFileNameFromUrl(url), script)) sourceUrl.value = ''
  } catch (error) {
    ElMessage.warning(error?.message?.includes('128 KB')
      ? error.message
      : '远程导入失败：源站可能不支持跨域读取，请下载 .js 文件后再导入')
  } finally {
    window.clearTimeout(timeoutId)
    importingUrl.value = false
  }
}

function moveSource(index, offset) {
  const destination = index + offset
  if (destination < 0 || destination >= sources.value.length) return
  const reordered = [...sources.value]
  const [source] = reordered.splice(index, 1)
  reordered.splice(destination, 0, source)
  persist(reordered)
}

async function renameSource(source) {
  try {
    const { value } = await ElMessageBox.prompt('输入此设备中显示的名称。', '重命名音源', {
      inputValue: source.name,
      inputPattern: /^.{1,80}$/,
      inputErrorMessage: '名称需为 1-80 个字符',
      confirmButtonText: '保存',
      cancelButtonText: '取消'
    })
    const name = String(value || '').trim()
    if (!name) return
    persist(sources.value.map((item) => item.id === source.id ? { ...item, name } : item))
  } catch {
    // Prompt cancellation is expected.
  }
}

function toggleSourceCode(sourceId) {
  expandedSourceId.value = expandedSourceId.value === sourceId ? '' : sourceId
}

function removeSource(sourceId) {
  const next = sources.value.filter((source) => source.id !== sourceId)
  if (persist(next) && expandedSourceId.value === sourceId) expandedSourceId.value = ''
}

function downloadText(fileName, contents, mimeType) {
  const blob = new Blob([contents], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function exportSource(source) {
  downloadText(source.fileName || `${source.name}.js`, source.script, 'text/javascript;charset=utf-8')
  ElMessage.success(`已导出「${source.name}」`)
}

function exportAllSources() {
  const bundle = {
    format: 'music-holo-local-source-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    sources: sources.value.map(({ script, ...metadata }) => ({ ...metadata, script }))
  }
  downloadText('music-holo-source-backup.json', JSON.stringify(bundle, null, 2), 'application/json;charset=utf-8')
  ElMessage.success('音源备份已导出')
}

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未知'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date)
}
</script>

<style scoped>
.source-manager { display: flex; flex-direction: column; gap: 16px; }
.source-manager-head {
  position: relative; display: flex; align-items: center; justify-content: space-between; gap: 20px; overflow: hidden; padding: 20px 22px;
  background: radial-gradient(ellipse at 86% 45%, color-mix(in srgb, var(--holo-primary) 13%, transparent), transparent 35%),
    linear-gradient(115deg, color-mix(in srgb, var(--holo-secondary) 8%, transparent), transparent 70%);
}
.source-manager-copy { min-width: 0; }
.source-eyebrow { color: var(--holo-primary); font-size: 9px; letter-spacing: 2px; }
.source-manager h2 { margin: 7px 0 5px; color: var(--text-main); font-size: 19px; }
.source-manager-copy p { margin: 0; color: var(--text-sub); font-size: 12px; line-height: 1.6; }
.source-manager-actions { flex: 0 0 auto; }
.source-file-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.source-url-import { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; padding: 12px; }
.source-url-import small { grid-column: 1 / -1; color: var(--text-sub); font-size: 10px; }
.source-safety-alert { align-items: flex-start; }
.source-safety-alert :deep(.el-alert__description) { line-height: 1.65; }
.source-library-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 2px; }
.source-library-toolbar > div { display: flex; align-items: baseline; gap: 10px; }
.source-library-toolbar strong { color: var(--text-main); font-size: 14px; }
.source-library-toolbar span { color: var(--text-sub); font-size: 11px; }
.source-backup-actions { display: flex; align-items: center; gap: 4px; }
.source-list { display: flex; flex-direction: column; gap: 10px; }
.source-card { padding: 16px; border: 1px solid color-mix(in srgb, var(--holo-primary) 17%, var(--border-color)); }
.source-card-top { display: flex; align-items: flex-start; gap: 13px; }
.source-rank { display: grid; flex: 0 0 34px; width: 34px; height: 34px; place-items: center; border-radius: 10px; color: var(--holo-primary); background: color-mix(in srgb, var(--holo-primary) 9%, transparent); font: 600 11px/1 monospace; }
.source-info { min-width: 0; flex: 1; }
.source-title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
.source-title-row h3 { max-width: 100%; margin: 0 2px 0 0; overflow: hidden; color: var(--text-main); font-size: 14px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.source-description { margin: 6px 0; color: var(--text-sub); font-size: 11px; line-height: 1.5; }
.source-filename { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.source-meta { display: flex; flex-wrap: wrap; gap: 6px 14px; color: var(--text-sub); font-size: 10px; }
.source-meta span:nth-child(2) { overflow-wrap: anywhere; }
.source-card-footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border-color); }
.source-order-actions, .source-file-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 0 3px; }
.source-code-view { margin-top: 12px; }
.source-code-view :deep(textarea) { font: 11px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; }
.source-empty { display: flex; min-height: 220px; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 22px; text-align: center; }
.source-empty-icon { display: grid; width: 50px; height: 50px; place-items: center; border: 1px solid color-mix(in srgb, var(--holo-primary) 30%, transparent); border-radius: 16px; color: var(--holo-primary); background: color-mix(in srgb, var(--holo-primary) 8%, transparent); font-size: 22px; }
.source-empty strong { color: var(--text-main); font-size: 14px; }
.source-empty span { max-width: 400px; color: var(--text-sub); font-size: 11px; line-height: 1.6; }
.source-footnote { display: flex; align-items: center; gap: 6px; color: var(--text-sub); font-size: 10px; }
.source-footnote :deep(.el-icon) { color: var(--holo-primary); }
@media (max-width: 560px) {
  .source-manager-head { align-items: flex-start; flex-direction: column; padding: 16px; }
  .source-manager-actions { width: 100%; }
  .source-manager-actions :deep(.el-button) { width: 100%; }
  .source-url-import { grid-template-columns: 1fr; }
  .source-url-import small { grid-column: auto; }
  .source-library-toolbar { align-items: flex-start; flex-direction: column; }
  .source-card { padding: 12px; }
  .source-card-footer { align-items: flex-start; flex-direction: column; }
  .source-file-actions { width: 100%; justify-content: flex-start; }
}
</style>
