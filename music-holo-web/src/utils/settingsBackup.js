import { THEMES } from '@/store/theme'
import { MODES } from '@/store/player'
import { VISUAL_MOTION_MODES } from '@/store/preferences'

export const LOCAL_SETTINGS_BACKUP_FORMAT = 'music-holo-local-settings'
export const LOCAL_SETTINGS_BACKUP_VERSION = 1

const themeKeys = new Set(THEMES.map(({ key }) => key))
const playbackModeKeys = new Set(MODES.map(({ key }) => key))

/** Build a small, allowlisted backup. It deliberately excludes account data, tokens, history and source scripts. */
export function buildLocalSettingsBackup({
  theme,
  glassOpacity,
  visualMotion,
  sidebarCollapsed,
  playbackMode,
  volume
} = {}, exportedAt = new Date().toISOString()) {
  return {
    format: LOCAL_SETTINGS_BACKUP_FORMAT,
    version: LOCAL_SETTINGS_BACKUP_VERSION,
    exportedAt,
    settings: {
      theme,
      glassOpacity,
      visualMotion,
      sidebarCollapsed,
      playbackMode,
      volume
    }
  }
}

function invalidBackup(message) {
  const error = new Error(message)
  error.name = 'SettingsBackupError'
  return error
}

/** Parse only known primitive settings; unknown fields (including scripts) are never copied into app state. */
export function parseLocalSettingsBackup(input) {
  let payload = input
  if (typeof input === 'string') {
    try {
      payload = JSON.parse(input)
    } catch {
      throw invalidBackup('文件不是有效的 JSON。')
    }
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw invalidBackup('配置文件结构无效。')
  }
  if (payload.format !== LOCAL_SETTINGS_BACKUP_FORMAT) {
    throw invalidBackup('这不是 Music Holo 本机设置备份。')
  }
  if (payload.version !== LOCAL_SETTINGS_BACKUP_VERSION) {
    throw invalidBackup('暂不支持此设置备份版本。')
  }
  if (!payload.settings || typeof payload.settings !== 'object' || Array.isArray(payload.settings)) {
    throw invalidBackup('备份中没有可读取的设置。')
  }

  const source = payload.settings
  const settings = {}
  if (source.theme !== undefined) {
    if (typeof source.theme !== 'string' || !themeKeys.has(source.theme)) throw invalidBackup('主题配置无效。')
    settings.theme = source.theme
  }
  if (source.glassOpacity !== undefined) {
    if (!Number.isInteger(source.glassOpacity) || source.glassOpacity < 40 || source.glassOpacity > 88) {
      throw invalidBackup('玻璃透明度配置无效。')
    }
    settings.glassOpacity = source.glassOpacity
  }
  if (source.visualMotion !== undefined) {
    if (!VISUAL_MOTION_MODES.includes(source.visualMotion)) throw invalidBackup('视觉动效配置无效。')
    settings.visualMotion = source.visualMotion
  }
  if (source.sidebarCollapsed !== undefined) {
    if (typeof source.sidebarCollapsed !== 'boolean') throw invalidBackup('侧栏配置无效。')
    settings.sidebarCollapsed = source.sidebarCollapsed
  }
  if (source.playbackMode !== undefined) {
    if (typeof source.playbackMode !== 'string' || !playbackModeKeys.has(source.playbackMode)) {
      throw invalidBackup('播放模式配置无效。')
    }
    settings.playbackMode = source.playbackMode
  }
  if (source.volume !== undefined) {
    if (typeof source.volume !== 'number' || !Number.isFinite(source.volume) || source.volume < 0 || source.volume > 1) {
      throw invalidBackup('音量配置无效。')
    }
    settings.volume = source.volume
  }
  if (Object.keys(settings).length === 0) throw invalidBackup('备份中没有可应用的设置。')

  return {
    exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : null,
    settings
  }
}
