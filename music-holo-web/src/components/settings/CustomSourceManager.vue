<template>
  <section class="source-manager">
    <div class="source-manager-head glass-panel">
      <div class="source-manager-copy">
        <div class="source-eyebrow">LOCAL SOURCE LIBRARY</div>
        <h2>自定义音源 <el-tag v-if="isDesktop" size="small">桌面隔离模式</el-tag></h2>
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
      <small>{{ isDesktop ? '桌面模式通过原生授权窗口下载，导入不会执行脚本。' : '跨域不可读时，请在浏览器下载脚本后使用文件导入。' }}</small>
    </div>

    <el-alert class="source-safety-alert" type="warning" :closable="false" show-icon>
      <template #title>脚本默认不会自动运行</template>
      <template #default>
          <span v-if="isDesktop">脚本在受限 Worker 中运行，网络通过受控桌面桥访问公网 HTTP(S)。首次访问域名须原生窗口授权；检查 DNS 并固定公网地址，不访问业务后端和内网，不携带 Cookie 或账号令牌。导入不自动执行；关闭检测会销毁会话。部分 LX 工具 API 尚未实现，兼容检测不等于可播放或内容授权。第三方搜索／榜单尚未接入。</span>
          <span v-else>可手动对可信脚本执行一次性隔离兼容检测：脚本在受限 Worker 中运行，无法访问页面 DOM、本机存储或直接联网；外部 HTTPS 请求须按域名确认，并由浏览器 CORS 策略控制。程序会拦截常见本地地址和私网 DNS 别名，但浏览器端无法可靠验证任意域名最终解析到的 IP，不能防住所有 DNS 重绑定。检测结束后沙箱销毁；能力检测不会自动添加搜索结果或播放歌曲。普通曲目可由你在列表中单独选择自定义源解析；请求仍受 HTTPS、用户确认和浏览器 CORS 限制。</span>
      </template>
    </el-alert>

    <div class="source-library-toolbar">
      <div>
        <strong>本机音源库</strong>
        <span>{{ sources.length }} / {{ MAX_CUSTOM_SOURCES }} 个脚本</span>
      </div>
      <div class="source-toolbar-actions">
        <el-input
          v-if="sources.length > 0"
          v-model="sourceFilter"
          class="source-search"
          clearable
          aria-label="筛选本机音源"
          placeholder="按名称、作者或文件名筛选"
        />
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
    </div>

    <div v-if="sources.length === 0" class="source-empty glass-panel">
      <div class="source-empty-icon"><el-icon><FolderAdd /></el-icon></div>
      <strong>还没有导入自定义音源</strong>
      <span>选择本地 .js / .mjs 文件后，它会保存在本设备，不会上传。</span>
      <el-button type="primary" plain @click="openFilePicker">选择音源文件</el-button>
    </div>

    <div v-else-if="visibleSources.length === 0" class="source-empty glass-panel">
      <div class="source-empty-icon"><el-icon><FolderAdd /></el-icon></div>
      <strong>没有匹配的音源</strong>
      <span>可以尝试搜索名称、作者、说明或文件名。</span>
      <el-button text @click="sourceFilter = ''">清除筛选</el-button>
    </div>

    <div v-else class="source-list" aria-label="自定义音源列表">
      <article v-for="{ source, index } in visibleSources" :key="source.id" class="source-card glass-panel" :data-source-id="source.id">
        <div class="source-card-top">
          <div class="source-rank" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</div>
          <div class="source-info">
            <div class="source-title-row">
              <h3>{{ source.name }}</h3>
              <el-tag size="small" effect="plain">v{{ source.version }}</el-tag>
              <el-tag v-if="!compatibilityBySource[source.id]" size="small" type="info" effect="plain">已导入 · 未运行</el-tag>
              <el-tag v-else-if="!compatibilityBySource[source.id].error" size="small" type="success" effect="plain">隔离检测通过</el-tag>
              <el-tag v-else size="small" type="danger" effect="plain">检测失败</el-tag>
            </div>
            <p v-if="source.description" class="source-description">{{ source.description }}</p>
            <p v-else class="source-description source-filename">{{ source.fileName }}</p>
            <div v-if="source.author || source.homepage" class="source-credits">
              <span v-if="source.author">作者：{{ source.author }}</span>
              <a v-if="source.homepage" :href="source.homepage" target="_blank" rel="noopener noreferrer">源主页 ↗</a>
            </div>
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
            <el-button text size="small" :loading="checkingSourceId === source.id" :aria-label="`隔离兼容检测 ${source.name}`" @click="checkCompatibility(source)">兼容检测</el-button>
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

        <div v-if="compatibilityBySource[source.id]" class="source-runtime-result" :class="{ 'is-error': compatibilityBySource[source.id].error }" role="status">
          <template v-if="compatibilityBySource[source.id].error">
            <strong>隔离检测未通过</strong>
            <span>{{ compatibilityBySource[source.id].error }}</span>
          </template>
          <template v-else>
            <strong>初始化声明 {{ compatibilityBySource[source.id].sources.length }} 个平台</strong>
            <el-tag v-for="capability in compatibilityBySource[source.id].sources" :key="capability.key" size="small" effect="plain">
              {{ capability.name }} · {{ capability.actions.length }} 项能力
            </el-tag>
            <el-button
              v-if="supportsMusicUrl(compatibilityBySource[source.id])"
              text
              size="small"
              :aria-label="`打开试听台 ${source.name}`"
              @click="openAudition(source)"
            >打开试听台</el-button>
          </template>
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

    <el-dialog
      v-model="auditionVisible"
      :title="auditionSource ? `隔离试听台 · ${auditionSource.name}` : '隔离试听台'"
      width="min(760px, calc(100vw - 32px))"
      append-to-body
      :close-on-click-modal="false"
      :close-on-press-escape="!auditioning"
      @closed="onAuditionClosed"
    >
      <div class="source-audition">
        <el-alert type="warning" :closable="false" show-icon>
          <template #title>LX 自定义源负责解析，不负责搜索</template>
          <template #default>
            试听会重新运行此脚本并调用其 musicUrl。先选 Music Holo 曲库歌曲可自动填入通用信息；若源要求 songmid、musicmid 等平台 ID，请自行补充到 JSON。
            <span v-if="isDesktop">桌面支持公网 HTTP(S) 媒体，通过原生授权与 DNS 校验后匿名流式加载；HTTP 明文传输，重定向会拒绝。</span>
            <span v-else>音频仅接受 HTTPS，并通过播放器以匿名 CORS 模式加载；常见本地/私网主机名会拦截，但浏览器无法验证任意域名最终解析的 IP。目标音频站未开放 CORS 时浏览器会阻止播放。</span>
          </template>
        </el-alert>

        <div class="source-audition-fields">
          <label class="source-audition-field">
            <span>音源平台</span>
            <el-select v-model="auditionPlatformKey" aria-label="选择自定义音源平台" @change="onAuditionPlatformChange">
              <el-option v-for="platform in auditionPlatforms" :key="platform.key" :label="`${platform.name} (${platform.key})`" :value="platform.key" />
            </el-select>
          </label>
          <label class="source-audition-field">
            <span>音质</span>
            <el-select v-model="auditionQuality" aria-label="选择自定义源音质" :disabled="selectedAuditionPlatform?.key === 'local' || auditionQualities.length === 0">
              <el-option v-for="quality in auditionQualities" :key="quality" :label="quality" :value="quality" />
            </el-select>
          </label>
        </div>

        <div class="source-audition-catalog">
          <label>从 Music Holo 曲库选择歌曲（可选）</label>
          <div class="source-audition-search">
            <el-input v-model="auditionSearchKeyword" clearable placeholder="输入歌名或歌手" aria-label="试听曲库搜索" @keyup.enter="searchAuditionCatalog" />
            <el-button :loading="auditionSearchLoading" :disabled="!auditionSearchKeyword.trim()" @click="searchAuditionCatalog">搜索曲库</el-button>
          </div>
          <div v-if="auditionSearchResults.length" class="source-audition-results" aria-label="试听曲库结果">
            <el-button v-for="song in auditionSearchResults" :key="song.id" text size="small" @click="useCatalogSong(song)">
              {{ song.title }} · {{ song.singerName || '未知歌手' }}
            </el-button>
          </div>
        </div>

        <label class="source-audition-info">
          <span>传给音源的 musicInfo JSON</span>
          <el-input v-model="auditionMusicInfoText" type="textarea" :rows="8" resize="vertical" aria-label="musicInfo JSON" />
          <small>仅将此 JSON 传入所选自定义源。不要放入密码、Cookie 或访问令牌；音源可能把曲目信息发送到你批准的服务域名。</small>
        </label>

        <div v-if="resolvedAuditionTrack" class="source-audition-ready" role="status">
          <div>
            <strong>音频地址已解析</strong>
            <span>{{ resolvedAuditionTrack.title }} · {{ resolvedAuditionTrack.singerName }}</span>
            <small>媒体域名：{{ resolvedAuditionTrack.audioOrigin }} · 不保存到服务器/本机持久队列</small>
            <small v-if="resolvedAuditionTrack.customLyrics.length">已解析 {{ resolvedAuditionTrack.customLyrics.length }} 行歌词</small>
          </div>
          <div class="source-audition-ready-actions">
            <el-button type="primary" @click="playResolvedAudition">交给全局播放器试听</el-button>
            <el-button text @click="resolvedAuditionTrack = null">清除结果</el-button>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button :disabled="auditioning" @click="auditionVisible = false">关闭</el-button>
        <el-button type="primary" :loading="auditioning" :disabled="!auditionPlatformKey" @click="resolveAudition">解析音频</el-button>
      </template>
    </el-dialog>

    <div class="source-footnote"><el-icon><Lock /></el-icon>脚本内容只保存在本机浏览器存储中；不会上传到 Music Holo 服务器。</div>
  </section>
