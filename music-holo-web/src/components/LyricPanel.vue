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
              <Cover :src="playerStore.currentSong?.cover" :text="playerStore.currentSong?.title || '♪'" :size="48" :anonymous="Boolean(playerStore.currentSong?.isCustomSource)" />
            </div>
            <div class="lyric-title">
              <span class="lyric-eyebrow">HOLO LYRICS · 空间歌词</span>
              <span class="lyric-song holo-text">{{ playerStore.currentSong?.title || '歌词空间' }}</span>
              <span class="lyric-artist">{{ playerStore.currentSong?.singerName || 'Music Holo' }}</span>
            </div>
          </div>
          <div class="lyric-actions">
            <el-button
              v-if="hasTranslations"
              text
              size="small"
              class="translation-toggle"
              :aria-pressed="showTranslation"
              @click="showTranslation = !showTranslation"
            >
              {{ showTranslation ? '隐藏译文' : '显示译文' }}
            </el-button>
            <el-button
              v-if="hasRomaji"
              text
              size="small"
              class="translation-toggle"
              :aria-pressed="showRomaji"
              @click="showRomaji = !showRomaji"
            >
              {{ showRomaji ? '隐藏罗马音' : '显示罗马音' }}
            </el-button>
            <el-button
              v-if="hasVerbatim"
              text
              size="small"
              class="translation-toggle"
              :aria-pressed="showVerbatim"
              @click="showVerbatim = !showVerbatim"
            >
              {{ showVerbatim ? '隐藏逐字' : '显示逐字' }}
            </el-button>
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
                :anonymous-cover="Boolean(playerStore.currentSong?.isCustomSource)"
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
              <el-button
                v-if="playerStore.currentSong && !playerStore.currentSong.isLocal"
                size="small"
                plain
                round
                :loading="lyricReloading"
                @click="reloadLyrics"
              >重新加载歌词</el-button>
            </div>
            <div v-else class="lyric-lines" :style="{ transform: `translate3d(0, ${offsetY}px, 0)` }">
              <button
                v-for="(line, index) in playerStore.lyrics"
                :key="`${index}-${line.time}`"
                class="lyric-line"
                :class="{ active: index === activeIndex }"
                :style="lineStyle(index)"
                :aria-current="index === activeIndex ? 'true' : undefined"
                @click="seekToLine(line)"
              >
                <span class="line-time">{{ fmtDuration(line.time) }}</span>
                <span class="line-content">
                  <span class="line-copy" :class="{ 'is-verbatim': wordsForLine(line) }">
                    <template v-if="wordsForLine(line)">
                      <span
                        v-for="(word, wordIndex) in wordsForLine(line)"
                        :key="`${wordIndex}-${word.time}`"
                        class="verbatim-word"
                        :class="{ sung: index === activeIndex && wordProgress(line, word) >= 100 }"
                        :style="index === activeIndex ? { '--word-fill': `${wordProgress(line, word)}%` } : { '--word-fill': '0%' }"
                      >{{ word.text }}</span>
                    </template>
                    <template v-else>{{ line.text || '♪' }}</template>
                  </span>
                  <span v-if="showTranslation && alignedTranslations[index]" class="line-translation">
                    {{ alignedTranslations[index] }}
                  </span>
                  <span v-if="showRomaji && alignedRomaji[index]" class="line-translation line-romaji">
                    {{ alignedRomaji[index] }}
                  </span>
                </span>
                <span class="line-rail"><i></i></span>
              </button>
            </div>
            <div class="lyric-axis" aria-hidden="true"><i></i></div>
          </div>
        </div>

        <footer class="lyric-footer">
          <div class="lyric-view-tools">
            <div class="view-tool-group" role="group" aria-label="歌词字号">
              <button
                v-for="size in LYRIC_FONT_SIZES"
                :key="size.key"
                type="button"
                class="view-tool"
                :class="{ active: fontSize === size.key }"
                :aria-pressed="fontSize === size.key ? 'true' : 'false'"
                :aria-label="`歌词字号：${size.label}`"
                @click="setFontSize(size.key)"
              >{{ size.label }}</button>
            </div>
            <div class="view-tool-group" role="group" aria-label="歌词时间校准">
              <button type="button" class="view-tool" aria-label="歌词提前 0.5 秒" @click="adjustOffset(-LYRIC_OFFSET_STEP_MS)">−0.5s</button>
              <span class="view-offset" role="status">{{ offsetLabel }}</span>
              <button type="button" class="view-tool" aria-label="歌词延后 0.5 秒" @click="adjustOffset(LYRIC_OFFSET_STEP_MS)">+0.5s</button>
              <button type="button" class="view-tool" :disabled="offsetMs === 0" aria-label="重置歌词时间校准" @click="resetOffset">重置</button>
              <button
                type="button"
                class="view-tool"
                :class="{ active: Boolean(savedCorrection) }"
                :disabled="submittingOffset"
                aria-label="提交歌词时间校正"
                @click="submitCorrection"
              >提交校正</button>
              <span v-if="correctionLabel" class="view-correction" role="status">{{ correctionLabel }}</span>
            </div>
          </div>
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
            <span>点击任意歌词跳转，[ / ] 校准歌词时间</span>
            <span class="lyric-mode">{{ immersive ? 'IMMERSIVE SPACE' : 'GLASS WINDOW' }}</span>
          </div>
        </footer>
      </section>
    </div>
  </transition>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { LYRIC_FONT_SIZES, LYRIC_OFFSET_STEP_MS, usePlayerStore } from '@/store/player'
