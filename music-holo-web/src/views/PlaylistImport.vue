<template>
  <div class="page">
    <div class="page-head">
      <div>
        <div class="page-title">歌单导入</div>
        <div class="page-subtitle">从公开链接或文本清单导入第三方平台曲目，导入后走自定义音源或平台直链播放</div>
      </div>
    </div>

    <el-tabs v-model="mode" class="import-tabs">
      <el-tab-pane label="链接导入" name="link">
        <div class="glass-panel import-panel">
          <div class="import-row">
            <el-input
              v-model="link"
              placeholder="粘贴网易云 / 酷我 / 咪咕 歌单链接，或直接填歌单 ID"
              clearable
              @keyup.enter="importLink"
            />
            <el-select v-if="!autoPlatform" v-model="forcedPlatform" placeholder="指定平台" clearable class="platform-select">
              <el-option v-for="item in PLAYLIST_IMPORT_PLATFORMS" :key="item.key" :label="item.name" :value="item.key" />
            </el-select>
            <el-button type="primary" round :loading="loading" @click="importLink">
              <el-icon><Download /></el-icon> 解析歌单
            </el-button>
          </div>
          <div class="platform-hints">
            <el-tag v-for="item in PLAYLIST_IMPORT_PLATFORMS" :key="item.key" size="small" effect="plain" :type="item.verified ? 'success' : 'info'">
              {{ item.name }}：{{ item.hint }}{{ item.verified ? '（已实测）' : '（未实测）' }}
            </el-tag>
          </div>
          <p v-if="message" class="import-message">{{ message }}</p>
        </div>
      </el-tab-pane>

      <el-tab-pane label="文本清单" name="text">
        <div class="glass-panel import-panel">
          <el-input
            v-model="listText"
            type="textarea"
            :rows="6"
            placeholder="每行一条，格式：歌名 - 歌手（歌手可省略）"
          />
          <div class="import-row">
            <el-select v-model="listPlatform" class="platform-select">
              <el-option v-for="item in SEARCH_PLATFORMS" :key="item.key" :label="item.name" :value="item.key" />
            </el-select>
            <el-button type="primary" round :loading="loading" @click="importText">
              <el-icon><Search /></el-icon> 解析清单
            </el-button>
          </div>
          <p class="import-hint">文本清单会逐条调用平台搜索接口解析为真实曲目 ID，失败条目会单独列出。</p>
        </div>
      </el-tab-pane>
    </el-tabs>

    <div v-if="tracks.length" class="glass-panel import-panel">
      <div class="result-head">
        <strong>{{ playlistName || '导入结果' }}</strong>
        <span class="result-count">共 {{ tracks.length }} 首<template v-if="!verified">（该平台端点未在本机实测）</template></span>
        <div class="page-tools">
          <el-button round :disabled="!tracks.length" @click="addToQueue">加入播放队列</el-button>
          <el-button type="primary" round :disabled="!tracks.length" @click="downloadAll">全部下载</el-button>
        </div>
      </div>
      <el-table :data="tracks" height="420px" @selection-change="selection = $event">
        <el-table-column type="selection" width="46" />
        <el-table-column label="曲目" min-width="200">
          <template #default="{ row }">
            <strong>{{ row.name }}</strong>
            <small class="row-sub">{{ row.singer || '未知歌手' }} · {{ row.platform.toUpperCase() }}</small>
          </template>
        </el-table-column>
        <el-table-column label="专辑" min-width="160" prop="album" show-overflow-tooltip />
        <el-table-column label="平台曲目 ID" min-width="180">
          <template #default="{ row }">
            <code class="row-id">{{ row.musicInfo?.songmid || row.musicInfo?.id || '—' }}</code>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button size="small" round @click="playWithCustomSource(row)">用自定义源播放</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="failedEntries.length" class="failed-block">
        <strong>以下条目未能解析：</strong>
        <ul>
          <li v-for="(entry, index) in failedEntries" :key="index">{{ entry.title }}<template v-if="entry.artist"> - {{ entry.artist }}</template>：{{ entry.error }}</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, Search } from '@element-plus/icons-vue'
import { PLAYLIST_IMPORT_PLATFORMS, importPlaylistByLink, importTrackListText, parsePlaylistLink } from '@/utils/playlistImport'
import { usePlayerStore } from '@/store/player'
import { useDownloadStore } from '@/store/downloads'
import { resolvePlatformTrackUrl } from '@/utils/sourceCatalog'

