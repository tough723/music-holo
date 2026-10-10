<template>
  <div class="now-playing" role="dialog" aria-modal="false" aria-label="正在播放" tabindex="-1" ref="rootRef" @keydown="onKeydown">
    <div class="np-backdrop" aria-hidden="true"></div>
    <div class="np-body">
      <div class="np-stage">
        <HoloProjector
          :cover="song?.cover"
          :anonymous-cover="Boolean(song?.isCustomSource)"
          :title="song?.title || '全息投影'"
          :singer="song?.singerName || 'Music Holo'"
          :playing="playerStore.playing"
          :size="260"
          show-caption
        />
        <div class="np-meta">
          <span class="np-eyebrow">NOW PLAYING</span>
          <h2 class="np-title holo-text">{{ song?.title || '暂无播放' }}</h2>
          <p class="np-artist">{{ song?.singerName || 'Music Holo' }}</p>
          <p class="np-album">{{ song?.album || '—' }}</p>
          <div class="np-tags">
            <el-tag v-if="song?.isLocal" size="small" effect="plain">本地文件</el-tag>
            <el-tag v-else-if="song?.isCustomSource" size="small" effect="plain">
              {{ song?.sourceName || song?.sourcePlatform || '自定义源' }}
            </el-tag>
            <el-tag v-if="song?.categoryName" size="small" effect="plain">{{ song.categoryName }}</el-tag>
          </div>
          <div class="np-actions">
            <el-button round :type="isFav ? 'danger' : 'default'" :plain="!isFav" :disabled="!canFavorite" @click="emit('toggle-favorite')">
              <el-icon><StarFilled v-if="isFav" /><Star v-else /></el-icon>{{ isFav ? '已收藏' : '收藏' }}
            </el-button>
            <el-button round :disabled="!canDownload" @click="emit('download')">
              <el-icon><Download /></el-icon>下载
            </el-button>
            <el-button round :disabled="!canDislike" @click="emit('dislike')">
              <el-icon><CircleClose /></el-icon>{{ disliked ? '取消不喜欢' : '不喜欢' }}
            </el-button>
            <el-button round :disabled="!song" @click="emit('switch-source')">
              <el-icon><Switch /></el-icon>换源
            </el-button>
          </div>
        </div>
      </div>

      <section class="np-queue glass-panel" aria-label="当前播放队列">
        <header class="np-queue-head">
          <span>播放队列 · {{ playerStore.queue.length }} 首<template v-if="playerStore.queueDuration">（{{ fmtDuration(playerStore.queueDuration) }}）</template></span>
          <el-button text size="small" @click="emit('open-queue')">管理队列</el-button>
        </header>
        <p v-if="playerStore.queue.length === 0" class="np-queue-empty">队列空空如也，去曲库挑几首歌吧～</p>
        <ul v-else class="np-queue-list">
          <li
            v-for="(item, index) in playerStore.queue"
            :key="`${index}-${item.id}`"
            class="np-queue-item"
            :class="{ active: index === playerStore.currentIndex }"
          >
            <button type="button" class="np-queue-play" :aria-label="`播放第 ${index + 1} 首：${item.title}`" @click="playAt(index)">
              <span class="np-queue-index">{{ index === playerStore.currentIndex ? '♪' : index + 1 }}</span>
              <span class="np-queue-title">{{ item.title }}</span>
              <span class="np-queue-artist">{{ item.singerName }}</span>
              <span class="np-queue-time">{{ fmtDuration(item.duration) }}</span>
            </button>
          </li>
        </ul>
      </section>
    </div>

    <button type="button" class="np-close" aria-label="退出播放页" @click="emit('close')">
      <el-icon><Close /></el-icon>
    </button>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { usePlayerStore } from '@/store/player'
import { fmtDuration } from '@/utils/format'
import HoloProjector from './HoloProjector.vue'

const emit = defineEmits(['close', 'toggle-favorite', 'download', 'dislike', 'switch-source', 'open-queue'])
const props = defineProps({
  isFavorite: { type: Boolean, default: false },
  disliked: { type: Boolean, default: false }
})

const playerStore = usePlayerStore()
const rootRef = ref(null)

const song = computed(() => playerStore.currentSong)
const isFav = computed(() => props.isFavorite)
const canFavorite = computed(() => Boolean(song.value && !song.value.isLocal && !song.value.isCustomSource))
const canDownload = computed(() => Boolean(song.value?.audioUrl && !song.value.isLocal))
const canDislike = computed(() => Boolean(song.value && !song.value.isLocal && song.value.id != null && song.value.id !== ''))

function playAt(index) {
  playerStore.playAt(index)
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

onMounted(() => {
  rootRef.value?.focus?.()
})
</script>

<style scoped>
.now-playing {
  position: fixed;
  inset: 0 0 var(--player-h) 0;
  z-index: 98;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  outline: none;
  animation: np-in 0.28s ease;
}
@keyframes np-in {
  from { opacity: 0; transform: scale(0.985); }
  to { opacity: 1; transform: scale(1); }
}
.np-backdrop {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(900px 520px at 78% 8%, color-mix(in srgb, var(--holo-primary) 22%, transparent), transparent 62%),
    linear-gradient(180deg, rgba(5, 8, 22, 0.9), rgba(7, 11, 28, 0.96));
  backdrop-filter: blur(26px) saturate(1.4);
  -webkit-backdrop-filter: blur(26px) saturate(1.4);
}
.np-body {
  position: relative;
  width: min(1080px, 100%);
  max-height: 100%;
  display: grid;
  grid-template-columns: minmax(280px, 420px) 1fr;
  gap: 28px;
  align-items: center;
  overflow: auto;
}
.np-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  text-align: center;
}
.np-meta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.np-eyebrow {
  font-size: 11px;
  letter-spacing: 0.28em;
  color: var(--text-sub);
}
.np-title {
  margin: 0;
  font-size: 26px;
  line-height: 1.3;
}
.np-artist {
  margin: 0;
  color: var(--text-main);
}
.np-album {
  margin: 0;
  font-size: 12px;
  color: var(--text-sub);
}
.np-tags {
  display: flex;
  gap: 6px;
  justify-content: center;
  margin-top: 4px;
}
.np-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 10px;
}
.np-queue {
  padding: 14px 16px;
  border-radius: 16px;
  max-height: min(60vh, 520px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.np-queue-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--text-sub);
}
.np-queue-empty {
  padding: 32px 0;
  text-align: center;
  color: var(--text-sub);
}
.np-queue-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: auto;
}
.np-queue-item {
  border-radius: 10px;
}
.np-queue-item.active {
  background: color-mix(in srgb, var(--holo-primary) 14%, transparent);
}
.np-queue-play {
  width: 100%;
  display: grid;
  grid-template-columns: 32px 1fr auto 48px;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  font-size: 13px;
}
.np-queue-play:hover {
  background: rgba(148, 163, 184, 0.12);
}
.np-queue-index {
  color: var(--text-sub);
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.np-queue-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.np-queue-artist {
  color: var(--text-sub);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.np-queue-time {
  color: var(--text-sub);
  font-size: 12px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.np-close {
  position: absolute;
  top: 18px;
  right: 20px;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.16);
  color: var(--text-main);
  font-size: 18px;
  cursor: pointer;
}
.np-close:hover {
  background: rgba(248, 113, 113, 0.35);
}

@media (max-width: 900px) {
  .np-body {
    grid-template-columns: 1fr;
    gap: 16px;
    align-content: start;
  }
  .np-queue {
    max-height: 34vh;
  }
}
</style>
