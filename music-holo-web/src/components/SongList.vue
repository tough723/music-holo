<template>
  <div class="song-list-root">
  <el-table
    v-loading="loading"
    :data="songs"
    class="song-table"
    :row-class-name="rowClassName"
    @row-click="onRowClick"
  >
    <el-table-column v-if="selectable" width="52" align="center">
      <template #header>
        <input
          class="row-select"
          type="checkbox"
          :checked="pageSelection.all"
          :indeterminate="pageSelection.indeterminate"
          aria-label="选择本页歌曲"
          @click.stop
          @change="emit('toggle-page', songs)"
        >
      </template>
      <template #default="{ row }">
        <input
          class="row-select"
          type="checkbox"
          :checked="isSelected(row)"
          :aria-label="`选择《${row.title}》`"
          :data-testid="`select-song-${row.id}`"
          @click.stop
          @change="emit('toggle-select', row)"
        >
      </template>
    </el-table-column>

    <el-table-column type="index" width="56" align="center">
      <template #default="{ $index }">
        <span class="row-index">{{ $index + 1 }}</span>
      </template>
    </el-table-column>

    <el-table-column label="歌曲" min-width="260">
      <template #default="{ row, $index }">
        <div class="song-cell">
          <div class="song-cover" @click.stop="emit('play', row, props.songs.indexOf(row))">
            <Cover :src="row.cover" :text="row.title" :size="44" />
            <div class="cover-mask">
              <el-icon><VideoPlay /></el-icon>
            </div>
          </div>
          <div class="song-meta">
            <div class="song-title" :class="{ active: isCurrent(row) }">
              {{ row.title }}
              <el-icon v-if="isCurrent(row) && playing" class="playing-icon"><CaretRight /></el-icon>
            </div>
            <div class="song-artist">{{ row.singerName || '-' }}</div>
            <slot name="meta" :row="row" :index="$index"></slot>
          </div>
          <button
            v-if="canDislike(row)"
            type="button"
            class="dislike-link"
            :aria-pressed="dislikeStore.hasSong(row.id) ? 'true' : 'false'"
            :aria-label="dislikeStore.hasSong(row.id) ? `取消不喜欢《${row.title}》` : `不喜欢《${row.title}》`"
            :data-testid="`dislike-song-${row.id}`"
            :data-disliked="dislikeStore.hasSong(row.id) ? 'true' : 'false'"
            @click.stop="toggleDislike(row)"
          >{{ dislikeStore.hasSong(row.id) ? '已不喜欢' : '不喜欢' }}</button>
        </div>
      </template>
    </el-table-column>

    <el-table-column v-if="showCategory" label="分类" width="100" align="center">
      <template #default="{ row }">
        <el-tag size="small" effect="plain">{{ row.categoryName || '-' }}</el-tag>
      </template>
    </el-table-column>

    <el-table-column v-if="showAlbum" label="专辑" min-width="140" show-overflow-tooltip>
      <template #default="{ row }">
        <button
          v-if="row.album"
          type="button"
          class="album-link"
          :aria-label="`打开专辑《${row.album}》`"
          @click.stop="openAlbum(row)"
        >{{ row.album }}</button>
        <span v-else>-</span>
      </template>
    </el-table-column>

    <el-table-column label="时长" width="80" align="center">
      <template #default="{ row }">{{ fmtDuration(row.duration) }}</template>
    </el-table-column>

    <el-table-column v-if="showPlayCount" label="播放量" width="100" align="center">
      <template #default="{ row }">{{ fmtCount(row.playCount) }}</template>
    </el-table-column>

    <el-table-column v-if="showHistory" label="最近播放" width="180" align="center">
      <template #default="{ row }">
        <div class="history-cell">
          <span>{{ fmtDateTime(row.lastPlayedAt) || '—' }}</span>
          <small>个人收听 {{ row.personalPlayCount || 0 }} 次</small>
        </div>
      </template>
    </el-table-column>

    <el-table-column label="操作" :width="(showHistory ? 224 : 190) + (hasCustomSources ? 40 : 0) + 40" align="center" fixed="right">
      <template #default="{ row, $index }">
        <el-tooltip content="播放" placement="top">
          <el-button circle size="small" :aria-label="`播放《${row.title}》`" @click.stop="emit('play', row, $index)">
            <el-icon><VideoPlay /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip v-if="!hideFavorite" :content="isFavorite(row) ? '取消收藏' : '收藏'" placement="top">
          <el-button
            circle
            size="small"
            :type="isFavorite(row) ? 'danger' : 'default'"
            :plain="!isFavorite(row)"
            :aria-label="isFavorite(row) ? `取消收藏《${row.title}》` : `收藏《${row.title}》`"
            @click.stop="emit('toggle-favorite', row)"
          >
            <el-icon><StarFilled v-if="isFavorite(row)" /><Star v-else /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip content="查看短评" placement="top">
          <el-button circle size="small" :aria-label="`短评《${row.title}》`" @click.stop="openReview(row)">
            <el-icon><ChatDotRound /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip content="使用本机自定义源解析并播放" placement="top">
          <el-button
            v-if="hasCustomSources"
            circle
            size="small"
            :aria-label="`使用自定义源播放《${row.title}》`"
            :data-testid="`custom-source-play-${row.id}`"
            @click.stop="openCustomSourcePlayback(row)"
          >
            <el-icon><Connection /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip content="下一首播放（排在当前曲目之后）" placement="top">
          <el-button circle size="small" :aria-label="`排到下一首：《${row.title}》`" @click.stop="playNext(row)">
            <el-icon><DArrowRight /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip content="加入播放队列" placement="top">
          <el-button circle size="small" :aria-label="`加入播放队列《${row.title}》`" @click.stop="emit('add-queue', row)">
            <el-icon><Plus /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip content="快速换源：换一个可用的音源播放" placement="top">
          <el-button circle size="small" :aria-label="`换源播放《${row.title}》`" @click.stop="switchSource(row)">
            <el-icon><Switch /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip :content="downloadTooltip(row)" placement="top">
          <el-button
            circle
            size="small"
            :aria-label="`下载《${row.title}》`"
            :data-testid="`download-song-${row.id}`"
            @click.stop="downloadSong(row)"
          >
            <el-icon><Download /></el-icon>
          </el-button>
        </el-tooltip>
        <slot name="actions" :row="row" :index="$index"></slot>
      </template>
    </el-table-column>
  </el-table>
  <p class="dislike-status" role="status" data-testid="dislike-status">{{ dislikeStatus }}</p>
  <el-dialog
    v-model="reviewVisible"
    :title="activeReviewSong ? `《${activeReviewSong.title}》的短评` : '歌曲短评'"
    width="min(760px, calc(100vw - 32px))"
    append-to-body
    destroy-on-close
  >
    <ReviewPanel
      v-if="activeReviewSong"
      target-type="song"
      :target-id="activeReviewSong.id"
      :target-title="activeReviewSong.title"
    />
  </el-dialog>
  <CustomSourcePlaybackDialog
    v-if="customSourceDialogVisible"
    v-model="customSourceDialogVisible"
    :song="customSourceSong"
  />
  <SourceSwitchDialog v-model="switchDialogVisible" :song="switchDialogSong" />
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '@/store/player'
import { useUserStore } from '@/store/user'
import { useDislikeStore } from '@/store/dislike'
import { useDownloadStore } from '@/store/downloads'
import ReviewPanel from './ReviewPanel.vue'
import { fmtDuration, fmtCount, fmtDateTime } from '@/utils/format'
import { pageSelectionState } from '@/utils/songSelection'
import { customSourceStorageKeyForOwner, readCustomSources } from '@/utils/customSources'
import Cover from './Cover.vue'