const playerStore = usePlayerStore()
const downloadStore = useDownloadStore()
const SEARCH_PLATFORMS = [
  { key: 'wy', name: '网易云音乐' },
  { key: 'kw', name: '酷我音乐' },
  { key: 'kg', name: '酷狗音乐' },
  { key: 'mg', name: '咪咕音乐' }
]

const mode = ref('link')
const link = ref('')
const loading = ref(false)
const message = ref('')
const tracks = ref([])
const selection = ref([])
const playlistName = ref('')
const verified = ref(true)
const failedEntries = ref([])
const listText = ref('')
const listPlatform = ref('wy')
const forcedPlatform = ref('')
const autoPlatform = computed(() => parsePlaylistLink(link.value)?.platform || '')

async function importLink() {
  if (loading.value) return
  loading.value = true
  message.value = ''
  try {
    const result = await importPlaylistByLink(link.value, { platform: forcedPlatform.value || undefined })
    tracks.value = result.tracks || []
    playlistName.value = result.name || '导入结果'
    verified.value = result.verified !== false
    failedEntries.value = []
    if (!tracks.value.length) message.value = '歌单里没有解析出可用曲目'
  } catch (error) {
    tracks.value = []
    message.value = String(error?.message || error)
  } finally {
    loading.value = false
  }
}

async function importText() {
  if (loading.value) return
  loading.value = true
  try {
    const result = await importTrackListText(listText.value, { platform: listPlatform.value })
    tracks.value = result.tracks || []
    failedEntries.value = result.failed || []
    playlistName.value = '文本清单导入'
    verified.value = true
  } catch (error) {
    message.value = String(error?.message || error)
  } finally {
    loading.value = false
  }
}

/** 把导入的曲目变成可播放（需要自定义源解析或平台直链），再交给播放器。 */
function toQueueItem(track) {
  return {
    id: `import-${track.platform}-${track.musicInfo?.songmid || track.musicInfo?.id || Math.random().toString(36).slice(2)}`,
    title: track.name,
    singerName: track.singer || '未知歌手',
    album: track.album || '',
    duration: Number(track.duration) || 0,
    cover: '',
    audioUrl: '',
    musicInfo: track.musicInfo,
    platform: track.platform,
    isImport: true
  }
}

function addToQueue() {
  const items = selection.value.length ? selection.value : tracks.value
  if (!items.length) return
  playerStore.addSongs?.(items.map(toQueueItem))
  ElMessage.success(`已加入 ${items.length} 首到播放队列`)
}

async function downloadAll() {
  const items = selection.value.length ? selection.value : tracks.value
  let queued = 0
  for (const track of items.slice(0, 30)) {
    try {
      // 先尝试平台公开直链；失败则如实跳过，不静默伪造地址。
      const url = await resolvePlatformTrackUrl(track.platform, track, { quality: '320k' })
      const created = downloadStore.enqueue({ song: toQueueItem(track), url, quality: '320k', sourcePlatform: track.platform })
      queued += created.length
    } catch {
      // 平台没有公开直链时交由用户用自定义源解析后下载。
    }
  }
  if (queued) ElMessage.success(`已加入 ${queued} 个下载任务`)
  else ElMessage.warning('这些曲目没有可用的公开直链；请先用自定义源解析后再下载')
}

function playWithCustomSource(row) {
  const item = toQueueItem(row)
  if (!item.audioUrl) {
    ElMessage.info('该曲目需要先解析音频地址：请在歌曲列表中使用「自定义源播放」，或在下载中心下载后播放')
    return
  }
  playerStore.playSong(item)
}
</script>

<style scoped>
.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.page-tools {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.import-tabs {
  margin-bottom: 14px;
}
.import-panel {
  padding: 16px 18px;
  margin-bottom: 14px;
}
.import-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 10px;
}
.platform-select {
  width: 180px;
}
.platform-hints {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.import-message {
  margin: 12px 0 0;
  color: var(--holo-primary);
  font-size: 13px;
}
.import-hint {
  margin: 10px 0 0;
  color: var(--text-sub);
  font-size: 12px;
}
.result-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.result-count {
  color: var(--text-sub);
  font-size: 12px;
}
.row-sub {
  display: block;
  color: var(--text-sub);
  font-size: 12px;
}
.row-id {
  font-size: 12px;
}
.failed-block {
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-sub);
}
.failed-block ul {
  margin: 6px 0 0;
  padding-left: 18px;
}
</style>