</template>

<script setup>
import { desktopSourceBridge, createDesktopSourceRequestBridge, desktopMediaUrl } from '@/utils/desktopSource'
import { computed, onUnmounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '@/store/user'
import { usePlayerStore } from '@/store/player'
import * as searchApi from '@/api/search'
import {
  MAX_CUSTOM_SOURCE_BYTES,
  MAX_CUSTOM_SOURCES,
  customSourceStorageKeyForOwner,
  formatSourceSize,
  parseCustomSourceFile,
  parseCustomSourceUrl,
  readCustomSources,
  sourceFileNameFromUrl,
  writeCustomSources
} from '@/utils/customSources'
import {
  createCustomSourceSession,
  parseCustomSourceLyrics,
  runCustomSourceCompatibility,
  validateCustomSourceMediaUrl
} from '@/utils/customSourceRuntime'
import { createCustomSourceRequestBridge } from '@/utils/customSourceConsent'

const isDesktop = !!desktopSourceBridge()

const userStore = useUserStore()
const playerStore = usePlayerStore()
const fileInput = ref(null)
const backupInput = ref(null)
const sourceUrl = ref('')
const sourceFilter = ref('')
const importing = ref(false)
const importingUrl = ref(false)
const checkingSourceId = ref('')
const compatibilityBySource = ref({})
const expandedSourceId = ref('')
const auditionVisible = ref(false)
const auditioning = ref(false)
const auditionSource = ref(null)
const auditionPlatformKey = ref('')
const auditionQuality = ref('')
const auditionSearchKeyword = ref('')
const auditionSearchResults = ref([])
const auditionSearchLoading = ref(false)
const auditionMusicInfoText = ref('')
const resolvedAuditionTrack = ref(null)
let activeAuditionSession = null
let activeAuditionController = null
let activeCompatibilityController = null
const sourceOwner = computed(() => userStore.userInfo?.id ?? userStore.userInfo?.username ?? 'local')
const storageKey = computed(() => customSourceStorageKeyForOwner(sourceOwner.value))
const sources = ref(readCustomSources(localStorage, storageKey.value))
const visibleSources = computed(() => {
  const query = sourceFilter.value.trim().toLowerCase()
  return sources.value
    .map((source, index) => ({ source, index }))
    .filter(({ source }) => !query || [source.name, source.description, source.author, source.fileName]
      .some((value) => String(value || '').toLowerCase().includes(query)))
})
const auditionPlatforms = computed(() => {
  const result = auditionSource.value ? compatibilityBySource.value[auditionSource.value.id] : null
  return result?.sources?.filter((platform) => platform.actions.includes('musicUrl')) || []
})
const selectedAuditionPlatform = computed(() => auditionPlatforms.value.find((platform) => platform.key === auditionPlatformKey.value) || null)
const auditionQualities = computed(() => selectedAuditionPlatform.value?.qualities || [])

watch(storageKey, (key) => {
  sources.value = readCustomSources(localStorage, key)
  sourceFilter.value = ''
  expandedSourceId.value = ''
  compatibilityBySource.value = {}
  checkingSourceId.value = ''
  activeCompatibilityController?.abort()
  activeCompatibilityController = null
  activeAuditionController?.abort()
  activeAuditionController = null
  activeAuditionSession?.destroy()
  activeAuditionSession = null
  auditioning.value = false
  auditionVisible.value = false
  auditionSource.value = null
  resolvedAuditionTrack.value = null
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
    ElMessage.success(`已导入「${source.name}」，不会自动运行`)
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
    if (persist([...imported, ...sources.value])) ElMessage.success(`已恢复 ${imported.length} 个音源，不会自动运行`)
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
  const timeoutId = window.setTimeout(() => controller.abort(), isDesktop ? 90_000 : 15_000)
  const desktopRequest = isDesktop ? createDesktopSourceRequestBridge({ name: '下载音源脚本（不执行）' }) : null
  try {
    if (desktopRequest) {
      const response = await desktopRequest(url.href, { method: 'GET' }, controller.signal)
      if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`HTTP ${response.statusCode}`)
      if (addSource(sourceFileNameFromUrl(url), response.body)) sourceUrl.value = ''
      return
    }
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
      : isDesktop ? `桌面导入失败：${error?.message || '网络不可用'}` : '远程导入失败：源站可能不支持跨域读取，请下载 .js 文件后再导入')
  } finally {
    desktopRequest?.dispose()
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

async function checkCompatibility(source) {
  if (checkingSourceId.value) return
  let executionStarted = false
  const controller = new AbortController()
  activeCompatibilityController = controller
  checkingSourceId.value = source.id
  try {
    await ElMessageBox.confirm(
      '此操作会执行该脚本的初始化代码。脚本仅在一次性隔离 Worker 中运行，没有页面 DOM、本机存储或直接网络能力；仍请只检测你信任的脚本。',
      '隔离兼容检测',
      { type: 'warning', confirmButtonText: '我信任并检测', cancelButtonText: '取消', closeOnClickModal: false }
    )
    if (controller.signal.aborted) return
    executionStarted = true
    const result = await runCustomSourceCompatibility(source, {
      onRequest: createCustomSourceRequestBridge(source),
      signal: controller.signal
    })
    if (controller.signal.aborted) return
    compatibilityBySource.value = { ...compatibilityBySource.value, [source.id]: result }
    ElMessage.success(`隔离初始化通过：声明 ${result.sources.length} 个平台；本次仅检测协议能力，未解析或播放歌曲`)
  } catch (error) {
    if (controller.signal.aborted) return
    const wasCancelled = error === 'cancel' || error === 'close'
    if (!wasCancelled || executionStarted) {
      const message = wasCancelled ? '网络请求已拒绝或检测已取消' : (error?.message || '隔离兼容检测失败')
      compatibilityBySource.value = { ...compatibilityBySource.value, [source.id]: { error: message, sources: [] } }
      ElMessage.warning(message)
    }
  } finally {
    if (activeCompatibilityController === controller) {
      activeCompatibilityController = null
      if (checkingSourceId.value === source.id) checkingSourceId.value = ''
    }
  }
}

function supportsMusicUrl(result) {
  return Boolean(result?.sources?.some((platform) => platform.actions.includes('musicUrl')))
}

function openAudition(source) {
  if (!supportsMusicUrl(compatibilityBySource.value[source.id])) {
    ElMessage.warning('请先完成隔离兼容检测，并确认音源声明了 musicUrl')
    return
  }
  auditionSource.value = source
  auditionPlatformKey.value = auditionPlatforms.value[0]?.key || ''
  auditionQuality.value = auditionPlatforms.value[0]?.qualities?.[0] || ''
  auditionSearchKeyword.value = ''
  auditionSearchResults.value = []
  auditionMusicInfoText.value = JSON.stringify({ title: '', singerName: '' }, null, 2)
  resolvedAuditionTrack.value = null
  auditionVisible.value = true
}

function onAuditionPlatformChange(platformKey) {
  const platform = auditionPlatforms.value.find((item) => item.key === platformKey)
  auditionQuality.value = platform?.qualities?.[0] || ''
}

async function searchAuditionCatalog() {
  const query = auditionSearchKeyword.value.trim()
  if (!query) return
  auditionSearchLoading.value = true
  try {
    const result = await searchApi.search(query, 8)
    auditionSearchResults.value = Array.isArray(result?.songs) ? result.songs.slice(0, 8) : []
    if (!auditionSearchResults.value.length) ElMessage.info('Music Holo 曲库没有找到歌曲；也可直接编辑 musicInfo JSON')
  } catch {
    ElMessage.warning('曲库搜索失败，可以直接填写 musicInfo JSON')
  } finally {
    auditionSearchLoading.value = false
  }
}

function useCatalogSong(song) {
  auditionMusicInfoText.value = JSON.stringify({
    musicHoloId: song.id,
    title: song.title,
    name: song.title,
    singerName: song.singerName || '',
    singer: song.singerName || '',
    album: song.album || '',
    duration: song.duration || 0
  }, null, 2)
  ElMessage.info('已填入 Music Holo 通用曲目信息；若源需要平台 ID，请继续编辑 JSON')
}

function firstMusicText(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const joined = value.map((item) => typeof item === 'object' ? (item?.name || item?.title || '') : item)
        .map((item) => String(item || '').trim()).filter(Boolean).join(' / ')
      if (joined) return joined.slice(0, 120)
    } else if (value && typeof value === 'object') {
      const nested = value.name || value.title || value.artist || value.singerName
      if (nested) return String(nested).trim().slice(0, 120)
    } else if (value != null && String(value).trim()) {
      return String(value).trim().slice(0, 120)
    }
  }
  return ''
}

