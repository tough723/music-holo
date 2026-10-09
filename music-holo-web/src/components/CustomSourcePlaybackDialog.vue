<template>
  <el-dialog
    v-model="visible"
    :title="song ? `自定义源解析 · ${song.title}` : '自定义源解析'"
    width="min(680px, calc(100vw - 32px))"
    append-to-body
    :close-on-click-modal="!busy"
    :close-on-press-escape="!busy"
    :show-close="!busy"
    @closed="onDialogClosed"
  >
    <section v-if="song" class="custom-source-playback">
      <el-alert type="warning" :closable="false" show-icon>
        <template #title>仅在本次操作中运行可信脚本</template>
        <template #default>
          <span v-if="isDesktop">桌面模式：脚本仍在受限 Worker 中运行；网络经桌面桥逐域名授权，支持公网 HTTP(S)，不受网页 CORS 限制。禁止访问内网、业务后端和本机文件，不携带登录凭据；HTTP 为明文传输。只支持部分 LX API，并非所有脚本都兼容。搜索与榜单由 Music Holo 平台适配器提供（与脚本无关）。</span>
          <span v-else>脚本不会自动运行。初始化和每次网络请求都受隔离 Worker、HTTPS、逐域名确认与浏览器 CORS 限制；请求不携带 Cookie 或登录态。同源媒体地址会拒绝，避免播放器请求附带 Music Holo 站点凭据。常见本机地址会拦截，但浏览器无法保证识别所有 DNS 重绑定，仍只运行可信脚本。默认只传歌曲标题、歌手、专辑、时长；Music Holo 歌曲 ID 只写入 musicHoloId 字段，不伪装成平台 ID。平台曲目 ID（id/songmid/hash 等）请在下方 JSON 提供真实值，敏感凭据字段会拒绝。</span>
        </template>
      </el-alert>

      <div class="source-playback-track">
        <Cover :src="song.cover" :text="song.title" :size="54" />
        <div class="source-playback-track-copy">
          <strong>{{ song.title }}</strong>
          <span>{{ song.singerName || '未知歌手' }}<template v-if="song.album"> · {{ song.album }}</template></span>
        </div>
        <el-tag size="small" effect="plain">曲库歌曲</el-tag>
      </div>

      <label class="source-playback-info">
        <span>平台专属曲目字段（可选 JSON）</span>
        <el-input
          v-model="providerFieldsText"
          type="textarea"
          :rows="3"
          maxlength="4096"
          resize="vertical"
          spellcheck="false"
          aria-label="平台专属曲目字段 JSON"
        />
        <small>当音源要求 id、songmid、musicmid、hash 等平台 ID 时可在此填写，例如 {"id":"347230"}、{"songmid":"…"}、{"hash":"…"}。只填曲目元数据，不要填 Cookie、密码、令牌或其他凭据；内容仅用于本次解析，不会持久化。</small>
      </label>

      <div v-if="sources.length" class="source-playback-source">
        <label class="source-playback-field">
          <span>本机自定义音源</span>
          <el-select
            v-model="selectedSourceId"
            aria-label="选择自定义音源"
            :disabled="busy"
            @change="onSourceChange"
          >
            <el-option
              v-for="source in sources"
              :key="source.id"
              :label="`${source.name} · v${source.version}`"
              :value="source.id"
            />
          </el-select>
        </label>
      </div>

      <div v-if="sources.length === 0" class="source-playback-empty glass-panel">
        <el-icon><FolderAdd /></el-icon>
        <strong>当前账号还没有本机音源</strong>
        <span>导入的脚本按账号保存在本机浏览器中，不会上传。</span>
        <el-button type="primary" plain @click="goToSourceSettings">前往自定义源设置</el-button>
      </div>

      <div v-else-if="!activeSession" class="source-playback-step glass-panel">
        <div class="source-playback-step-copy">
          <strong>第一步 · 隔离初始化</strong>
          <span>启动后只读取脚本声明的平台与能力，不会自动解析或播放歌曲。</span>
        </div>
        <el-button
          type="primary"
          :loading="busy"
          :disabled="!selectedSource"
          aria-label="信任并初始化自定义音源"
          @click="initializeSource"
        >
          我信任此源并初始化
        </el-button>
      </div>

      <template v-else>
        <div class="source-playback-fields">
          <label class="source-playback-field">
            <span>音源平台</span>
            <el-select
              v-model="selectedPlatformKey"
              aria-label="选择自定义音源平台"
              :disabled="busy"
              @change="onPlatformChange"
            >
              <el-option
                v-for="platform in platforms"
                :key="platform.key"
                :label="`${platform.name} (${platform.key})`"
                :value="platform.key"
              />
            </el-select>
          </label>
          <label class="source-playback-field">
            <span>音质</span>
            <el-select
              v-model="selectedQuality"
              aria-label="选择自定义音源音质"
              :disabled="busy || selectedPlatform?.key === 'local' || selectedQualities.length === 0"
              :placeholder="selectedPlatform?.key === 'local' ? '本地源不使用音质选项' : '源未声明音质，将使用默认值'"
            >
              <el-option v-for="quality in selectedQualities" :key="quality" :label="quality" :value="quality" />
            </el-select>
          </label>
        </div>

        <div class="source-playback-step glass-panel">
          <div class="source-playback-step-copy">
            <strong>第二步 · 按需解析</strong>
            <span>
              将调用 {{ selectedPlatform?.name || '所选平台' }} 的 musicUrl；
              {{ selectedPlatform?.actions.includes('lyric') ? '并尝试获取歌词' : '此平台未声明歌词能力' }}；
              {{ selectedPlatform?.actions.includes('pic') ? '并尝试获取封面' : '此平台未声明封面能力' }}。
              解析结果只加入当前播放会话，不保存临时音频地址。
            </span>
          </div>
          <el-button
            type="primary"
            :loading="busy"
            :disabled="!selectedPlatform || !sessionReady"
            aria-label="隔离解析并播放歌曲"
            @click="resolveAndPlay"
          >
            隔离解析并播放
          </el-button>
        </div>

        <div v-if="!sessionReady" class="source-session-expired" role="status">
          隔离会话已结束，请重新初始化后再解析。
          <el-button text type="primary" @click="discardSession">重新初始化</el-button>
        </div>
      </template>

      <el-alert v-if="errorMessage" class="source-playback-error" type="error" :closable="false" show-icon>
        <template #title>自定义音源未能解析</template>
        <template #default>{{ errorMessage }}</template>
      </el-alert>
    </section>

    <template #footer>
      <el-button :disabled="busy" @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { desktopSourceBridge, desktopMediaUrl } from '@/utils/desktopSource'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '@/store/player'