const CustomSourcePlaybackDialog = defineAsyncComponent(() => import('./CustomSourcePlaybackDialog.vue'))
const SourceSwitchDialog = defineAsyncComponent(() => import('./SourceSwitchDialog.vue'))

const props = defineProps({
  songs: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  showCategory: { type: Boolean, default: true },
  showAlbum: { type: Boolean, default: false },
  showPlayCount: { type: Boolean, default: true },
  showHistory: { type: Boolean, default: false },
  /** 收藏的歌曲 id 集合 */
  favoriteIds: { type: Array, default: () => [] },
  /** 隐藏收藏按钮（如管理后台） */
  hideFavorite: { type: Boolean, default: false },
  /** 隐藏不喜欢按钮（本地队列或管理视图） */
  hideDislike: { type: Boolean, default: false },
  /** 歌曲库跨页多选；搜索、排行榜和管理后台不开启 */
  selectable: { type: Boolean, default: false },
  selectedIds: { type: Array, default: () => [] }
})

const emit = defineEmits(['play', 'toggle-favorite', 'add-queue', 'toggle-select', 'toggle-page'])

const playerStore = usePlayerStore()
const userStore = useUserStore()
const dislikeStore = useDislikeStore()
const downloadStore = useDownloadStore()
const router = useRouter()
const sourceOwner = computed(() => userStore.userInfo?.id ?? userStore.userInfo?.username ?? 'local')
const sourceStorageKey = computed(() => customSourceStorageKeyForOwner(sourceOwner.value))
const localCustomSources = ref([])
const hasCustomSources = computed(() => localCustomSources.value.length > 0)
const customSourceDialogVisible = ref(false)
const customSourceSong = ref(null)
const playing = computed(() => playerStore.playing)
const reviewVisible = ref(false)
const activeReviewSong = ref(null)
const dislikeStatus = ref('')