import { LYRIC_FIX_MIN_REPORTS, useLyricFixStore } from '@/store/lyricFix'
import { fetchLyricOffset, submitLyricOffset, withdrawLyricOffset } from '@/api/lyric'
import { ElMessage } from 'element-plus'
import { fmtDuration } from '@/utils/format'
import HoloProjector from './HoloProjector.vue'
import Cover from './Cover.vue'

const playerStore = usePlayerStore()
const lyricFixStore = useLyricFixStore()
const bodyRef = ref(null)
const offsetY = ref(0)
const seekPreview = ref(0)
const scrubbing = ref(false)
const lyricReloading = ref(false)

/** 歌词显示偏好统一放在 store 里：译文/罗马音/逐字/沉浸/字号/时间校准跨会话保留。 */
const lyricView = computed(() => playerStore.lyricView)
const immersive = computed({ get: () => lyricView.value.immersive, set: (value) => playerStore.setLyricView({ immersive: Boolean(value) }) })
const showTranslation = computed({ get: () => lyricView.value.showTranslation, set: (value) => playerStore.setLyricView({ showTranslation: Boolean(value) }) })
const showRomaji = computed({ get: () => lyricView.value.showRomaji, set: (value) => playerStore.setLyricView({ showRomaji: Boolean(value) }) })
const showVerbatim = computed({ get: () => lyricView.value.showVerbatim, set: (value) => playerStore.setLyricView({ showVerbatim: Boolean(value) }) })
const fontSize = computed(() => lyricView.value.fontSize)
/** 时间校准（毫秒）：正值＝歌词提前出现，用于修正 LRC 与音频的时间差。 */
const offsetMs = computed(() => lyricView.value.offsetMs)
const offsetLabel = computed(() => {
  const value = offsetMs.value
  if (value === 0) return '校准 0.0s'
  const seconds = Math.abs(value) / 1000
  return `校准 ${value > 0 ? '+' : '−'}${seconds.toFixed(1)}s`
})
const fontScale = computed(() => LYRIC_FONT_SIZES.find((item) => item.key === fontSize.value)?.scale || 1)
/** 歌词时间轴：播放进度叠加校准偏移，只影响高亮/逐字判定，不影响真实播放进度。 */
const lyricTime = computed(() => playerStore.currentTime + offsetMs.value / 1000)

/** 当前高亮行：最后一个 time <= 歌词时间轴的行 */
const activeIndex = computed(() => {
  const time = lyricTime.value
  let index = -1
  for (let i = 0; i < playerStore.lyrics.length; i++) {
    if (playerStore.lyrics[i].time <= time) index = i
    else break
  }
  return index
})

function alignLines(originals, extras) {
  if (!originals.length || !extras.length) return []
  let cursor = 0
  return originals.map((line) => {
    const time = Number(line.time)
    while (cursor + 1 < extras.length) {
      const currentDistance = Math.abs(Number(extras[cursor]?.time) - time)
      const nextDistance = Math.abs(Number(extras[cursor + 1]?.time) - time)
      if (nextDistance > currentDistance) break
      cursor++
    }
    const match = extras[cursor]
    return match && Math.abs(Number(match.time) - time) <= 1.25 ? (match.text || '') : ''
  })
}

/** 逐字歌词按行首时间索引：[分钟:秒.毫秒]<开始,持续>文字 */
const verbatimWordsByTime = computed(() => {
  const map = new Map()
  for (const entry of playerStore.lyricVerbatim || []) {
    if (!entry || !Array.isArray(entry.words) || !entry.words.length) continue
    const key = Number(entry.time)
    if (!Number.isFinite(key) || map.has(key)) continue
    map.set(key, entry.words)
  }
  return map
})

const wordsForLine = (line) => (showVerbatim.value && line ? verbatimWordsByTime.value.get(Number(line.time)) || null : null)
const hasVerbatim = computed(() => (playerStore.lyricVerbatim || []).length > 0)

