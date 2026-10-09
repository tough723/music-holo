<template>
  <div class="lyric-window" :class="{ 'is-idle': !state.title }" @dblclick="toggleClickThrough">
    <div v-if="!state.title" class="lyric-idle">Music Holo 桌面歌词 · 等待播放</div>
    <template v-else>
      <div class="lyric-line" :class="{ active: index === activeIndex }" v-for="(line, index) in displayLines" :key="index">
        <span class="line-text">{{ line.text }}</span>
        <span v-if="showTranslation && line.translation" class="line-translation">{{ line.translation }}</span>
      </div>
    </template>
    <div class="lyric-controls" v-if="state.title">
      <button type="button" aria-label="上一首" @click="send('prev')">⏮</button>
      <button type="button" aria-label="播放或暂停" @click="send('toggle')">{{ state.playing ? '⏸' : '▶' }}</button>
      <button type="button" aria-label="下一首" @click="send('next')">⏭</button>
      <button type="button" class="close" aria-label="关闭歌词窗" @click="closeWindow">✕</button>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { desktopLyricBridge } from '@/utils/desktopIntegration'

const bridge = desktopLyricBridge()
const state = ref({ title: '', singer: '', cover: '', playing: false, currentTime: 0, duration: 0, lyrics: [], translations: [] })
const showTranslation = ref(true)
let unbind = null

onMounted(() => {
  if (!bridge) return
  unbind = bridge.onState((next) => { state.value = { ...state.value, ...next } })
})

onBeforeUnmount(() => unbind?.())

const lines = computed(() => {
  const lyrics = Array.isArray(state.value.lyrics) ? state.value.lyrics : []
  const translations = Array.isArray(state.value.translations) ? state.value.translations : []
  return lyrics.map((line, index) => ({
    time: Number(line?.time) || 0,
    text: String(line?.text || '').slice(0, 200),
    translation: String(translations[index]?.text || '')
  }))
})

const activeIndex = computed(() => {
  const time = Number(state.value.currentTime) || 0
  let index = -1
  const list = lines.value
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].time <= time) index = i
    else break
  }
  return index
})

/** 只显示当前行前后各两行，保持窗口轻量。 */
const displayLines = computed(() => {
  const list = lines.value
  if (!list.length) return []
  if (activeIndex.value < 0) return list.slice(0, 3)
  return list.slice(Math.max(0, activeIndex.value - 2), activeIndex.value + 3)
})

function send(command) {
  bridge?.sendCommand(command)
}

function toggleClickThrough() {
  // 双击背景在「可点击」与「鼠标穿透」之间切换（穿透时仍可用快捷键与托盘控制）。
  window.musicHoloDesktop?.integration?.setLyricOptions({ clickThrough: !document.body.dataset.clickThrough })
  document.body.dataset.clickThrough = document.body.dataset.clickThrough ? '' : '1'
}

function closeWindow() {
  window.musicHoloDesktop?.integration?.configure({ lyricWindow: false })
}
</script>

<style scoped>
.lyric-window {
  min-height: 100vh;
  padding: 18px 28px 46px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  color: #f8fafc;
  font-family: 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
  background: linear-gradient(180deg, rgba(8, 12, 24, 0.62), rgba(8, 12, 24, 0.4));
  border-radius: 16px;
  user-select: none;
  -webkit-app-region: drag;
}
.lyric-idle {
  text-align: center;
  opacity: 0.7;
  font-size: 14px;
}
.lyric-line {
  text-align: center;
  line-height: 1.35;
  opacity: 0.5;
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.lyric-line.active {
  opacity: 1;
  transform: scale(1.06);
  text-shadow: 0 0 18px rgba(96, 165, 250, 0.75);
}
.line-text {
  font-size: 22px;
  font-weight: 600;
}
.line-translation {
  display: block;
  margin-top: 2px;
  font-size: 13px;
  opacity: 0.8;
}
.lyric-controls {
  position: fixed;
  left: 50%;
  bottom: 8px;
  transform: translateX(-50%);
  display: flex;
  gap: 10px;
  opacity: 0;
  transition: opacity 0.2s ease;
  -webkit-app-region: no-drag;
}
.lyric-window:hover .lyric-controls {
  opacity: 1;
}
.lyric-controls button {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.28);
  color: #f8fafc;
  cursor: pointer;
}
.lyric-controls button:hover {
  background: rgba(96, 165, 250, 0.55);
}
.lyric-controls .close {
  background: rgba(248, 113, 113, 0.4);
}
</style>
