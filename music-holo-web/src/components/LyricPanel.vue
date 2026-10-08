<template>
  <transition name="lyric-fade">
    <div v-if="playerStore.lyricVisible" class="lyric-panel glass-panel">
      <div class="lyric-header">
        <div class="lyric-title">
          <span class="holo-text">{{ playerStore.currentSong?.title || '歌词' }}</span>
          <span class="lyric-artist">{{ playerStore.currentSong?.singerName }}</span>
        </div>
        <el-button circle size="small" text @click="playerStore.toggleLyric()">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
      <div class="lyric-body" ref="bodyRef">
        <div v-if="playerStore.lyrics.length === 0" class="lyric-empty">暂无歌词，纯享受音乐吧～</div>
        <div v-else class="lyric-lines" :style="{ transform: `translateY(${offsetY}px)` }">
          <div
            v-for="(line, index) in playerStore.lyrics"
            :key="index"
            class="lyric-line"
            :class="{ active: index === activeIndex }"
            @click="seekTo(line.time)"
          >
            {{ line.text || '♪' }}
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { usePlayerStore } from '@/store/player'

const playerStore = usePlayerStore()
const bodyRef = ref(null)

/** 当前高亮行：最后一个 time <= currentTime 的行 */
const activeIndex = computed(() => {
  const t = playerStore.currentTime
  let idx = -1
  const lines = playerStore.lyrics
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= t) idx = i
    else break
  }
  return idx
})

const LINE_HEIGHT = 40
const offsetY = ref(0)

watch(activeIndex, async (idx) => {
  if (idx < 0) {
    offsetY.value = 0
    return
  }
  await nextTick()
  const body = bodyRef.value
  if (!body) return
  // 高亮行滚动到面板中间（顶部留白 120px 为第一行缓冲）
  const target = 120 - idx * LINE_HEIGHT
  const maxOffset = 0
  const minOffset = body.clientHeight - 120 - playerStore.lyrics.length * LINE_HEIGHT
  offsetY.value = Math.min(maxOffset, Math.max(minOffset, target))
})

const seekTo = (time) => {
  window.dispatchEvent(new CustomEvent('mh-seek', { detail: time }))
}
</script>

<style scoped>
.lyric-panel {
  position: fixed;
  right: 24px;
  bottom: calc(var(--player-h) + 16px);
  width: 340px;
  max-width: calc(100vw - 48px);
  height: 420px;
  max-height: 55vh;
  display: flex;
  flex-direction: column;
  z-index: 99;
  overflow: hidden;
}
.lyric-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.lyric-title {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.lyric-title .holo-text {
  font-size: 15px;
  font-weight: 600;
}
.lyric-artist {
  font-size: 12px;
  color: var(--text-sub);
}
.lyric-body {
  flex: 1;
  overflow: hidden;
  position: relative;
  -webkit-mask-image: linear-gradient(180deg, transparent, #000 12%, #000 88%, transparent);
  mask-image: linear-gradient(180deg, transparent, #000 12%, #000 88%, transparent);
}
.lyric-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-sub);
  font-size: 13px;
}
.lyric-lines {
  padding: 120px 20px;
  transition: transform 0.35s ease;
}
.lyric-line {
  height: 40px;
  line-height: 40px;
  text-align: center;
  font-size: 14px;
  color: var(--text-sub);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.25s, font-size 0.25s;
}
.lyric-line:hover {
  color: var(--text-main);
}
.lyric-line.active {
  color: var(--holo-primary);
  font-size: 16px;
  font-weight: 600;
  text-shadow: 0 0 14px var(--holo-glow);
}

.lyric-fade-enter-active,
.lyric-fade-leave-active {
  transition: opacity 0.25s, transform 0.25s;
}
.lyric-fade-enter-from,
.lyric-fade-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