/** 单字演唱进度（0–100）：只有当前行才需要逐字高亮。 */
const wordProgress = (line, word) => {
  const start = Number(line?.time) + Number(word?.time || 0) / 1000
  const duration = Math.max(0.08, Number(word?.duration || 0) / 1000)
  const now = lyricTime.value
  if (!Number.isFinite(start) || now <= start) return 0
  if (now >= start + duration) return 100
  return ((now - start) / duration) * 100
}

const alignedTranslations = computed(() => alignLines(playerStore.lyrics, playerStore.lyricTranslations))
const alignedRomaji = computed(() => alignLines(playerStore.lyrics, playerStore.lyricRomaji || []))
const hasTranslations = computed(() => alignedTranslations.value.some((text) => String(text || '').trim()))
const hasRomaji = computed(() => alignedRomaji.value.some((text) => String(text || '').trim()))
const viewportWidth = ref(typeof window === 'undefined' ? 1280 : window.innerWidth)
const rowHeight = computed(() => {
  const baseHeight = (immersive.value ? (viewportWidth.value <= 640 ? 60 : 78) : 50) * fontScale.value
  return baseHeight + ((showTranslation.value && hasTranslations.value ? 20 : 0) + (showRomaji.value && hasRomaji.value ? 16 : 0)) * fontScale.value
})

const activeProgress = computed(() => {
  const index = activeIndex.value
  const line = playerStore.lyrics[index]
  if (!line) return 0
  const next = playerStore.lyrics[index + 1]
  if (!next || next.time <= line.time) return 100
  return Math.max(0, Math.min(100, ((lyricTime.value - line.time) / (next.time - line.time)) * 100))
})

