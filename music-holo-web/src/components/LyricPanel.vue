<template>
  <transition name="lyric-stage">
    <div
      v-if="playerStore.lyricVisible"
      class="lyric-experience"
      :class="{ immersive }"
      tabindex="-1"
      aria-live="off"
    >
      <div v-if="immersive" class="lyric-backdrop" aria-hidden="true" @click="immersive = false">
        <div class="backdrop-orbit orbit-a"></div>
        <div class="backdrop-orbit orbit-b"></div>
        <div class="backdrop-sweep"></div>
      </div>

      <section class="lyric-panel glass-panel" :class="{ immersive }" role="dialog" :aria-modal="immersive" aria-label="沉浸式 3D 歌词">
        <header class="lyric-header">
          <div class="lyric-track">
            <div class="lyric-cover">
              <Cover :src="playerStore.currentSong?.cover" :text="playerStore.currentSong?.title || '♪'" :size="48" />
            </div>
            <div class="lyric-title">
              <span class="lyric-eyebrow">HOLO LYRICS · 空间歌词</span>
              <span class="lyric-song holo-text">{{ playerStore.currentSong?.title || '歌词空间' }}</span>
              <span class="lyric-artist">{{ playerStore.currentSong?.singerName || 'Music Holo' }}</span>
            </div>
          </div>
          <div class="lyric-actions">
            <el-tooltip :content="immersive ? '退出沉浸模式' : '沉浸式歌词'" placement="top">
              <el-button circle text :aria-label="immersive ? '退出沉浸模式' : '进入沉浸模式'" @click="toggleImmersive">
                <el-icon><ScaleToOriginal v-if="immersive" /><FullScreen v-else /></el-icon>
              </el-button>
            </el-tooltip>
            <el-button circle text aria-label="关闭歌词" @click="closeLyrics">
              <el-icon><Close /></el-icon>
            </el-button>
          </div>
        </header>

        <div class="lyric-layout">
          <aside class="lyric-visual" :class="{ playing: playerStore.playing }">
            <div class="visual-copy">
              <span class="visual-kicker">NOW RESONATING</span>
              <strong>{{ playerStore.currentSong?.categoryName || 'HOLOGRAPHIC AUDIO' }}</strong>
              <span class="visual-sub">歌词随节拍穿过声场</span>
            </div>
            <div class="visual-projector">
              <HoloProjector
                :cover="playerStore.currentSong?.cover"
                :title="playerStore.currentSong?.title || '全息投影'"
                :singer="playerStore.currentSong?.singerName || 'Music Holo'"
                :playing="playerStore.playing"
                :size="immersive ? (viewportWidth <= 640 ? 150 : 260) : 116"
                :show-caption="immersive"
              />
            </div>
            <div class="visual-equalizer" :class="{ active: playerStore.playing }" aria-hidden="true">
              <i v-for="n in 13" :key="n" :style="{ '--bar-delay': `${-n * 0.07}s` }"></i>
            </div>
            <span class="visual-label">STEREO · 3D</span>
          </aside>

          <div class="lyric-body" ref="bodyRef" :class="{ 'is-empty': playerStore.lyrics.length === 0 }">
            <div v-if="playerStore.lyrics.length === 0" class="lyric-empty">
              <div class="empty-orbit"><span></span></div>
              <strong>这首歌还没有歌词</strong>
              <span>先享受旋律，歌词准备好后会出现在这里。</span>
            </div>
            <div v-else class="lyric-lines" :style="{ transform: `translate3d(0, ${offsetY}px, 0)` }">
              <button
                v-for="(line, index) in playerStore.lyrics"
                :key="`${index}-${line.time}`"
                class="lyric-line"
                :class="{ active: index === activeIndex }"
                :style="lineStyle(index)"
                :aria-current="index === activeIndex ? 'true' : undefined"
                @click="seekTo(line.time)"
              >
                <span class="line-time">{{ fmtDuration(line.time) }}</span>
                <span class="line-copy">{{ line.text || '♪' }}</span>
                <span class="line-rail"><i></i></span>
              </button>
            </div>
            <div class="lyric-axis" aria-hidden="true"><i></i></div>
          </div>
        </div>

        <footer class="lyric-footer">
          <div class="lyric-time-row">
            <span>{{ fmtDuration(playerStore.currentTime) }}</span>
            <div class="footer-spectrum" :class="{ active: playerStore.playing }" aria-hidden="true">
              <i v-for="n in 11" :key="n" :style="{ '--bar-delay': `${-n * 0.07}s` }"></i>
            </div>
            <span>{{ fmtDuration(playerStore.duration || playerStore.currentSong?.duration) }}</span>
          </div>
          <div class="lyric-controls">
            <el-slider
              v-model="seekPreview"
              :min="0"
              :max="Math.max(1, playerStore.duration || playerStore.currentSong?.duration || 1)"
              :show-tooltip="false"
              :disabled="!playerStore.currentSong"
              class="lyric-scrubber"
              @input="onSeekInput"
              @change="onSeekCommit"
            />
            <el-button class="lyric-play" circle type="primary" :disabled="!playerStore.currentSong" :aria-label="playerStore.playing ? '暂停' : '播放'" @click="togglePlay">
              <el-icon><VideoPause v-if="playerStore.playing" /><VideoPlay v-else /></el-icon>
            </el-button>
          </div>
          <div class="lyric-footnote">
            <span>点击任意歌词即可跳转到对应片段</span>
            <span class="lyric-mode">{{ immersive ? 'IMMERSIVE SPACE' : 'GLASS WINDOW' }}</span>
          </div>
        </footer>
      </section>
    </div>
  </transition>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { usePlayerStore } from '@/store/player'