import { useUserStore } from '@/store/user'
import Cover from './Cover.vue'
import { createCustomSourceRequestBridge } from '@/utils/customSourceConsent'
import {
  customSourceStorageKeyForOwner,
  readCustomSources
} from '@/utils/customSources'
import {
  mergeCustomSourceMusicInfo,
  createCustomSourceSession,
  CUSTOM_SOURCE_SESSION_TIMEOUT_MS,
  parseCustomSourceLyrics,
  validateCustomSourceMediaUrl
} from '@/utils/customSourceRuntime'

const isDesktop = !!desktopSourceBridge()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  song: { type: Object, default: null }
})
const emit = defineEmits(['update:modelValue'])

const router = useRouter()
const playerStore = usePlayerStore()
const userStore = useUserStore()
const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})
const sourceOwner = computed(() => userStore.userInfo?.id ?? userStore.userInfo?.username ?? 'local')
const storageKey = computed(() => customSourceStorageKeyForOwner(sourceOwner.value))
const sources = ref([])
const selectedSourceId = ref('')
const platforms = ref([])
const selectedPlatformKey = ref('')
const selectedQuality = ref('')
const providerFieldsText = ref('{}')
const busy = ref(false)
const sessionReady = ref(false)
const errorMessage = ref('')
const selectedSource = computed(() => sources.value.find((source) => source.id === selectedSourceId.value) || null)
const selectedPlatform = computed(() => platforms.value.find((platform) => platform.key === selectedPlatformKey.value) || null)
const selectedQualities = computed(() => selectedPlatform.value?.qualities || [])
const activeSession = shallowRef(null)
let activeController = null
let sessionExpiryTimer = null
let closedByPlayback = false

function refreshSources() {
  sources.value = readCustomSources(globalThis.localStorage, storageKey.value)
  if (!sources.value.some((source) => source.id === selectedSourceId.value)) {
    selectedSourceId.value = sources.value[0]?.id || ''
  }
}

function disposeSession() {
  if (sessionExpiryTimer !== null) clearTimeout(sessionExpiryTimer)
  sessionExpiryTimer = null
  activeController?.abort()
  activeController = null
  activeSession.value?.destroy()
  activeSession.value = null
  sessionReady.value = false
  platforms.value = []
  selectedPlatformKey.value = ''
  selectedQuality.value = ''
}

function resetForDialog() {
  disposeSession()
  refreshSources()
  providerFieldsText.value = '{}'
  errorMessage.value = ''
  closedByPlayback = false
}

function onSourceChange() {
  disposeSession()
  errorMessage.value = ''
}

function onPlatformChange(platformKey) {
  const platform = platforms.value.find((item) => item.key === platformKey)
  selectedQuality.value = platform?.qualities?.[0] || ''
}

function isDialogCancellation(error) {
  return error === 'cancel' || error === 'close' || error?.message === 'cancel' || error?.message === 'close'
}