const lineStyle = (index) => {
  const distance = index - Math.max(0, activeIndex.value)
  const absDistance = Math.abs(distance)
  return {
    '--row-height': `${rowHeight.value}px`,
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

/** 点击歌词行跳转：换算回真实播放时间，保证跳转后这一行正好高亮。 */
const seekToLine = (line) => {
  const time = Number(line?.time)
  if (!Number.isFinite(time)) return
  seekTo(Math.max(0, time - offsetMs.value / 1000))
}

const setFontSize = (key) => {
  playerStore.setLyricView({ fontSize: key })
  alignActiveLine()
}
const adjustOffset = (deltaMs) => {
  playerStore.adjustLyricOffset(deltaMs)
  alignActiveLine()
}
/** 记录当前偏移是不是由“已知校正”套用的，切到没有校正的歌时才把偏移归零。 */
let appliedSongId = null

const resetOffset = () => {
  playerStore.resetLyricOffset()
  appliedSongId = playerStore.currentSong?.id ?? null
  alignActiveLine()
}

// ---- 歌词时间轴校正：本机账本 + 众包提交（P2-9）----
const submittingOffset = ref(false)

const currentSongId = computed(() => playerStore.currentSong?.id ?? null)
const savedCorrection = computed(() => (currentSongId.value === null ? null : lyricFixStore.correctionFor(currentSongId.value)))
const correctionLabel = computed(() => {
  const saved = savedCorrection.value
  if (!saved) return ''
  if (saved.submitted) return '已提交'
  return saved.offsetMs === 0 ? '已归零' : '本机已存'
})

/**
 * 提交校正：先落本机账本（网络不通也不丢），再尝试提交到服务端。
 * 失败时可重试，pending 列表保留着没提交成功的部分。
 */
async function submitCorrection() {
  const song = playerStore.currentSong
  if (!song) return
  const offset = offsetMs.value
  lyricFixStore.saveCorrection({
    songId: song.id,
    title: song.title || '',
    artist: song.singerName || song.artist || '',
    offsetMs: offset
  })
  if (submittingOffset.value) return
  submittingOffset.value = true
  try {
    if (offset === 0) {
      await withdrawLyricOffset(song.id)
      lyricFixStore.markSubmitted(song.id)
      ElMessage.success('已撤回这首歌词的时间校正')
    } else {
      await submitLyricOffset(song.id, offset)
      lyricFixStore.markSubmitted(song.id)
      ElMessage.success('校正已提交，感谢帮忙对齐时间轴')
    }
  } catch (error) {
    // 登录态缺失或后端不可用：本地账本已经落盘，明确告知还没同步。
    ElMessage.warning('校正已保存在本机，提交到服务器失败，稍后可在同一入口重试')
  } finally {
    submittingOffset.value = false
  }
}

/**
 * 切歌时套用已知校正：本机校正优先，其次是服务端众包结果（达到生效门槛才下发）。
 * 两种情况都没命中、且上一次偏移是校正套用的，才把偏移归零。
 */
watch(currentSongId, async (songId) => {
  if (songId === null || songId === undefined) return
  const local = lyricFixStore.correctionFor(songId)
  if (local) {
    playerStore.setLyricView({ offsetMs: local.offsetMs })
    appliedSongId = songId
    return
  }
  try {
    const remote = await fetchLyricOffset(songId)
    const agreed = Number(remote?.offsetMs)
    const reports = Number(remote?.count) || 0
    if (Number.isFinite(agreed) && reports >= LYRIC_FIX_MIN_REPORTS) {
      playerStore.setLyricView({ offsetMs: agreed })
      appliedSongId = songId
      return
    }
  } catch {
    // 未登录 / 后端不可用：不影响歌词显示，忽略。
  }
  if (appliedSongId !== null) {
    playerStore.resetLyricOffset()
    appliedSongId = null
  }
})
/** 歌词为空（加载失败或曲库暂无歌词）时手动重试一次解析。 */
const reloadLyrics = async () => {
  const song = playerStore.currentSong
  if (!song || lyricReloading.value) return
  lyricReloading.value = true
  try {
    // 换一个请求号，避免被上一次仍在飞行中的解析结果覆盖。
    playerStore.lyricLoadRequestId += 1
    await playerStore.loadLyrics(song)
    alignActiveLine()
  } finally {
    lyricReloading.value = false
  }
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
  if (!playerStore.lyricVisible) return
  if (event.key === 'Escape') {
    event.preventDefault()
    exitOrClose()
    return
  }
  // [ / ] 校准歌词时间，避免手点微小偏移时还要找按钮。
  if (event.key === '[' || event.key === ']') {
    event.preventDefault()
    adjustOffset(event.key === '[' ? -LYRIC_OFFSET_STEP_MS : LYRIC_OFFSET_STEP_MS)
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
.translation-toggle {
  min-width: 0;
  padding: 5px 7px;
  color: var(--holo-primary);
  font-size: 10px;
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
  height: var(--row-height, 50px);
  flex: 0 0 var(--row-height, 50px);
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
.line-content {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  overflow: hidden;
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
.verbatim-word {
  background-image: linear-gradient(90deg, #fff 0%, var(--holo-primary) var(--word-fill, 0%), rgba(226, 232, 240, 0.54) var(--word-fill, 0%), rgba(226, 232, 240, 0.54) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  transition: filter 0.12s linear;
}
.verbatim-word.sung {
  filter: drop-shadow(0 0 10px var(--holo-glow));
}
.line-copy.is-verbatim {
  overflow: visible;
}
.line-romaji {
  font-style: italic;
}
.line-translation {
  overflow: hidden;
  color: color-mix(in srgb, var(--holo-primary) 68%, var(--text-sub));
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  line-height: 1.2;
  letter-spacing: 0.08px;
  opacity: 0.82;
}
.lyric-line.active .line-translation {
  color: color-mix(in srgb, var(--holo-primary) 76%, #fff);
  opacity: 0.95;
  text-shadow: 0 0 12px var(--holo-glow);
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
.lyric-view-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.view-tool-group {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--holo-primary) 16%, var(--border-color));
  background: rgba(255, 255, 255, 0.04);
}
.view-tool {
  min-width: 30px;
  height: 22px;
  padding: 0 8px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-sub);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  transition: color 0.18s ease, background 0.18s ease;
}
.view-tool:hover:not(:disabled) {
  color: var(--holo-primary);
  background: color-mix(in srgb, var(--holo-primary) 14%, transparent);
}
.view-tool.active {
  color: #fff;
  background: color-mix(in srgb, var(--holo-primary) 62%, transparent);
}
.view-tool:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.view-correction {
  color: var(--text-sub);
  font-size: 11px;
  white-space: nowrap;
}
.view-offset {
  min-width: 62px;
  text-align: center;
  color: var(--text-sub);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
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
  height: var(--row-height, 78px);
  flex-basis: var(--row-height, 78px);
  grid-template-columns: 54px minmax(0, 1fr);
  gap: 16px;
  padding: 0 14px;
}
.lyric-panel.immersive .line-copy {
  font-size: 19px;
  letter-spacing: 0.35px;
}
.lyric-panel.immersive .line-translation {
  font-size: 14px;
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
    height: var(--row-height, 60px);
    flex-basis: var(--row-height, 60px);
    grid-template-columns: 34px minmax(0, 1fr);
    gap: 7px;
    padding: 0 4px;
  }
  .lyric-panel.immersive .line-copy {
    font-size: 14px;
  }
  .lyric-panel.immersive .line-translation {
    font-size: 10px;
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
