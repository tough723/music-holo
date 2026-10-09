<template>
  <div class="page">
    <div class="page-head">
      <div>
        <div class="page-title">歌单</div>
        <div class="page-subtitle">每一张歌单都是一场全息演出</div>
      </div>
      <div class="page-tools">
        <el-input
          v-model="keyword"
          placeholder="搜索歌单"
          clearable
          style="width: 220px"
          :prefix-icon="Search"
          @clear="loadData"
          @keyup.enter="loadData"
        />
        <el-checkbox v-if="userStore.isLogin" v-model="onlyMine" @change="loadData">只看我的</el-checkbox>
        <div v-if="userStore.isLogin" class="playlist-backup-actions">
          <button type="button" class="playlist-export-button" :disabled="exporting" @click="exportMyPlaylists">
            {{ exporting ? '正在导出…' : '导出我的歌单' }}
          </button>
          <a
            v-if="exportDownloadUrl"
            class="playlist-export-link"
            data-testid="playlist-export-download"
            :href="exportDownloadUrl"
            :download="exportFileName"
          >保存歌单备份</a>
          <el-button round type="primary" plain @click="fileInput?.click()">导入 JSON 备份</el-button>
          <input
            ref="fileInput"
            class="playlist-backup-file-input"
            type="file"
            accept=".json,application/json"
            aria-label="选择 Music Holo 歌单备份"
            @change="onBackupFileSelected"
          >
        </div>
      </div>
    </div>
    <p
      v-if="exportStatus"
      class="backup-export-status"
      role="status"
      aria-live="polite"
      data-testid="playlist-export-status"
    >
      {{ exportStatus }}
    </p>

    <div v-loading="loading" class="playlist-grid">
      <div
        v-for="pl in list"
        :key="pl.id"
        class="playlist-card glass-panel"
        @click="$router.push(`/playlists/${pl.id}`)"
      >
        <div class="playlist-cover">
          <Cover :src="pl.cover" :text="pl.name" :size="140" />
          <div class="playlist-mask">
            <el-icon><VideoPlay /></el-icon>
          </div>
          <div class="playlist-count">
            <el-icon><Headset /></el-icon> {{ pl.songCount || 0 }} 首
          </div>
        </div>
        <div class="playlist-name">{{ pl.name }}</div>
        <div class="playlist-desc">{{ pl.description || '暂无描述' }}</div>
        <div class="playlist-meta">
          <span>{{ pl.creatorName || '神秘人' }}</span>
          <el-tag v-if="pl.isPublic === 0" size="small" type="warning" effect="plain">私密</el-tag>
        </div>
      </div>
      <el-empty v-if="!loading && list.length === 0" description="没有找到相关歌单" />
    </div>

    <div class="pagination-wrap">
      <el-pagination
        v-model:current-page="pageNum"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[12, 24, 48]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="loadData"
        @size-change="loadData"
      />
    </div>

    <el-dialog
      v-model="backupPreviewVisible"
      title="歌单备份预览"
      width="min(840px, calc(100vw - 24px))"
      destroy-on-close
    >
      <el-alert type="info" :closable="false" show-icon class="backup-policy-alert">
        <template #title>导入会新建副本，不会覆盖现有歌单</template>
        <template #default>默认保持私密；同名歌单会自动改名。曲库找不到的歌曲会跳过，封面、歌词、音频地址、账号信息和音源脚本不在备份范围内。</template>
      </el-alert>
      <div v-if="backupPreview" class="backup-preview-summary">
        <span>{{ backupPreview.playlistCount }} 张歌单</span>
        <span>{{ backupPreview.matchedSongCount }} 首可直接匹配</span>
        <span>{{ backupPreview.ambiguousSongCount }} 首需确认</span>
        <span>{{ backupPreview.missingSongCount }} 首曲库未找到</span>
      </div>
      <div class="backup-selection-actions">
        <el-button text type="primary" @click="selectAllPlaylists(true)">全选</el-button>
        <el-button text @click="selectAllPlaylists(false)">清空选择</el-button>
      </div>
      <div class="backup-preview-list">
        <article v-for="item in backupPreview?.playlists || []" :key="item.index" class="backup-preview-item">
          <div class="backup-preview-header">
            <el-checkbox
              :model-value="selectedPlaylistIndexes.includes(item.index)"
              @change="(checked) => setPlaylistSelected(item.index, checked)"
            >
              <strong>{{ item.name }}</strong>
            </el-checkbox>
            <el-tag v-if="item.nameConflict" size="small" type="warning" effect="plain">同名将另存为「{{ item.suggestedName }}」</el-tag>
          </div>
          <p class="backup-preview-description">{{ item.description || '暂无描述' }}</p>
          <div class="backup-preview-counts">
            <span>{{ item.totalSongCount }} 首</span>
            <span>{{ item.matchedSongCount }} 首自动匹配</span>
            <span v-if="item.ambiguousSongCount">{{ item.ambiguousSongCount }} 首多候选</span>
            <span v-if="item.missingSongCount">{{ item.missingSongCount }} 首未找到</span>
          </div>
          <el-checkbox
            :model-value="publicPlaylistIndexes.includes(item.index)"
            :disabled="!selectedPlaylistIndexes.includes(item.index)"
            class="backup-public-option"
            @change="(checked) => setPlaylistPublic(item.index, checked)"
          >
            导入后公开此歌单
          </el-checkbox>
          <div v-if="item.tracks.some((track) => track.status !== 'matched')" class="backup-track-resolution">
            <div
              v-for="track in item.tracks.filter((row) => row.status !== 'matched')"
              :key="`${item.index}:${track.index}`"
              class="backup-track-row"
            >
              <div class="backup-track-copy">
                <strong>{{ track.title }}</strong>
                <span>{{ [track.singerName, track.album].filter(Boolean).join(' · ') || '未提供歌手/专辑信息' }}</span>
              </div>
              <el-select
                v-if="track.status === 'ambiguous'"
                :model-value="trackChoices[`${item.index}:${track.index}`] || ''"
                clearable
                filterable
                placeholder="选择正确曲目；留空则跳过"
                class="backup-track-select"
                @change="(songId) => setTrackChoice(item.index, track.index, songId)"
              >
                <el-option
                  v-for="candidate in track.candidates"
                  :key="candidate.id"
                  :label="`${candidate.title} — ${candidate.singerName || '未知歌手'}${candidate.album ? ` · ${candidate.album}` : ''}`"
                  :value="candidate.id"
                />
              </el-select>
              <el-tag v-else size="small" type="info" effect="plain">曲库未找到，将跳过</el-tag>
            </div>
          </div>
        </article>
      </div>
      <template #footer>
        <el-button @click="backupPreviewVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="importing"
          :disabled="selectedPlaylistIndexes.length === 0"
          @click="importSelectedPlaylists"
        >
          导入已选 {{ selectedPlaylistIndexes.length }} 张
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as playlistApi from '@/api/playlist'
import { useUserStore } from '@/store/user'
import Cover from '@/components/Cover.vue'
import { MAX_PLAYLIST_BACKUP_BYTES, parsePlaylistBackup, serializePlaylistBackup } from '@/utils/playlistBackup'

