<template>
  <section class="playback-settings" aria-label="播放偏好">
    <article class="setting-card glass-panel">
      <div class="setting-card-head">
        <div class="setting-symbol"><el-icon><Headset /></el-icon></div>
        <div class="setting-copy">
          <h2>播放模式</h2>
          <p>立即应用到全局播放器，并保存在此设备。</p>
        </div>
      </div>
      <el-radio-group
        :model-value="player.mode"
        class="mode-options"
        aria-label="播放模式"
        @change="player.setMode"
      >
        <el-radio-button v-for="mode in MODES" :key="mode.key" :label="mode.key">{{ mode.label }}</el-radio-button>
      </el-radio-group>
    </article>

    <article class="setting-card glass-panel">
      <div class="setting-card-head">
        <div class="setting-symbol"><el-icon><Microphone /></el-icon></div>
        <div class="setting-copy">
          <h2>播放器音量</h2>
          <p>与底部播放器同步；本机媒体音量会按 0–100% 保存。</p>
        </div>
        <el-tag effect="plain" round>{{ volumePercent }}%</el-tag>
      </div>
      <div class="volume-control">
        <el-icon><Mute /></el-icon>
        <el-slider
          :model-value="volumePercent"
          :min="0"
          :max="100"
          :show-tooltip="true"
          :format-tooltip="(value) => `${value}%`"
          aria-label="播放器音量"
          @input="setVolume"
        />
        <el-icon><Headset /></el-icon>
      </div>
    </article>

    <article class="now-playing-card glass-panel" aria-live="polite">
      <div class="setting-symbol"><el-icon><VideoPlay /></el-icon></div>
      <div class="setting-copy">
        <h2>当前播放</h2>
        <p v-if="player.currentSong">{{ player.currentSong.title }} · {{ player.currentSong.singerName || '未知歌手' }}</p>
        <p v-else>播放队列为空；从曲库选择歌曲后，播放设置会立即生效。</p>
      </div>
      <el-tag v-if="player.currentSong?.isCustomSource" type="warning" effect="plain">本次会话试听</el-tag>
      <el-tag v-else-if="player.playing" type="success" effect="plain">正在播放</el-tag>
    </article>

    <div class="playback-footnote"><el-icon><InfoFilled /></el-icon>浏览器自定义源试听与本地音频不会写入服务端播放历史，也不会恢复到持久队列。</div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { MODES, usePlayerStore } from '@/store/player'

const player = usePlayerStore()
const volumePercent = computed(() => Math.round(player.volume * 100))
const setVolume = (value) => player.setVolume(Number(value) / 100)
</script>

<style scoped>
.playback-settings { display: grid; gap: 14px; min-width: 0; }
.setting-card, .now-playing-card { min-width: 0; padding: 20px; }
.setting-card-head, .now-playing-card { display: flex; align-items: center; gap: 12px; }
.setting-card-head { align-items: flex-start; }
.setting-symbol { display: grid; place-items: center; flex: 0 0 36px; width: 36px; height: 36px; border: 1px solid color-mix(in srgb, var(--holo-primary) 28%, var(--border-color)); border-radius: 11px; color: var(--holo-primary); background: color-mix(in srgb, var(--holo-primary) 9%, transparent); }
.setting-copy { min-width: 0; flex: 1; }
.setting-copy h2 { color: var(--text-main); font-size: 14px; font-weight: 700; }
.setting-copy p { margin-top: 5px; color: var(--text-sub); font-size: 12px; line-height: 1.7; }
.mode-options { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 0 48px; }
.mode-options :deep(.el-radio-button__inner) { border: 1px solid var(--border-color); border-radius: 9px !important; background: rgba(15, 23, 42, .38); box-shadow: none !important; }
.mode-options :deep(.el-radio-button:first-child .el-radio-button__inner), .mode-options :deep(.el-radio-button:last-child .el-radio-button__inner) { border-radius: 9px; }
.mode-options :deep(.el-radio-button.is-active .el-radio-button__inner) { border-color: var(--holo-primary); background: color-mix(in srgb, var(--holo-primary) 16%, #0d1430); color: var(--text-main); box-shadow: 0 0 18px -12px var(--holo-glow) !important; }
.volume-control { display: flex; align-items: center; gap: 12px; margin: 18px 10px 0 48px; color: var(--holo-primary); }
.volume-control .el-slider { flex: 1; }
.volume-control :deep(.el-slider__runway) { background: color-mix(in srgb, var(--holo-primary) 12%, var(--border-color)); }
.now-playing-card { align-items: flex-start; }
.now-playing-card .setting-copy { flex: 1; }
.playback-footnote { display: flex; align-items: flex-start; gap: 7px; color: var(--text-sub); font-size: 11px; line-height: 1.6; }
.playback-footnote :deep(.el-icon) { flex: 0 0 auto; margin-top: 2px; color: var(--holo-primary); }
@media (max-width: 700px) {
  .setting-card, .now-playing-card { padding: 16px; }
  .mode-options, .volume-control { margin-left: 0; }
  .mode-options { gap: 6px; }
  .mode-options :deep(.el-radio-button__inner) { padding: 9px 10px; }
}
</style>