import { fmtDuration } from '@/utils/format'
import HoloProjector from './HoloProjector.vue'
import Cover from './Cover.vue'

const playerStore = usePlayerStore()
const bodyRef = ref(null)
const immersive = ref(false)
const offsetY = ref(0)
const seekPreview = ref(0)
const scrubbing = ref(false)

/** 当前高亮行：最后一个 time <= currentTime 的行 */
const activeIndex = computed(() => {
  const time = playerStore.currentTime
  let index = -1
  for (let i = 0; i < playerStore.lyrics.length; i++) {
    if (playerStore.lyrics[i].time <= time) index = i
    else break
  }
  return index
})

const viewportWidth = ref(typeof window === 'undefined' ? 1280 : window.innerWidth)
const rowHeight = computed(() => immersive.value ? (viewportWidth.value <= 640 ? 60 : 78) : 50)

const activeProgress = computed(() => {
  const index = activeIndex.value
  const line = playerStore.lyrics[index]
  if (!line) return 0
  const next = playerStore.lyrics[index + 1]
  if (!next || next.time <= line.time) return 100
  return Math.max(0, Math.min(100, ((playerStore.currentTime - line.time) / (next.time - line.time)) * 100))
})

const lineStyle = (index) => {
  const distance = index - Math.max(0, activeIndex.value)
  const absDistance = Math.abs(distance)
  return {
    '--line-distance': distance,
    '--line-lift': `${Math.max(-18, Math.min(18, distance * 2.5))}px`,
    '--line-depth': `${Math.max(-150, 20 - absDistance * 27)}px`,
    '--line-tilt': `${Math.max(-22, Math.min(22, -distance * 5))}deg`,
    '--line-scale': Math.max(0.72, 1 - absDistance * 0.045),
    '--line-opacity': Math.max(0.08, 1 - absDistance * 0.17),
    '--line-blur': `${Math.min(2.4, absDistance * 0.36)}px`,
    '--karaoke-fill': index === activeIndex.value ? `${Math.max(8, activeProgress.value)}%` : '0%'
  }
}

const alignActiveLine = async () => {
  await nextTick()
  const body = bodyRef.value
  if (!body) return
  const index = Math.max(0, activeIndex.value)
  offsetY.value = body.clientHeight / 2 - rowHeight.value / 2 - index * rowHeight.value
}

watch([activeIndex, immersive, rowHeight, () => playerStore.lyrics.length], alignActiveLine)
watch(() => playerStore.currentTime, (time) => {
  if (!scrubbing.value) seekPreview.value = time
}, { immediate: true })
watch(() => playerStore.lyricVisible, (visible) => {
  if (!visible) immersive.value = false
  else alignActiveLine()
})
watch(() => playerStore.currentSong?.id, () => {
  scrubbing.value = false
  seekPreview.value = 0
  alignActiveLine()
})

