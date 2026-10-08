<template>
  <section class="general-settings" aria-label="通用设置">
    <article class="setting-card glass-panel motion-card">
      <div class="setting-card-head">
        <div class="setting-symbol"><el-icon><View /></el-icon></div>
        <div class="setting-copy">
          <h2>全息场景动效</h2>
          <p>调整背景光束、轨道与投影脉冲的动态强度；3D 场景与正在播放的唱片效果仍会保留。</p>
        </div>
      </div>

      <div class="motion-choices" role="radiogroup" aria-label="全息场景动效">
        <label class="motion-choice" :class="{ active: preferences.visualMotion === 'calm' }">
          <input
            type="radio"
            name="holo-motion-mode"
            value="calm"
            :checked="preferences.visualMotion === 'calm'"
            @change="preferences.setVisualMotion('calm')"
          >
          <span class="motion-choice-mark"><i></i></span>
          <span class="motion-choice-copy">
            <strong>柔和全息</strong>
            <small>默认 · 稳定光束，减弱闪烁与粒子变化</small>
          </span>
          <el-tag v-if="preferences.visualMotion === 'calm'" size="small" effect="plain">当前</el-tag>
        </label>
        <label class="motion-choice" :class="{ active: preferences.visualMotion === 'cinematic' }">
          <input
            type="radio"
            name="holo-motion-mode"
            value="cinematic"
            :checked="preferences.visualMotion === 'cinematic'"
            @change="preferences.setVisualMotion('cinematic')"
          >
          <span class="motion-choice-mark is-animated"><i></i></span>
          <span class="motion-choice-copy">
            <strong>影院动态</strong>
            <small>启用缓慢漂移与环境粒子，适合偏好动态背景的场景</small>
          </span>
          <el-tag v-if="preferences.visualMotion === 'cinematic'" size="small" effect="plain">当前</el-tag>
        </label>
      </div>

      <div class="setting-footnote"><el-icon><InfoFilled /></el-icon>若操作系统开启“减少动态效果”，浏览器仍会优先遵循系统偏好。</div>
    </article>

    <article class="setting-card glass-panel">
      <div class="setting-card-head">
        <div class="setting-symbol"><el-icon><Menu /></el-icon></div>
        <div class="setting-copy">
          <h2>导航布局</h2>
          <p>宽屏下默认收起左侧导航；窄屏会自动切换为抽屉导航。</p>
        </div>
      </div>
      <div class="setting-row">
        <div>
          <strong>默认收起侧栏</strong>
          <small>只保留图标，为主舞台留出更多空间</small>
        </div>
        <el-switch
          :model-value="preferences.sidebarCollapsed"
          aria-label="默认收起侧栏"
          @change="preferences.setSidebarCollapsed"
        />
      </div>
    </article>

    <article class="setting-card glass-panel">
      <div class="setting-card-head">
        <div class="setting-symbol"><el-icon><Search /></el-icon></div>
        <div class="setting-copy">
          <h2>快捷操作</h2>
          <p>全局搜索可从任意页面快速打开。</p>
        </div>
      </div>
      <div class="shortcut-row">
        <span>聚焦全局搜索</span>
        <kbd>⌘ K</kbd>
        <kbd>Ctrl K</kbd>
      </div>
    </article>

    <article class="source-safety-note glass-panel">
      <div class="setting-symbol"><el-icon><Lock /></el-icon></div>
      <div class="setting-copy">
        <h2>自定义源安全边界</h2>
        <p>导入的脚本默认仅作为本机文件保存，不会自动执行。兼容检测与试听使用受限 Worker 和浏览器 CORS，不开放页面 DOM 或服务器代理权限。</p>
      </div>
      <el-button text type="primary" @click="emit('navigate', 'sources')">管理自定义源 <el-icon><ArrowRight /></el-icon></el-button>
    </article>
  </section>
</template>

<script setup>
import { usePreferencesStore } from '@/store/preferences'

const preferences = usePreferencesStore()
const emit = defineEmits(['navigate'])
</script>