function refreshCustomSources() {
  localCustomSources.value = readCustomSources(globalThis.localStorage, sourceStorageKey.value)
}

function onCustomSourcesStorage(event) {
  if (event.key !== null && event.key !== sourceStorageKey.value) return
  refreshCustomSources()
}

watch(sourceStorageKey, refreshCustomSources, { immediate: true })
onMounted(() => window.addEventListener('storage', onCustomSourcesStorage))
onUnmounted(() => window.removeEventListener('storage', onCustomSourcesStorage))

function openAlbum(song) {
  if (!song?.album) return
  router.push({
    name: 'AlbumDetail',
    query: {
      album: song.album,
      ...(song.singerId ? { singerId: song.singerId } : {})
    }
  })
}

function openReview(song) {
  activeReviewSong.value = song
  reviewVisible.value = true
}

function openCustomSourcePlayback(song) {
  refreshCustomSources()
  if (!hasCustomSources.value) return
  customSourceSong.value = song
  customSourceDialogVisible.value = true
}

const switchDialogVisible = ref(false)
const switchDialogSong = ref(null)

/** 换源不要求已有地址：即使当前曲目失效，也可以重新找可用音源。 */
function switchSource(row) {
  switchDialogSong.value = row
  switchDialogVisible.value = true
}

/** 下载必须先有可播放地址：优先自定义源解析结果，其次曲库音频地址。 */
function downloadTooltip(row) {
  return row?.audioUrl ? `下载《${row.title}》` : `《${row.title}》还没有可下载地址，可先用自定义源解析后再下载`
}

function downloadSong(row) {
  if (!row?.audioUrl) {
    ElMessage.warning('这首歌还没有音频地址；请先用自定义源解析播放，或选择已有直链的曲目')
    return
  }
  const created = downloadStore.enqueue({
    song: { ...row },
    url: row.audioUrl,
    quality: row.sourceQuality || row.quality || '',
    sourcePlatform: row.sourcePlatform || '',
    sourceName: row.sourceName || ''
  })
  if (created.length) ElMessage.success(`已加入下载队列：${row.title}`)
  else ElMessage.warning(downloadStore.statusMessage || '无法加入下载队列')
}

function canDislike(row) {
  return !props.hideDislike && row && !row.isLocal && row.id != null && row.id !== ''
}

async function toggleDislike(row) {
  if (!canDislike(row)) return
  if (!userStore.isLogin) {
    dislikeStatus.value = '请先登录后再设置不喜欢'
    ElMessage.warning(dislikeStatus.value)
    router.push('/login')
    return
  }
  try {
    if (dislikeStore.hasSong(row.id)) {
      await dislikeStore.removeSong(row.id)
      dislikeStatus.value = `已取消不喜欢《${row.title}》`
    } else {
      await dislikeStore.addSong(row)
      dislikeStatus.value = `已不喜欢《${row.title}》，自动切歌和推荐会跳过`
    }
    ElMessage.success(dislikeStatus.value)
  } catch (err) {
    dislikeStatus.value = err?.msg || err?.message || '不喜欢设置失败'
  }
}

