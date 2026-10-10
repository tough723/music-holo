<template>
  <div
    class="lyric-window"
    :class="{ 'is-idle': !state.title, clickthrough: isClickThrough }"
    :style="{ '--lyric-scale': fontScale }"
    @dblclick="toggleClickThrough"
  >
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
      <span class="control-sep" aria-hidden="true"></span>
      <button
        type="button"
        class="toggle"
        :class="{ on: showTranslation }"
        :aria-pressed="showTranslation ? 'true' : 'false'"
        aria-label="译文"
        title="译文（快捷键 T）"
        @click="toggleTranslation"
      >译</button>
      <button type="button" :aria-label="'歌词提前 0.5 秒'" title="歌词提前 0.5 秒（快捷键 [）" @click="adjustOffset(-LYRIC_OFFSET_STEP_MS)">«</button>
      <span class="offset-value" role="status">{{ offsetLabel }}</span>
      <button type="button" aria-label="歌词延后 0.5 秒" title="歌词延后 0.5 秒（快捷键 ]）" @click="adjustOffset(LYRIC_OFFSET_STEP_MS)">»</button>
      <button type="button" :disabled="offsetMs === 0" aria-label="重置歌词时间校准" title="重置校准" @click="adjustOffset(-offsetMs)">↺</button>
      <span class="control-sep" aria-hidden="true"></span>
      <button type="button" class="close" aria-label="关闭歌词窗" @click="closeWindow">✕</button>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { desktopLyricBridge } from '@/utils/desktopIntegration'
import { LYRIC_FONT_SIZES, LYRIC_OFFSET_STEP_MS } from '@/store/player'

const bridge = desktopLyricBridge()
const state = ref({ title: '', singer: '', cover: '', playing: false, currentTime: 0, duration: 0, lyrics: [], translations: [], lyricView: null })
/** 译文开关跟随主窗口推送，本地切换后写入本机偏好，下次开窗仍然生效。 */
const showTranslation = ref(loadLocalView().showTranslation)
const isClickThrough = ref(false)
let unbind = null

const LYRIC_VIEW_KEY = 'mh_lyric_window_view'

function loadLocalView() {
  try {
    const saved = JSON.parse(localStorage.getItem(LYRIC_VIEW_KEY) || '{}')
    return { showTranslation: saved.showTranslation !== false }
  } catch {
    return { showTranslation: true }
  }
}

function saveLocalView() {
  try {
    localStorage.setItem(LYRIC_VIEW_KEY, JSON.stringify({ showTranslation: showTranslation.value }))
  } catch { /* 隐私模式下写不进去也不影响使用 */ }
}

onMounted(() => {
  if (!bridge) return
  unbind = bridge.onState((next) => { state.value = { ...state.value, ...next } })
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  unbind?.()
  window.removeEventListener('keydown', onKeydown)
})

const lines = computed(() => {
  const lyrics = Array.isArray(state.value.lyrics) ? state.value.lyrics : []
  const translations = Array.isArray(state.value.translations) ? state.value.translations : []
  return lyrics.map((line, index) => ({
    time: Number(line?.time) || 0,
    text: String(line?.text || '').slice(0, 200),
    translation: String(translations[index]?.text || '')
  }))
})

/** 与主窗口歌词台一致的时间校准：正值＝歌词提前出现。 */
const offsetMs = computed(() => {
  const raw = Number(state.value.lyricView?.offsetMs)
  return Number.isFinite(raw) ? raw : 0
})
const offsetLabel = computed(() => {
  const value = offsetMs.value
  if (value === 0) return '0.0s'
  return `${value > 0 ? '+' : '−'}${(Math.abs(value) / 1000).toFixed(1)}s`
})
const fontScale = computed(() => {
  const key = state.value.lyricView?.fontSize
  return LYRIC_FONT_SIZES.find((item) => item.key === key)?.scale || 1
})

const activeIndex = computed(() => {
  const time = (Number(state.value.currentTime) || 0) + offsetMs.value / 1000
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

function send(command, payload) {
  bridge?.sendCommand(command, payload)
}

/** 校准请求发回主窗口：那里才是播放器 store 的所在地。 */
function adjustOffset(deltaMs) {
  send('lyricOffset', { deltaMs })
}

function toggleTranslation() {
  showTranslation.value = !showTranslation.value
  saveLocalView()
}

function onKeydown(event) {
  const key = event.key
  if (key === ' ' || key === 'Spacebar' || key === 'Enter') {
    event.preventDefault()
    send('toggle')
    return
  }
  if (key === 'ArrowLeft') { event.preventDefault(); send('prev'); return }
  if (key === 'ArrowRight') { event.preventDefault(); send('next'); return }
  if (key === 't' || key === 'T') { event.preventDefault(); toggleTranslation(); return }
  if (key === '[') { event.preventDefault(); adjustOffset(-LYRIC_OFFSET_STEP_MS); return }
  if (key === ']') { event.preventDefault(); adjustOffset(LYRIC_OFFSET_STEP_MS) }
}

function toggleClickThrough() {
  // 双击背景在「可点击」与「鼠标穿透」之间切换（穿透时仍可用快捷键与托盘控制）。
  const next = !isClickThrough.value
  isClickThrough.value = next
  window.musicHoloDesktop?.integration?.setLyricOptions({ clickThrough: next })
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
  font-size: calc(22px * var(--lyric-scale, 1));
  font-weight: 600;
}
.line-translation {
  display: block;
  margin-top: 2px;
  font-size: calc(13px * var(--lyric-scale, 1));
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
.lyric-controls button:disabled {
  opacity: 0.4;
  cursor: default;
}
.lyric-controls button.toggle.on {
  background: rgba(96, 165, 250, 0.7);
}
.control-sep {
  width: 1px;
  height: 18px;
  align-self: center;
  background: rgba(248, 250, 252, 0.3);
}
.offset-value {
  min-width: 42px;
  align-self: center;
  font-size: 11px;
  opacity: 0.85;
  font-variant-numeric: tabular-nums;
}
.lyric-window.clickthrough {
  background: transparent;
}
.lyric-window.clickthrough .lyric-controls {
  display: none;
}
.lyric-controls button:hover {
  background: rgba(96, 165, 250, 0.55);
}
.lyric-controls .close {
  background: rgba(248, 113, 113, 0.4);
}
</style>
