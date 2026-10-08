<template>
  <el-table
    v-loading="loading"
    :data="songs"
    class="song-table"
    :row-class-name="rowClassName"
    @row-click="onRowClick"
  >
    <el-table-column type="index" width="56" align="center">
      <template #default="{ $index }">
        <span class="row-index">{{ $index + 1 }}</span>
      </template>
    </el-table-column>

    <el-table-column label="歌曲" min-width="260">
      <template #default="{ row }">
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
          </div>
        </div>
      </template>
    </el-table-column>

    <el-table-column v-if="showCategory" label="分类" width="100" align="center">
      <template #default="{ row }">
        <el-tag size="small" effect="plain">{{ row.categoryName || '-' }}</el-tag>
      </template>
    </el-table-column>

    <el-table-column v-if="showAlbum" label="专辑" min-width="140" show-overflow-tooltip>
      <template #default="{ row }">{{ row.album || '-' }}</template>
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

    <el-table-column label="操作" :width="showHistory ? 184 : 150" align="center" fixed="right">
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
        <el-tooltip content="加入播放队列" placement="top">
          <el-button circle size="small" :aria-label="`加入播放队列《${row.title}》`" @click.stop="emit('add-queue', row)">
            <el-icon><Plus /></el-icon>
          </el-button>
        </el-tooltip>
        <slot name="actions" :row="row" :index="$index"></slot>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup>
import { computed } from 'vue'
import { usePlayerStore } from '@/store/player'
import { fmtDuration, fmtCount, fmtDateTime } from '@/utils/format'
import Cover from './Cover.vue'

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
  hideFavorite: { type: Boolean, default: false }
})

const emit = defineEmits(['play', 'toggle-favorite', 'add-queue'])

const playerStore = usePlayerStore()
const playing = computed(() => playerStore.playing)

const favSet = computed(() => new Set(props.favoriteIds))
const isFavorite = (row) => !props.hideFavorite && favSet.value.has(row.id)
const isCurrent = (row) => playerStore.currentSong?.id === row.id

const rowClassName = ({ row }) => (isCurrent(row) ? 'current-row' : '')
// el-table 的 row-click 回调为 (row, column, event)，不含行号，这里手动计算
const onRowClick = (row) => emit('play', row, props.songs.indexOf(row))
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