async function resolveAudition() {
  if (auditioning.value || !auditionSource.value || !selectedAuditionPlatform.value) return
  let musicInfo
  try {
    musicInfo = JSON.parse(auditionMusicInfoText.value || '{}')
  } catch {
    ElMessage.warning('musicInfo 不是有效 JSON')
    return
  }
  if (!musicInfo || typeof musicInfo !== 'object' || Array.isArray(musicInfo)) {
    ElMessage.warning('musicInfo 必须是 JSON 对象')
    return
  }
  if (!String(musicInfo.title || musicInfo.name || '').trim()) {
    ElMessage.warning('请至少填写歌曲 title 或 name')
    return
  }
  const selectedPlatform = selectedAuditionPlatform.value
  const source = auditionSource.value
  let consentGranted = false
  let session = null
  const controller = new AbortController()
  activeAuditionController = controller
  auditioning.value = true
  resolvedAuditionTrack.value = null
  try {
    await ElMessageBox.confirm(
      `将临时执行「${source.name}」脚本，并把当前 musicInfo 发送给所选 ${selectedPlatform.name} 的 musicUrl 处理器。请勿填写密码、Cookie 或令牌，且只运行可信并获准使用的源。`,
      '隔离解析并试听',
      { type: 'warning', confirmButtonText: '我信任并解析', cancelButtonText: '取消', closeOnClickModal: false }
    )
    if (controller.signal.aborted) throw new Error('隔离试听已取消')
    consentGranted = true
    session = await createCustomSourceSession(source, {
      onRequest: createCustomSourceRequestBridge(source),
      signal: controller.signal
    })
    activeAuditionSession = session
    const runtimePlatform = session.capabilities.sources.find((platform) => platform.key === selectedPlatform.key)
    if (!runtimePlatform?.actions.includes('musicUrl')) throw new Error('本次初始化没有声明所选平台的 musicUrl 能力')

    const rawMediaUrl = await session.request({
      source: runtimePlatform.key,
      action: 'musicUrl',
      info: {
        type: runtimePlatform.key === 'local' ? null : (auditionQuality.value || runtimePlatform.qualities[0] || '128k'),
        musicInfo
      }
    })
    if (controller.signal.aborted) throw new Error('隔离试听已取消')
    const media = validateCustomSourceMediaUrl(rawMediaUrl)
    let customLyrics = []
    if (runtimePlatform.actions.includes('lyric')) {
      try {
        const lyricResult = await session.request({
          source: runtimePlatform.key,
          action: 'lyric',
          info: { musicInfo }
        })
        customLyrics = parseCustomSourceLyrics(lyricResult)
      } catch {
        // 歌词是可选能力；失败不影响已解析的音频。
      }
    }
    if (controller.signal.aborted) throw new Error('隔离试听已取消')
    await ElMessageBox.confirm(
      isDesktop ? `音频来自 ${media.origin}。桌面将再次确认域名，并通过不带 Cookie 的受控媒体流加载。HTTP 为明文传输。请确认你有权试听。` : `音频来自 ${media.origin}。播放器将使用 crossorigin=anonymous（不发送 Cookie/登录态）；若该站未允许 CORS，浏览器将阻止播放。请确认你有权试听。`,
      '确认加载音频',
      { type: 'warning', confirmButtonText: '允许加载音频', cancelButtonText: '取消', closeOnClickModal: false }
    )
    if (controller.signal.aborted) throw new Error('隔离试听已取消')
    const playbackUrl = await desktopMediaUrl(media.href)
    if (controller.signal.aborted) throw new Error('隔离试听已取消')
    const title = firstMusicText(musicInfo.title, musicInfo.name) || '自定义源曲目'
    const singerName = firstMusicText(musicInfo.singerName, musicInfo.singer, musicInfo.artist, musicInfo.artists) || '自定义音源'
    const duration = Number(musicInfo.duration)
    resolvedAuditionTrack.value = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      title,
      singerName,
      album: firstMusicText(musicInfo.album, musicInfo.albumName),
      cover: '',
      duration: Number.isFinite(duration) && duration > 0 && duration <= 3600 ? duration : 0,
      audioUrl: playbackUrl,
      audioOrigin: media.origin,
      customLyrics,
      categoryName: '自定义源',
      sourceName: source.name,
      sourcePlatform: runtimePlatform.name,
      isCustomSource: true
    }
    ElMessage.success('音频地址已解析；点击“交给全局播放器试听”开始播放')
  } catch (error) {
    if (controller.signal.aborted) return
    const wasCancelled = error === 'cancel' || error === 'close'
    if (wasCancelled) {
      if (consentGranted) ElMessage.info('试听已取消')
    } else {
      ElMessage.warning(error?.message || '自定义源解析失败')
    }
  } finally {
    session?.destroy()
    if (activeAuditionSession === session) activeAuditionSession = null
    if (activeAuditionController === controller) {
      activeAuditionController = null
      auditioning.value = false
    }
  }
}