<style scoped>
.general-settings { display: grid; gap: 14px; min-width: 0; }
.setting-card, .source-safety-note { min-width: 0; padding: 20px; }
.setting-card-head { display: flex; align-items: flex-start; gap: 12px; }
.setting-symbol { display: grid; place-items: center; flex: 0 0 36px; width: 36px; height: 36px; border: 1px solid color-mix(in srgb, var(--holo-primary) 28%, var(--border-color)); border-radius: 11px; color: var(--holo-primary); background: color-mix(in srgb, var(--holo-primary) 9%, transparent); }
.setting-copy { min-width: 0; flex: 1; }
.setting-copy h2 { color: var(--text-main); font-size: 14px; font-weight: 700; }
.setting-copy p { margin-top: 5px; color: var(--text-sub); font-size: 12px; line-height: 1.7; }
.motion-choices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 16px 0 0 48px; }
.motion-choice { min-width: 0; min-height: 74px; padding: 12px; display: flex; align-items: center; gap: 10px; border: 1px solid var(--border-color); border-radius: 12px; background: rgba(15, 23, 42, 0.28); cursor: pointer; transition: border-color .18s ease, background .18s ease, transform .18s ease; }
.motion-choice:hover { border-color: color-mix(in srgb, var(--holo-primary) 42%, var(--border-color)); transform: translateY(-1px); }
.motion-choice.active { border-color: color-mix(in srgb, var(--holo-primary) 65%, var(--border-color)); background: color-mix(in srgb, var(--holo-primary) 8%, transparent); box-shadow: 0 0 22px -15px var(--holo-glow); }
.motion-choice input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.motion-choice:focus-within { outline: 2px solid color-mix(in srgb, var(--holo-primary) 72%, white); outline-offset: 2px; }
.motion-choice-mark { position: relative; flex: 0 0 26px; width: 26px; height: 26px; display: grid; place-items: center; border: 1px solid color-mix(in srgb, var(--holo-primary) 42%, transparent); border-radius: 50%; }
.motion-choice-mark::before, .motion-choice-mark::after { content: ''; position: absolute; border: 1px solid var(--holo-primary); border-radius: 50%; opacity: .65; }
.motion-choice-mark::before { width: 15px; height: 7px; transform: rotateX(62deg); }
.motion-choice-mark::after { width: 21px; height: 10px; transform: rotateX(62deg) rotateZ(58deg); border-color: var(--holo-secondary); }
.motion-choice-mark i { width: 5px; height: 5px; border-radius: 50%; background: #fff; box-shadow: 0 0 8px var(--holo-primary); }
.motion-choice-mark.is-animated::after { animation: choice-orbit 7s linear infinite; }
@keyframes choice-orbit { to { rotate: 0 0 1 360deg; } }
.motion-choice-copy { min-width: 0; flex: 1; display: grid; gap: 4px; }
.motion-choice-copy strong { font-size: 12px; }
.motion-choice-copy small { color: var(--text-sub); font-size: 10px; line-height: 1.5; }
.setting-footnote { display: flex; align-items: center; gap: 6px; margin: 13px 0 0 48px; color: var(--text-sub); font-size: 11px; line-height: 1.6; }
.setting-footnote :deep(.el-icon) { flex: 0 0 auto; color: var(--holo-primary); }
.setting-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin: 15px 0 0 48px; padding-top: 13px; border-top: 1px solid var(--border-color); }
.setting-row > div { display: grid; gap: 5px; }
.setting-row strong { font-size: 12px; }
.setting-row small { color: var(--text-sub); font-size: 10px; }
.shortcut-row { display: flex; align-items: center; gap: 8px; margin: 14px 0 0 48px; color: var(--text-sub); font-size: 12px; }
kbd { padding: 4px 7px; border: 1px solid var(--border-color); border-radius: 6px; background: rgba(15, 23, 42, .44); color: var(--text-main); font: inherit; font-size: 10px; }
.source-safety-note { display: flex; align-items: center; gap: 12px; border-color: color-mix(in srgb, var(--holo-primary) 22%, var(--border-color)); background: color-mix(in srgb, var(--holo-primary) 4%, var(--bg-panel)); }
.source-safety-note .setting-copy { flex: 1; }
.source-safety-note :deep(.el-button) { flex: 0 0 auto; }
@media (max-width: 700px) {
  .setting-card, .source-safety-note { padding: 16px; }
  .motion-choices { grid-template-columns: 1fr; margin-left: 0; }
  .setting-footnote, .setting-row, .shortcut-row { margin-left: 0; }
  .source-safety-note { align-items: flex-start; flex-wrap: wrap; }
  .source-safety-note .setting-copy { flex-basis: calc(100% - 50px); }
  .source-safety-note :deep(.el-button) { margin-left: 48px; }
}
</style>