const userStore = useUserStore()

const loading = ref(false)
const list = ref([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(12)
const keyword = ref('')
const onlyMine = ref(false)
const fileInput = ref(null)
const exporting = ref(false)
const exportStatus = ref('')
const exportDownloadUrl = ref('')
const exportFileName = ref('')
const importing = ref(false)
const backupPreviewVisible = ref(false)
const pendingBackup = ref(null)
const backupPreview = ref(null)
const selectedPlaylistIndexes = ref([])
const publicPlaylistIndexes = ref([])
const trackChoices = ref({})

const loadData = async () => {
  loading.value = true
  try {
    const res = await playlistApi.page({
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      keyword: keyword.value || undefined,
      onlyMine: onlyMine.value || undefined
    })
    list.value = res.records || []
    total.value = res.total || 0
  } finally {
    loading.value = false
  }
}

const revokeExportDownload = () => {
  if (!exportDownloadUrl.value) return
  URL.revokeObjectURL(exportDownloadUrl.value)
  exportDownloadUrl.value = ''
  exportFileName.value = ''
}

const exportMyPlaylists = async () => {
  exporting.value = true
  exportStatus.value = '正在生成歌单备份…'
  try {
    const backup = await playlistApi.exportBackup()
    const json = serializePlaylistBackup(backup)
    const sanitized = parsePlaylistBackup(json)
    revokeExportDownload()
    if (sanitized.playlists.length === 0) {
      exportStatus.value = '当前账号没有可导出的歌单'
      ElMessage.info(exportStatus.value)
      return
    }
    // Keep the file behind a real user-activated link. A programmatic click after the
    // async export is not a reliable browser download and can be dropped silently.
    exportFileName.value = `music-holo-playlists-${new Date().toISOString().slice(0, 10)}.json`
    exportDownloadUrl.value = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }))
    exportStatus.value = `已生成 ${sanitized.playlists.length} 张歌单备份，请保存文件`
    ElMessage.success(exportStatus.value)
  } catch (error) {
    revokeExportDownload()
    exportStatus.value = error?.name === 'PlaylistBackupError'
      ? error.message
      : `导出失败：${error?.message || '请稍后重试'}`
    ElMessage.error(exportStatus.value)
  } finally {
    exporting.value = false
  }
}