function playNext(song) {
  const status = playerStore.playNext(song)
  const title = song?.title || '这首歌曲'
  if (status === 'invalid') {
    ElMessage.warning('无法安排这首歌曲，请重试')
  } else if (status === 'current') {
    ElMessage.info(`《${title}》已经正在播放`)
  } else if (status === 'already-next') {
    ElMessage.info(`《${title}》已经排在下一首`)
  } else if (status === 'moved') {
    ElMessage.success(`已将《${title}》调整为下一首播放`)
  } else {
    ElMessage.success(`已将《${title}》排为下一首播放`)
  }
}

const favSet = computed(() => new Set(props.favoriteIds))
const isFavorite = (row) => !props.hideFavorite && favSet.value.has(row.id)
const isCurrent = (row) => playerStore.currentSong?.id === row.id || playerStore.currentSong?.sourceSongId === row.id

const rowClassName = ({ row }) => (isCurrent(row) ? 'current-row' : '')
const isSelected = (row) => props.selectedIds.some((id) => id != null && String(id) === String(row?.id))
const pageSelection = computed(() => pageSelectionState(props.selectedIds.map((id) => ({ id })), props.songs))
// el-table 的 row-click 回调为 (row, column, event)，不含行号，这里手动计算
const onRowClick = (row, _column, event) => {
  if (event?.target?.closest?.('input, button, a, .dislike-link, .album-link')) return
  emit('play', row, props.songs.indexOf(row))
}
</script>

<style scoped>
.song-table {
  width: 100%;
  overflow: hidden;
  border-radius: 14px;
  transform-style: preserve-3d;
  filter: drop-shadow(0 16px 24px rgba(0, 0, 0, 0.14));
}
.song-table :deep(.el-table__inner-wrapper) {
  border-radius: inherit;
}
.song-table :deep(th.el-table__cell) {
  background: linear-gradient(180deg, rgba(148, 163, 184, 0.1), rgba(148, 163, 184, 0.035));
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.045) inset;
}
.song-table :deep(.el-table__row) {
  transform-style: preserve-3d;
  transition: transform 0.18s ease, filter 0.18s ease;
}
.song-table :deep(.el-table__row:hover) {
  transform: translateZ(5px);
  filter: drop-shadow(0 8px 9px rgba(0, 0, 0, 0.2));
}
.song-table :deep(.el-table__row:hover td) {
  background: color-mix(in srgb, var(--holo-primary) 7%, transparent);
}
.song-table :deep(.current-row) {
  --el-table-tr-bg-color: color-mix(in srgb, var(--holo-primary) 10%, transparent);
}
.row-index {
  color: var(--text-sub);
}
.row-select {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--holo-primary);
  cursor: pointer;
}
.song-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}
.song-cover {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  flex-shrink: 0;
}
.cover-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 8, 22, 0.45);
  color: #fff;
  font-size: 18px;
  opacity: 0;
  transition: opacity 0.2s;
}
.song-cover:hover .cover-mask {
  opacity: 1;
}
.song-meta {
  min-width: 0;
}
.song-title {
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.song-title.active {
  color: var(--holo-primary);
}
.playing-icon {
  animation: blink 1s ease-in-out infinite;
}
.song-artist {
  font-size: 12px;
  color: var(--text-sub);
  margin-top: 2px;
}
.dislike-link {
  flex: 0 0 auto;
  margin-left: auto;
  padding: 2px 8px;
  border: 1px solid var(--el-border-color);
  border-radius: 999px;
  background: transparent;
  color: var(--text-sub);
  font: inherit;
  font-size: 12px;
  line-height: 20px;
  cursor: pointer;
}
.dislike-link[data-disliked='true'] {
  color: var(--el-color-danger);
  border-color: var(--el-color-danger-light-5);
}
.dislike-link:focus-visible {
  outline: 2px solid var(--holo-primary);
  outline-offset: 2px;
}
.dislike-status {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
.album-link {
  max-width: 100%;
  padding: 0;
  border: 0;
  color: var(--text-sub);
  background: transparent;
  font: inherit;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: color 0.16s ease, text-shadow 0.16s ease;
}
.album-link:hover {
  color: var(--holo-primary);
  text-shadow: 0 0 10px var(--holo-glow);
}
.album-link:focus-visible {
  outline: 2px solid var(--holo-primary);
  outline-offset: 2px;
}
.history-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}
.history-cell small {
  color: var(--text-sub);
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>