async function playResolvedAudition() {
  const track = resolvedAuditionTrack.value
  if (!track) return
  try {
    await playerStore.playSong(track)
    auditionVisible.value = false
    ElMessage.success(`已交给全局播放器：《${track.title}》`)
  } catch {
    ElMessage.warning('加入全局播放器失败')
  }
}

function onAuditionClosed() {
  activeAuditionController?.abort()
  activeAuditionController = null
  activeAuditionSession?.destroy()
  activeAuditionSession = null
  auditionSource.value = null
  auditionSearchResults.value = []
  if (!auditioning.value) resolvedAuditionTrack.value = null
}

onUnmounted(() => {
  activeCompatibilityController?.abort()
  activeCompatibilityController = null
  activeAuditionController?.abort()
  activeAuditionController = null
  activeAuditionSession?.destroy()
  activeAuditionSession = null
})

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
  if (!persist(next)) return
  if (checkingSourceId.value === sourceId) {
    activeCompatibilityController?.abort()
    activeCompatibilityController = null
    checkingSourceId.value = ''
  }
  if (auditionSource.value?.id === sourceId) {
    activeAuditionController?.abort()
    activeAuditionController = null
    activeAuditionSession?.destroy()
    activeAuditionSession = null
    auditioning.value = false
    auditionVisible.value = false
    auditionSource.value = null
    resolvedAuditionTrack.value = null
  }
  if (expandedSourceId.value === sourceId) expandedSourceId.value = ''
  const nextResults = { ...compatibilityBySource.value }
  delete nextResults[sourceId]
  compatibilityBySource.value = nextResults
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
.source-toolbar-actions { align-items: center !important; }
.source-search { width: 230px; }
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
.source-credits { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 4px 0 6px; color: var(--text-sub); font-size: 10px; }
.source-credits a { color: var(--holo-primary); text-decoration: none; }
.source-credits a:hover { text-decoration: underline; }
.source-meta { display: flex; flex-wrap: wrap; gap: 6px 14px; color: var(--text-sub); font-size: 10px; }
.source-meta span:nth-child(2) { overflow-wrap: anywhere; }
.source-card-footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border-color); }
.source-order-actions, .source-file-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 0 3px; }
.source-runtime-result { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; margin-top: 10px; padding: 9px 11px; border: 1px solid color-mix(in srgb, var(--holo-primary) 28%, transparent); border-radius: 10px; color: var(--text-sub); background: color-mix(in srgb, var(--holo-primary) 6%, transparent); font-size: 10px; }
.source-runtime-result strong { color: var(--text-main); font-size: 11px; }
.source-runtime-result.is-error { border-color: color-mix(in srgb, var(--el-color-danger) 34%, transparent); background: color-mix(in srgb, var(--el-color-danger) 6%, transparent); }
.source-runtime-result.is-error span { overflow-wrap: anywhere; }
.source-audition { display: flex; flex-direction: column; gap: 16px; }
.source-audition :deep(.el-alert__description) { line-height: 1.65; }
.source-audition-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.source-audition-field, .source-audition-info { display: flex; min-width: 0; flex-direction: column; gap: 7px; color: var(--text-main); font-size: 12px; }
.source-audition-field :deep(.el-select) { width: 100%; }
.source-audition-catalog { display: flex; flex-direction: column; gap: 8px; color: var(--text-main); font-size: 12px; }
.source-audition-search { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.source-audition-results { display: flex; max-height: 110px; flex-wrap: wrap; gap: 4px; overflow-y: auto; padding: 6px; border: 1px solid var(--border-color); border-radius: 8px; }
.source-audition-info small, .source-audition-ready small { color: var(--text-sub); font-size: 10px; line-height: 1.5; }
.source-audition-ready { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 12px; border: 1px solid color-mix(in srgb, var(--holo-primary) 32%, transparent); border-radius: 12px; background: color-mix(in srgb, var(--holo-primary) 6%, transparent); }
.source-audition-ready > div:first-child { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.source-audition-ready strong { color: var(--holo-primary); }
.source-audition-ready span { color: var(--text-main); overflow-wrap: anywhere; }
.source-audition-ready-actions { display: flex; flex-wrap: wrap; gap: 4px; }
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
  .source-toolbar-actions { width: 100%; align-items: stretch !important; flex-direction: column; gap: 2px; }
  .source-search { width: 100%; }
  .source-backup-actions { justify-content: flex-start; }
  .source-audition-fields, .source-audition-search { grid-template-columns: 1fr; }
  .source-audition-ready-actions { width: 100%; }
  .source-audition-ready-actions :deep(.el-button) { flex: 1; }
  .source-card { padding: 12px; }
  .source-card-footer { align-items: flex-start; flex-direction: column; }
  .source-file-actions { width: 100%; justify-content: flex-start; }
}
</style>
