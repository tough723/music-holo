<template>
  <section class="backup-settings" aria-label="本机设置备份">
    <article class="backup-card glass-panel">
      <div class="backup-heading">
        <div class="setting-symbol"><el-icon><Document /></el-icon></div>
        <div class="setting-copy">
          <h2>本机设置备份</h2>
          <p>在更换浏览器或设备前导出一份 JSON；导入前会校验字段并由你确认。</p>
        </div>
      </div>

      <div class="backup-scope">
        <strong>包含</strong>
        <span>主题与玻璃透明度</span>
        <span>全息动效与侧栏偏好</span>
        <span>播放模式与音量</span>
        <span>搜索记录偏好（不含搜索词）</span>
      </div>

      <div class="backup-actions">
        <el-button type="primary" @click="exportSettings"><el-icon><Download /></el-icon>导出本机配置</el-button>
        <input
          ref="fileInput"
          class="backup-file-input"
          type="file"
          accept=".json,application/json"
          aria-label="选择 Music Holo 设置备份"
          @change="onFileSelected"
        >
        <el-button :loading="importing" @click="fileInput?.click()"><el-icon><Upload /></el-icon>导入配置</el-button>
      </div>

      <el-alert class="backup-security-note" type="info" :closable="false" show-icon>
        <template #title>备份范围刻意保持精简</template>
        <template #default>不会包含账号资料、密码、登录令牌、播放历史、搜索词或自定义源脚本。自定义源请在“自定义源”页单独导出/导入；导入这里的主题设置时，若已登录会尝试同步到账号。</template>
      </el-alert>
    </article>

    <article class="backup-card glass-panel reset-card">
      <div class="backup-heading">
        <div class="setting-symbol"><el-icon><RefreshLeft /></el-icon></div>
        <div class="setting-copy">
          <h2>自定义源备份</h2>
          <p>源脚本与元数据单独打包管理，不会混入普通设置文件。</p>
        </div>
      </div>
      <el-button text type="primary" @click="emit('navigate', 'sources')">前往自定义源管理 <el-icon><ArrowRight /></el-icon></el-button>
    </article>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useThemeStore } from '@/store/theme'
import { usePreferencesStore } from '@/store/preferences'
import { usePlayerStore } from '@/store/player'
import { buildLocalSettingsBackup, parseLocalSettingsBackup } from '@/utils/settingsBackup'

const emit = defineEmits(['navigate'])
const themeStore = useThemeStore()
const preferences = usePreferencesStore()
const player = usePlayerStore()
const fileInput = ref(null)
const importing = ref(false)
const MAX_BACKUP_BYTES = 64 * 1024

function currentSettings() {
  return {
    theme: themeStore.theme,
    glassOpacity: themeStore.glassOpacity,
    visualMotion: preferences.visualMotion,
    sidebarCollapsed: preferences.sidebarCollapsed,
    playbackMode: player.mode,
    volume: player.volume,
    rememberSearchHistory: preferences.rememberSearchHistory,
    showSearchSuggestions: preferences.showSearchSuggestions,
    searchHistoryLimit: preferences.searchHistoryLimit
  }
}

function exportSettings() {
  const backup = buildLocalSettingsBackup(currentSettings())
  const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `music-holo-settings-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  ElMessage.success('本机设置备份已导出')
}

async function applySettings(settings) {
  if (settings.theme && settings.theme !== themeStore.theme) await themeStore.setTheme(settings.theme)
  if (settings.glassOpacity !== undefined) themeStore.setGlassOpacity(settings.glassOpacity)
  if (settings.visualMotion) preferences.setVisualMotion(settings.visualMotion)
  if (settings.sidebarCollapsed !== undefined) preferences.setSidebarCollapsed(settings.sidebarCollapsed)
  if (settings.playbackMode) player.setMode(settings.playbackMode)
  if (settings.volume !== undefined) player.setVolume(settings.volume)
  if (settings.rememberSearchHistory !== undefined) preferences.setRememberSearchHistory(settings.rememberSearchHistory)
  if (settings.showSearchSuggestions !== undefined) preferences.setShowSearchSuggestions(settings.showSearchSuggestions)
  if (settings.searchHistoryLimit !== undefined) preferences.setSearchHistoryLimit(settings.searchHistoryLimit)
}

async function onFileSelected(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (file.size > MAX_BACKUP_BYTES) {
    ElMessage.warning('设置备份文件不能超过 64 KB')
    return
  }

  importing.value = true
  try {
    const parsed = parseLocalSettingsBackup(await file.text())
    const choices = Object.keys(parsed.settings).length
    await ElMessageBox.confirm(
      `将应用备份中的 ${choices} 项本机设置。主题色会立即应用${themeStore.theme !== parsed.settings.theme && parsed.settings.theme ? '，并在已登录时尝试同步到账号' : ''}。此操作不会导入账号资料或音源脚本。`,
      '确认导入本机配置',
      { confirmButtonText: '应用设置', cancelButtonText: '取消', type: 'warning' }
    )
    await applySettings(parsed.settings)
    ElMessage.success('本机设置已应用')
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error?.message || '无法应用这份设置备份')
  } finally {
    importing.value = false
  }
}
</script>

<style scoped>
.backup-settings { display: grid; gap: 14px; min-width: 0; }
.backup-card { min-width: 0; padding: 20px; }
.backup-heading { display: flex; align-items: flex-start; gap: 12px; }
.setting-symbol { display: grid; place-items: center; flex: 0 0 36px; width: 36px; height: 36px; border: 1px solid color-mix(in srgb, var(--holo-primary) 28%, var(--border-color)); border-radius: 11px; color: var(--holo-primary); background: color-mix(in srgb, var(--holo-primary) 9%, transparent); }
.setting-copy { min-width: 0; flex: 1; }
.setting-copy h2 { color: var(--text-main); font-size: 14px; font-weight: 700; }
.setting-copy p { margin-top: 5px; color: var(--text-sub); font-size: 12px; line-height: 1.7; }
.backup-scope { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 0 48px; }
.backup-scope strong, .backup-scope span { padding: 6px 9px; border: 1px solid var(--border-color); border-radius: 999px; color: var(--text-sub); font-size: 10px; }
.backup-scope strong { border-color: color-mix(in srgb, var(--holo-primary) 35%, var(--border-color)); color: var(--holo-primary); }
.backup-actions { display: flex; flex-wrap: wrap; gap: 9px; margin: 17px 0 0 48px; }
.backup-file-input { display: none; }
.backup-security-note { margin-top: 16px; }
.reset-card { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.reset-card .backup-heading { flex: 1; }
.reset-card :deep(.el-button) { flex: 0 0 auto; }
@media (max-width: 680px) {
  .backup-card { padding: 16px; }
  .backup-scope, .backup-actions { margin-left: 0; }
  .reset-card { align-items: flex-start; flex-direction: column; }
}
</style>