async function initializeSource() {
  const source = selectedSource.value
  if (!source || busy.value) return
  disposeSession()
  errorMessage.value = ''
  const controller = new AbortController()
  activeController = controller
  busy.value = true
  let createdSession = null

  try {
    await ElMessageBox.confirm(
      `此操作会执行「${source.name}」的初始化代码；此时不会传入歌曲信息。只有你随后点击解析时，才会把当前歌曲公开曲目信息传给源处理器。脚本仅在一次性隔离 Worker 中运行，没有页面 DOM、本机存储或直接网络能力；仍请只运行你信任且获准使用的脚本。`,
      '隔离音源初始化',
      { type: 'warning', confirmButtonText: '我信任并继续', cancelButtonText: '取消', closeOnClickModal: false }
    )
    if (controller.signal.aborted) return

    createdSession = await createCustomSourceSession(source, {
      onRequest: createCustomSourceRequestBridge(source),
      signal: controller.signal
    })
    if (controller.signal.aborted || !visible.value) {
      createdSession.destroy()
      return
    }

    const availablePlatforms = createdSession.capabilities.sources.filter((platform) => platform.actions.includes('musicUrl'))
    if (!availablePlatforms.length) {
      throw new Error('此脚本没有声明 musicUrl 能力，无法解析音频')
    }
    activeSession.value = createdSession
    platforms.value = availablePlatforms
    selectedPlatformKey.value = availablePlatforms[0].key
    selectedQuality.value = availablePlatforms[0].qualities[0] || ''
    sessionReady.value = true
    sessionExpiryTimer = setTimeout(() => {
      if (activeSession.value !== createdSession) return
      sessionReady.value = false
      errorMessage.value = `隔离会话已超过 ${Math.round(CUSTOM_SOURCE_SESSION_TIMEOUT_MS / 1000)} 秒安全时限，请重新初始化。`
    }, CUSTOM_SOURCE_SESSION_TIMEOUT_MS + 100)
  } catch (error) {
    createdSession?.destroy()
    if (activeSession.value === createdSession) activeSession.value = null
    if (controller.signal.aborted || isDialogCancellation(error)) return
    errorMessage.value = error?.message || '隔离音源初始化失败'
    ElMessage.warning(errorMessage.value)
  } finally {
    if (activeController === controller) busy.value = false
  }
}

async function resolveOptionalLyrics(session, platform, musicInfo) {
  if (!platform.actions.includes('lyric')) return []
  try {
    const result = await session.request({ source: platform.key, action: 'lyric', info: { musicInfo } })
    return parseCustomSourceLyrics(result)
  } catch {
    return []
  }
}

async function resolveOptionalCover(session, platform, musicInfo) {
  if (!platform.actions.includes('pic')) return null
  try {
    const result = await session.request({ source: platform.key, action: 'pic', info: { musicInfo } })
    return validateCustomSourceMediaUrl(result)
  } catch {
    return null
  }
}

async function resolveAndPlay() {
  const session = activeSession.value
  const source = selectedSource.value
  const platform = selectedPlatform.value
  const song = props.song
  const controller = activeController
  if (!session || !source || !platform || !song || busy.value) return
  if (!session.isActive) {
    sessionReady.value = false
    errorMessage.value = '隔离会话已结束，请重新初始化后再解析。'
    return
  }
  if (!controller || controller.signal.aborted) {
    errorMessage.value = '隔离会话已取消，请重新初始化后再解析。'
    return
  }

  busy.value = true
  errorMessage.value = ''
  try {
    const musicInfo = mergeCustomSourceMusicInfo(song, providerFieldsText.value)
    const quality = platform.key === 'local'
      ? null
      : (selectedQuality.value || platform.qualities[0] || '128k')
    const rawAudio = await session.request({
      source: platform.key,
      action: 'musicUrl',
      info: { type: quality, musicInfo }
    })
    if (controller.signal.aborted) return

    const audio = validateCustomSourceMediaUrl(rawAudio)
    const customLyrics = await resolveOptionalLyrics(session, platform, musicInfo)
    if (controller.signal.aborted) return
    const cover = await resolveOptionalCover(session, platform, musicInfo)
    if (controller.signal.aborted) return

    const coverPermission = cover ? `；封面来自 ${cover.origin}` : ''
    await ElMessageBox.confirm(
      isDesktop ? `音频来自 ${audio.origin}${coverPermission}。桌面将再次确认域名，通过无 Cookie 的受控媒体流加载，临时地址仅保留在本窗口。HTTP 地址不加密。请确认你有权访问。` : `音频来自 ${audio.origin}${coverPermission}。媒体地址必须是与 Music Holo 不同源的 HTTPS URL；播放器使用匿名 CORS 加载，不发送 Cookie 或登录态，未开放 CORS 的站点将无法播放（封面也可能无法显示）。请确认你有权访问此音源。`,
      '确认加载自定义媒体',
      { type: 'warning', confirmButtonText: '允许并播放', cancelButtonText: '拒绝', closeOnClickModal: false }
    )
    if (controller.signal.aborted) return

    const playbackUrl = await desktopMediaUrl(audio.href)
    let coverUrl = cover?.href || song.cover || ''
    if (cover) {
      try { coverUrl = await desktopMediaUrl(cover.href) } catch { coverUrl = '' }
    }
    if (controller.signal.aborted) return

    const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const track = {
      ...song,
      id: `custom-source-${suffix}`,
      sourceSongId: song.id,
      audioUrl: playbackUrl,
      cover: coverUrl,
      customLyrics,
      isCustomSource: true,
      sourceName: source.name,
      sourcePlatform: platform.name,
      sourcePlatformKey: platform.key,
      sourceQuality: quality || 'local',
      audioOrigin: audio.origin,
      customSourceSessionOnly: true
    }

    await playerStore.playSong(track)
    closedByPlayback = true
    ElMessage.success(`已使用「${source.name} · ${platform.name}」解析并播放《${song.title}》`)
    visible.value = false
  } catch (error) {
    if (controller.signal.aborted) return
    if (!session.isActive) sessionReady.value = false
    if (!isDialogCancellation(error)) {
      errorMessage.value = error?.message || '自定义源解析失败'
      ElMessage.warning(errorMessage.value)
    } else {
      ElMessage.info('已取消加载自定义媒体')
    }
  } finally {
    busy.value = false
    if (closedByPlayback) disposeSession()
  }
}