onBeforeUnmount(revokeExportDownload)

const onBackupFileSelected = async (event) => {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (file.size > MAX_PLAYLIST_BACKUP_BYTES) {
    ElMessage.warning('歌单备份文件不能超过 2 MB')
    return
  }
  try {
    const backup = parsePlaylistBackup(await file.text())
    if (backup.playlists.length === 0) {
      ElMessage.warning('备份中没有歌单')
      return
    }
    importing.value = true
    const preview = await playlistApi.previewBackup(backup)
    pendingBackup.value = backup
    backupPreview.value = preview
    selectedPlaylistIndexes.value = preview.playlists.map((item) => item.index)
    publicPlaylistIndexes.value = []
    trackChoices.value = {}
    backupPreviewVisible.value = true
  } catch (error) {
    if (error?.name === 'PlaylistBackupError') ElMessage.error(error.message)
  } finally {
    importing.value = false
  }
}

const selectAllPlaylists = (selectAll) => {
  selectedPlaylistIndexes.value = selectAll
    ? (backupPreview.value?.playlists || []).map((item) => item.index)
    : []
  if (!selectAll) publicPlaylistIndexes.value = []
}

const setPlaylistSelected = (index, checked) => {
  if (checked && !selectedPlaylistIndexes.value.includes(index)) {
    selectedPlaylistIndexes.value = [...selectedPlaylistIndexes.value, index].sort((a, b) => a - b)
  } else if (!checked) {
    selectedPlaylistIndexes.value = selectedPlaylistIndexes.value.filter((item) => item !== index)
    publicPlaylistIndexes.value = publicPlaylistIndexes.value.filter((item) => item !== index)
  }
}

const setPlaylistPublic = (index, checked) => {
  if (checked && !publicPlaylistIndexes.value.includes(index)) {
    publicPlaylistIndexes.value = [...publicPlaylistIndexes.value, index].sort((a, b) => a - b)
  } else if (!checked) {
    publicPlaylistIndexes.value = publicPlaylistIndexes.value.filter((item) => item !== index)
  }
}

const setTrackChoice = (playlistIndex, trackIndex, songId) => {
  const key = `${playlistIndex}:${trackIndex}`
  const next = { ...trackChoices.value }
  if (songId) next[key] = songId
  else delete next[key]
  trackChoices.value = next
}