const seekTo = (time) => {
  window.dispatchEvent(new CustomEvent('mh-seek', { detail: Number(time) }))
}

const onSeekInput = (time) => {
  scrubbing.value = true
  seekPreview.value = Number(time)
}

const onSeekCommit = (time) => {
  seekPreview.value = Number(time)
  scrubbing.value = false
  seekTo(time)
}

const toggleImmersive = async () => {
  immersive.value = !immersive.value
  await alignActiveLine()
}

const closeLyrics = () => {
  immersive.value = false
  playerStore.lyricVisible = false
}

const exitOrClose = () => {
  if (immersive.value) immersive.value = false
  else closeLyrics()
}

const togglePlay = () => {
  if (playerStore.currentSong) playerStore.playing = !playerStore.playing
}

const onKeydown = (event) => {
  if (event.key === 'Escape' && playerStore.lyricVisible) {
    event.preventDefault()
    exitOrClose()
  }
}

const onResize = () => {
  viewportWidth.value = window.innerWidth
  alignActiveLine()
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onResize)
})
</script>

<style scoped>
.lyric-experience {
  position: fixed;
  right: 24px;
  bottom: calc(var(--player-h) + 16px);
  z-index: 99;
  width: min(390px, calc(100vw - 32px));
  height: min(530px, calc(100dvh - var(--player-h) - 30px));
  pointer-events: none;
  perspective: 1500px;
  transform-style: preserve-3d;
}
.lyric-panel {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-color: color-mix(in srgb, var(--holo-primary) 28%, var(--border-color));
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.075), transparent 33%), rgba(7, 12, 31, 0.58);
  backdrop-filter: blur(28px) saturate(1.55);
  -webkit-backdrop-filter: blur(28px) saturate(1.55);
  box-shadow: 0 30px 80px -42px rgba(0, 0, 0, 0.98), 0 0 42px -22px var(--holo-glow), inset 0 1px 0 rgba(255, 255, 255, 0.15);
  pointer-events: auto;
  transform: perspective(1400px) rotateY(-2deg) rotateX(1.4deg) translateZ(20px);
  transform-style: preserve-3d;
  transition: transform 0.4s ease, background 0.4s ease, border-radius 0.4s ease;
}
.lyric-header {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--holo-primary) 13%, var(--border-color));
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.045), transparent);
  flex-shrink: 0;
  transform: translateZ(18px);
}
.lyric-track {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}
.lyric-cover {
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--holo-primary) 45%, transparent);
  box-shadow: 0 8px 24px -12px var(--holo-glow), inset 0 1px 0 rgba(255, 255, 255, 0.2);
  transform: perspective(300px) rotateY(-12deg) rotateX(6deg) translateZ(12px);
}
.lyric-title {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.lyric-eyebrow {
  color: var(--holo-primary);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.5px;
}
.lyric-song {
  max-width: 230px;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 700;
}
.lyric-artist {
  margin-top: 2px;
  color: var(--text-sub);
  font-size: 11px;
}
.lyric-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 2px;
}
.lyric-layout {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  transform-style: preserve-3d;
}
.lyric-visual {
  position: relative;
  height: 108px;
  flex: 0 0 108px;
  overflow: hidden;
  border-bottom: 1px solid color-mix(in srgb, var(--holo-primary) 12%, transparent);
  transform-style: preserve-3d;
  background: radial-gradient(ellipse at 76% 58%, color-mix(in srgb, var(--holo-primary) 13%, transparent), transparent 47%);
}
.visual-copy {
  position: absolute;
  z-index: 2;
  left: 20px;
  top: 50%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transform: translateY(-50%) translateZ(24px);
}
.visual-kicker,
.visual-label {
  color: var(--holo-primary);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 1.4px;
}
.visual-copy strong {
  max-width: 160px;
  color: rgba(255, 255, 255, 0.87);
  font-size: 11px;
  letter-spacing: 0.7px;
}
.visual-sub {
  color: var(--text-sub);
  font-size: 10px;
}
.visual-projector {
  position: absolute;
  z-index: 1;
  top: -18px;
  right: -2px;
  width: 116px;
  height: 138px;
  display: flex;
  justify-content: center;
  transform: translateZ(12px) rotateY(-8deg);
  filter: drop-shadow(0 15px 20px rgba(0, 0, 0, 0.5));
}
.visual-equalizer {
  position: absolute;
  z-index: 2;
  left: 20px;
  bottom: 10px;
  height: 12px;
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0.42;
}
.visual-equalizer i,
.footer-spectrum i {
  width: 2px;
  height: 6px;
  border-radius: 2px;
  background: var(--holo-primary);
  transform-origin: center;
}
.visual-equalizer i:nth-child(5n + 1),
.footer-spectrum i:nth-child(5n + 1) { height: 5px; }
.visual-equalizer i:nth-child(5n + 2),
.footer-spectrum i:nth-child(5n + 2) { height: 9px; }
.visual-equalizer i:nth-child(5n + 3),
.footer-spectrum i:nth-child(5n + 3) { height: 7px; }
.visual-equalizer i:nth-child(5n + 4),
.footer-spectrum i:nth-child(5n + 4) { height: 12px; }
.visual-equalizer.active i,
.footer-spectrum.active i {
  animation: equalizer-pulse 0.85s ease-in-out infinite alternate;
  animation-delay: var(--bar-delay, 0s);
}
.visual-label {
  position: absolute;
  right: 13px;
  bottom: 8px;
  font-size: 7px;
  opacity: 0.72;
}
.lyric-body {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  perspective: 1000px;
  transform-style: preserve-3d;
  -webkit-mask-image: linear-gradient(180deg, transparent, #000 14%, #000 86%, transparent);
  mask-image: linear-gradient(180deg, transparent, #000 14%, #000 86%, transparent);
}
.lyric-lines {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 0 16px;
  transform-style: preserve-3d;
  transition: transform 0.48s cubic-bezier(0.22, 0.68, 0.24, 1);
  will-change: transform;
}
.lyric-line {
  position: relative;
  width: 100%;
  height: 50px;
  flex: 0 0 50px;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 0 4px;
  border: 0;
  color: var(--text-sub);
  background: transparent;
  text-align: left;
  cursor: pointer;
  opacity: var(--line-opacity);
  filter: blur(var(--line-blur));
  transform: translate3d(0, var(--line-lift), var(--line-depth)) rotateX(var(--line-tilt)) scale(var(--line-scale));
  transform-style: preserve-3d;
  transform-origin: 50% 50%;
  transition: color 0.28s ease, opacity 0.28s ease, filter 0.28s ease, transform 0.42s ease;
  backface-visibility: hidden;
}
.lyric-line:hover {
  opacity: 1;
  filter: none;
  color: var(--text-main);
}
.line-time {
  color: color-mix(in srgb, var(--text-sub) 70%, transparent);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  opacity: 0.65;
}
.line-copy {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1.45;
  letter-spacing: 0.15px;
  transition: color 0.3s ease, font-size 0.3s ease, filter 0.3s ease;
}
.line-rail {
  position: absolute;
  left: 42px;
  right: 8px;
  bottom: 5px;
  height: 1px;
  background: color-mix(in srgb, var(--holo-primary) 12%, transparent);
  opacity: 0;
  transform: translateZ(4px);
}
.line-rail i {
  display: block;
  width: var(--karaoke-fill);
  height: 100%;
  background: linear-gradient(90deg, var(--holo-primary), var(--holo-secondary));
  box-shadow: 0 0 9px var(--holo-glow);
  transition: width 0.28s linear;
}
.lyric-line.active {
  z-index: 2;
  opacity: 1;
  filter: none;
  color: #fff;
}
.lyric-line.active .line-time {
  color: var(--holo-primary);
  opacity: 0.95;
}
.lyric-line.active .line-copy {
  color: transparent;
  background-image: linear-gradient(90deg, #fff 0%, var(--holo-primary) var(--karaoke-fill), rgba(226, 232, 240, 0.54) var(--karaoke-fill), rgba(226, 232, 240, 0.54) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  filter: drop-shadow(0 0 12px var(--holo-glow));
  font-size: 15px;
  font-weight: 700;
}
.lyric-line.active .line-rail {
  opacity: 1;
}
.lyric-axis {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 70%;
  height: 1px;
  pointer-events: none;
  transform: translate(-50%, -50%) translateZ(-60px);
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--holo-primary) 20%, transparent), transparent);
  box-shadow: 0 0 20px var(--holo-glow);
}
.lyric-axis i {
  position: absolute;
  left: 50%;
  top: -2px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--holo-primary);
  box-shadow: 0 0 12px 3px var(--holo-glow);
}
.lyric-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 9px;
  padding: 24px;
  color: var(--text-sub);
  text-align: center;
}
.lyric-empty strong {
  color: var(--text-main);
  font-size: 13px;
}
.lyric-empty > span {
  font-size: 11px;
  line-height: 1.5;
}
.empty-orbit {
  width: 42px;
  height: 42px;
  margin-bottom: 2px;
  display: grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--holo-primary) 38%, transparent);
  border-radius: 50%;
  transform: rotateX(65deg);
  box-shadow: 0 0 18px -7px var(--holo-glow), inset 0 0 13px color-mix(in srgb, var(--holo-primary) 13%, transparent);
}
.empty-orbit span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--holo-primary);
  box-shadow: 0 0 12px 3px var(--holo-glow);
}
.lyric-footer {
  position: relative;
  z-index: 3;
  padding: 8px 16px 12px;
  border-top: 1px solid color-mix(in srgb, var(--holo-primary) 14%, var(--border-color));
  background: linear-gradient(0deg, rgba(4, 8, 24, 0.45), rgba(255, 255, 255, 0.025));
  transform: translateZ(18px);
}
.lyric-time-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-sub);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.footer-spectrum {
  height: 13px;
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0.52;
}
.lyric-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 3px;
}
.lyric-scrubber {
  flex: 1;
}
.lyric-scrubber :deep(.el-slider__runway) {
  height: 4px;
  background: rgba(148, 163, 184, 0.17);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35) inset;
}
.lyric-scrubber :deep(.el-slider__bar) {
  height: 4px;
  background: linear-gradient(90deg, var(--holo-primary), var(--holo-secondary));
  box-shadow: 0 0 12px -4px var(--holo-glow);
}
.lyric-scrubber :deep(.el-slider__button) {
  width: 10px;
  height: 10px;
  border: 2px solid #fff;
  background: var(--holo-primary);
  box-shadow: 0 0 12px var(--holo-glow);
}
.lyric-play {
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  box-shadow: 0 5px 15px -7px var(--holo-glow), inset 0 1px 0 rgba(255, 255, 255, 0.3);
}
.lyric-footnote {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 3px;
  color: var(--text-sub);
  font-size: 9px;
}
.lyric-mode {
  color: color-mix(in srgb, var(--holo-primary) 70%, var(--text-sub));
  font-size: 8px;
  letter-spacing: 1px;
  white-space: nowrap;
}