function discardSession() {
  disposeSession()
  errorMessage.value = ''
}

function goToSourceSettings() {
  try { globalThis.localStorage.setItem('mh_settings_tab', 'sources') } catch { /* Optional preference. */ }
  visible.value = false
  router.push({ name: 'Settings' }).catch(() => {})
}

function onStorage(event) {
  if (event.key !== null && event.key !== storageKey.value) return
  const hadActiveSession = Boolean(activeSession.value)
  if (hadActiveSession) disposeSession()
  refreshSources()
  if (hadActiveSession) errorMessage.value = '本机音源库已变更；为避免运行旧脚本，请重新初始化。'
}

watch(storageKey, () => {
  disposeSession()
  refreshSources()
  errorMessage.value = ''
})

watch(() => props.modelValue, (isVisible) => {
  if (isVisible) resetForDialog()
  else disposeSession()
})

onMounted(() => {
  refreshSources()
  window.addEventListener('storage', onStorage)
})

onUnmounted(() => {
  window.removeEventListener('storage', onStorage)
  disposeSession()
})

function onDialogClosed() {
  if (!closedByPlayback) disposeSession()
  closedByPlayback = false
}
</script>

<style scoped>
.custom-source-playback { display: flex; flex-direction: column; gap: 14px; }
.source-playback-track {
  display: flex; align-items: center; gap: 12px; min-width: 0; padding: 10px 12px;
  border: 1px solid var(--border-color); border-radius: 12px; background: color-mix(in srgb, var(--holo-primary) 5%, transparent);
}
.source-playback-track :deep(.cover) { width: 54px; height: 54px; border-radius: 9px; }
.source-playback-track-copy { display: flex; flex: 1; flex-direction: column; gap: 4px; min-width: 0; }
.source-playback-track-copy strong, .source-playback-track-copy span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.source-playback-track-copy strong { color: var(--text-main); font-size: 14px; }
.source-playback-track-copy span { color: var(--text-sub); font-size: 12px; }
.source-playback-info { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.source-playback-info > span { color: var(--text-sub); font-size: 11px; }
.source-playback-info small { color: var(--text-sub); font-size: 10px; line-height: 1.6; }
.source-playback-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.source-playback-source { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
.source-playback-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.source-playback-field > span { color: var(--text-sub); font-size: 11px; }
.source-playback-step {
  display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 14px;
  border: 1px solid color-mix(in srgb, var(--holo-primary) 20%, var(--border-color));
}
.source-playback-step-copy { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.source-playback-step-copy strong { color: var(--text-main); font-size: 12px; }
.source-playback-step-copy span { color: var(--text-sub); font-size: 11px; line-height: 1.65; }
.source-playback-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 24px 16px; text-align: center; }
.source-playback-empty > .el-icon { color: var(--holo-primary); font-size: 24px; }
.source-playback-empty strong { color: var(--text-main); font-size: 13px; }
.source-playback-empty span { color: var(--text-sub); font-size: 11px; }
.source-session-expired { color: var(--text-sub); font-size: 12px; }
.source-playback-error { margin-top: 2px; }
@media (max-width: 540px) {
  .source-playback-fields { grid-template-columns: 1fr; }
  .source-playback-step { align-items: stretch; flex-direction: column; }
}
</style>