const importSelectedPlaylists = async () => {
  if (!pendingBackup.value || selectedPlaylistIndexes.value.length === 0) return
  const publicCount = publicPlaylistIndexes.value.length
  try {
    await ElMessageBox.confirm(
      `将新建 ${selectedPlaylistIndexes.value.length} 张歌单，其中 ${publicCount} 张会公开；现有歌单不会被覆盖。曲库缺失或未确认的歧义曲目会跳过。继续吗？`,
      '确认导入歌单',
      { confirmButtonText: '创建歌单副本', cancelButtonText: '返回检查', type: 'warning' }
    )
  } catch {
    return
  }

  importing.value = true
  try {
    const choices = Object.entries(trackChoices.value)
      .filter(([, songId]) => songId)
      .map(([key, songId]) => {
        const [playlistIndex, trackIndex] = key.split(':').map(Number)
        return { playlistIndex, trackIndex, songId }
      })
    const result = await playlistApi.importBackup({
      backup: pendingBackup.value,
      selectedPlaylistIndexes: [...selectedPlaylistIndexes.value].sort((a, b) => a - b),
      publicPlaylistIndexes: [...publicPlaylistIndexes.value].sort((a, b) => a - b),
      trackChoices: choices
    })
    backupPreviewVisible.value = false
    const skipped = Number(result.missingSongCount || 0) + Number(result.ambiguousSkippedCount || 0)
    ElMessage.success(`已导入 ${result.importedPlaylistCount} 张歌单和 ${result.importedSongCount} 首歌曲${skipped ? `，另跳过 ${skipped} 首未匹配曲目` : ''}`)
    await loadData()
  } finally {
    importing.value = false
  }
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
  flex-wrap: wrap;
  gap: 12px;
}
.page-tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 12px;
}
.backup-export-status {
  margin: -6px 0 0 auto;
  color: var(--text-sub);
  font-size: 12px;
}
.playlist-backup-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.playlist-export-button,
.playlist-export-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 0 16px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: color-mix(in srgb, var(--holo-primary) 8%, transparent);
  color: var(--text-main);
  font: inherit;
  font-size: 13px;
  line-height: 1;
  text-decoration: none;
  cursor: pointer;
}
.playlist-export-button:disabled {
  cursor: progress;
  opacity: 0.65;
}
.playlist-export-link {
  border-color: color-mix(in srgb, var(--holo-primary) 58%, var(--border-color));
  color: var(--holo-primary);
}
.playlist-export-button:hover:not(:disabled),
.playlist-export-link:hover {
  box-shadow: 0 0 16px var(--holo-glow);
}
.playlist-backup-file-input {
  display: none;
}
.backup-policy-alert {
  margin-bottom: 12px;
}
.backup-preview-summary,
.backup-preview-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  color: var(--text-sub);
  font-size: 12px;
}
.backup-preview-summary {
  padding: 10px 2px;
  color: var(--text-main);
}
.backup-selection-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  border-bottom: 1px solid var(--border-color);
  padding: 4px 0 8px;
}
.backup-preview-list {
  display: grid;
  gap: 10px;
  max-height: min(54vh, 520px);
  overflow: auto;
  padding: 10px 2px;
}
.backup-preview-item {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: color-mix(in srgb, var(--holo-primary) 3%, transparent);
}
.backup-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}
.backup-preview-description {
  margin: 4px 0 8px 24px;
  color: var(--text-sub);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.backup-public-option {
  margin: 8px 0 0 24px;
}
.backup-track-resolution {
  display: grid;
  gap: 8px;
  margin: 10px 0 0 24px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-color);
}
.backup-track-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}
.backup-track-copy {
  display: grid;
  min-width: 120px;
  gap: 3px;
  font-size: 12px;
}
.backup-track-copy span {
  color: var(--text-sub);
  overflow-wrap: anywhere;
}
.backup-track-select {
  flex: 1 1 260px;
  max-width: 420px;
}
.playlist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  min-height: 200px;
}
.playlist-card {
  padding: 14px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}
.playlist-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px var(--holo-glow);
}
.playlist-cover {
  position: relative;
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
}
.playlist-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  color: #fff;
  background: rgba(5, 8, 22, 0.45);
  opacity: 0;
  transition: opacity 0.2s;
}
.playlist-card:hover .playlist-mask {
  opacity: 1;
}
.playlist-count {
  position: absolute;
  right: 8px;
  bottom: 8px;
  font-size: 11px;
  color: #fff;
  background: rgba(5, 8, 22, 0.6);
  border-radius: 999px;
  padding: 2px 8px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.playlist-name {
  margin-top: 10px;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.playlist-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-sub);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.playlist-meta {
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-sub);
}
.pagination-wrap {
  display: flex;
  justify-content: center;
}
</style>