/* 全屏沉浸式声场：透明玻璃浮在模糊专辑色与 3D 光轨之上。 */
.lyric-experience.immersive {
  inset: 0 0 var(--player-h) 0;
  z-index: 110;
  width: 100%;
  height: auto;
  display: grid;
  place-items: center;
  padding: 18px;
  pointer-events: auto;
}
.lyric-backdrop {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background:
    radial-gradient(ellipse at 24% 38%, color-mix(in srgb, var(--holo-primary) 15%, transparent), transparent 45%),
    radial-gradient(ellipse at 82% 72%, color-mix(in srgb, var(--holo-secondary) 14%, transparent), transparent 43%),
    rgba(3, 6, 18, 0.72);
  backdrop-filter: blur(26px) saturate(1.2);
  -webkit-backdrop-filter: blur(26px) saturate(1.2);
}
.backdrop-orbit {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(82vw, 1080px);
  aspect-ratio: 1;
  border: 1px solid color-mix(in srgb, var(--holo-primary) 16%, transparent);
  border-radius: 50%;
  transform: translate(-50%, -50%) rotateX(72deg) rotateZ(-23deg);
  box-shadow: 0 0 80px -50px var(--holo-glow), inset 0 0 60px -40px var(--holo-glow);
  animation: lyric-orbit 54s linear infinite;
}
.backdrop-orbit::before,
.backdrop-orbit::after {
  content: '';
  position: absolute;
  inset: 14%;
  border: 1px dashed color-mix(in srgb, var(--holo-secondary) 21%, transparent);
  border-radius: 50%;
}
.backdrop-orbit::after {
  inset: 30%;
  border-style: solid;
}
.orbit-b {
  width: min(60vw, 760px);
  border-color: color-mix(in srgb, var(--holo-secondary) 16%, transparent);
  transform: translate(-50%, -50%) rotateX(65deg) rotateZ(36deg);
  animation-direction: reverse;
  animation-duration: 72s;
}
.orbit-b::before {
  inset: -10%;
}
.backdrop-sweep {
  position: absolute;
  left: 50%;
  top: 0;
  width: min(50vw, 660px);
  height: 100%;
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
  transform: translateX(-50%);
  background: linear-gradient(180deg, color-mix(in srgb, var(--holo-primary) 6%, transparent), transparent 78%);
  filter: blur(18px);
}
.lyric-panel.immersive {
  width: min(1480px, 100%);
  height: 100%;
  border-radius: 28px;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.065), transparent 40%), rgba(7, 11, 29, 0.43);
  backdrop-filter: blur(34px) saturate(1.7);
  -webkit-backdrop-filter: blur(34px) saturate(1.7);
  transform: perspective(1800px) rotateX(0.8deg) translateZ(24px);
  box-shadow: 0 45px 110px -55px rgba(0, 0, 0, 0.98), 0 0 75px -42px var(--holo-glow), inset 0 1px 0 rgba(255, 255, 255, 0.18);
}
.lyric-panel.immersive .lyric-header {
  padding: 18px 24px;
}
.lyric-panel.immersive .lyric-cover {
  width: 58px;
  height: 58px;
  flex-basis: 58px;
}
.lyric-panel.immersive .lyric-layout {
  flex-direction: row;
  align-items: stretch;
  padding: 14px 24px 18px;
  gap: 24px;
}
.lyric-panel.immersive .lyric-visual {
  height: auto;
  flex: 0 0 min(36%, 440px);
  border-right: 1px solid color-mix(in srgb, var(--holo-primary) 17%, transparent);
  border-bottom: 0;
  background: radial-gradient(ellipse at 48% 49%, color-mix(in srgb, var(--holo-primary) 12%, transparent), transparent 58%);
  overflow: visible;
}
.lyric-panel.immersive .visual-copy {
  left: 24px;
  top: 24px;
  transform: translateZ(36px);
}
.lyric-panel.immersive .visual-copy strong {
  max-width: 230px;
  font-size: 13px;
}
.lyric-panel.immersive .visual-sub {
  font-size: 11px;
}
.lyric-panel.immersive .visual-projector {
  inset: 50% auto auto 50%;
  width: 280px;
  height: 320px;
  transform: translate(-50%, -45%) translateZ(30px) rotateY(-5deg);
}
.lyric-panel.immersive .visual-equalizer {
  left: 24px;
  bottom: 24px;
  height: 18px;
  gap: 3px;
}
.lyric-panel.immersive .visual-equalizer i {
  width: 3px;
}
.lyric-panel.immersive .visual-label {
  right: 24px;
  bottom: 27px;
  font-size: 9px;
}
.lyric-panel.immersive .lyric-body {
  flex: 1;
  width: auto;
  height: auto;
  padding: 0 10px;
}
.lyric-panel.immersive .lyric-lines {
  padding: 0 5%;
}
.lyric-panel.immersive .lyric-line {
  height: 78px;
  flex-basis: 78px;
  grid-template-columns: 54px minmax(0, 1fr);
  gap: 16px;
  padding: 0 14px;
}
.lyric-panel.immersive .line-copy {
  font-size: 19px;
  letter-spacing: 0.35px;
}
.lyric-panel.immersive .lyric-line.active .line-copy {
  font-size: clamp(22px, 2.25vw, 34px);
}
.lyric-panel.immersive .line-time {
  font-size: 11px;
}
.lyric-panel.immersive .line-rail {
  left: 84px;
  right: 14px;
  bottom: 10px;
}
.lyric-panel.immersive .lyric-footer {
  padding: 10px 30px 16px;
}
.lyric-panel.immersive .lyric-time-row {
  font-size: 11px;
}
.lyric-panel.immersive .lyric-controls {
  gap: 16px;
}
.lyric-panel.immersive .lyric-play {
  width: 38px;
  height: 38px;
  flex-basis: 38px;
}
.lyric-panel.immersive .lyric-footnote {
  font-size: 10px;
}
.lyric-stage-enter-active,
.lyric-stage-leave-active {
  transition: opacity 0.32s ease, transform 0.32s ease;
}
.lyric-stage-enter-from,
.lyric-stage-leave-to {
  opacity: 0;
  transform: translate3d(0, 16px, 0) scale(0.985);
}
@keyframes equalizer-pulse {
  from { transform: scaleY(0.42); opacity: 0.55; }
  to { transform: scaleY(1.6); opacity: 1; }
}
@keyframes lyric-orbit {
  to { rotate: 360deg; }
}
@media (max-width: 900px) {
  .lyric-experience {
    right: 12px;
    width: min(370px, calc(100vw - 24px));
  }
  .lyric-panel.immersive .lyric-layout {
    gap: 14px;
    padding: 10px 14px 14px;
  }
  .lyric-panel.immersive .lyric-visual {
    flex-basis: 30%;
  }
  .lyric-panel.immersive .visual-projector {
    transform: translate(-50%, -45%) translateZ(20px) scale(0.78);
  }
  .lyric-panel.immersive .lyric-line {
    grid-template-columns: 44px minmax(0, 1fr);
    gap: 10px;
    padding: 0 8px;
  }
  .lyric-panel.immersive .line-rail {
    left: 62px;
  }
}
@media (max-width: 640px) {
  .lyric-experience {
    right: 8px;
    bottom: calc(var(--player-h) + 8px);
    width: calc(100vw - 16px);
    height: min(480px, calc(100dvh - var(--player-h) - 16px));
  }
  .lyric-panel {
    transform: perspective(1400px) rotateY(-0.7deg) rotateX(0.6deg) translateZ(10px);
  }
  .lyric-experience.immersive {
    inset: 0 0 var(--player-h) 0;
    width: 100%;
    height: auto;
    padding: 8px;
  }
  .lyric-panel.immersive {
    border-radius: 20px;
  }
  .lyric-panel.immersive .lyric-header {
    padding: 12px 14px;
  }
  .lyric-panel.immersive .lyric-cover {
    width: 44px;
    height: 44px;
    flex-basis: 44px;
  }
  .lyric-panel.immersive .lyric-layout {
    flex-direction: column;
    gap: 0;
    padding: 0 8px;
  }
  .lyric-panel.immersive .lyric-visual {
    position: relative;
    height: 104px;
    flex: 0 0 104px;
    border-right: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--holo-primary) 17%, transparent);
    overflow: hidden;
  }
  .lyric-panel.immersive .visual-copy {
    left: 10px;
    top: 50%;
    max-width: 48%;
    transform: translateY(-50%) translateZ(20px);
  }
  .lyric-panel.immersive .visual-projector {
    inset: -35px -12px auto auto;
    width: 160px;
    height: 190px;
    transform: scale(0.88) translateZ(16px);
    transform-origin: top right;
  }
  .lyric-panel.immersive .visual-equalizer {
    left: 10px;
    bottom: 8px;
  }
  .lyric-panel.immersive .visual-label {
    right: 12px;
    bottom: 10px;
  }
  .lyric-panel.immersive .lyric-body {
    padding: 0 2px;
  }
  .lyric-panel.immersive .lyric-line {
    height: 60px;
    flex-basis: 60px;
    grid-template-columns: 34px minmax(0, 1fr);
    gap: 7px;
    padding: 0 4px;
  }
  .lyric-panel.immersive .line-copy {
    font-size: 14px;
  }
  .lyric-panel.immersive .lyric-line.active .line-copy {
    font-size: clamp(17px, 5vw, 24px);
  }
  .lyric-panel.immersive .line-time {
    font-size: 9px;
  }
  .lyric-panel.immersive .line-rail {
    left: 45px;
    right: 5px;
    bottom: 5px;
  }
  .lyric-panel.immersive .lyric-footer {
    padding: 8px 14px 10px;
  }
  .lyric-panel.immersive .lyric-footnote .lyric-mode {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .lyric-panel,
  .lyric-line,
  .backdrop-orbit {
    transition: none !important;
    animation: none !important;
  }
  .lyric-panel,
  .lyric-panel.immersive {
    transform: none;
  }
}
</style>
