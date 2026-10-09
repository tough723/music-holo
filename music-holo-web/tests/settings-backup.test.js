import { describe, expect, it } from 'vitest'
import {
  buildLocalSettingsBackup,
  LOCAL_SETTINGS_BACKUP_FORMAT,
  LOCAL_SETTINGS_BACKUP_VERSION,
  parseLocalSettingsBackup
} from '../src/utils/settingsBackup.js'

describe('本机设置备份', () => {
  it('导出并读取允许的外观、动效、侧栏与播放偏好', () => {
    const backup = buildLocalSettingsBackup({
      theme: 'magenta',
      glassOpacity: 72,
      visualMotion: 'calm',
      sidebarCollapsed: true,
      playbackMode: 'random',
      volume: 0.45,
      rememberSearchHistory: false,
      showSearchSuggestions: false,
      searchHistoryLimit: 4
    }, '2026-10-09T00:00:00.000Z')

    expect(backup).toMatchObject({
      format: LOCAL_SETTINGS_BACKUP_FORMAT,
      version: LOCAL_SETTINGS_BACKUP_VERSION,
      exportedAt: '2026-10-09T00:00:00.000Z'
    })
    expect(parseLocalSettingsBackup(JSON.stringify(backup))).toEqual({
      exportedAt: '2026-10-09T00:00:00.000Z',
      settings: {
        theme: 'magenta',
        glassOpacity: 72,
        visualMotion: 'calm',
        sidebarCollapsed: true,
        playbackMode: 'random',
        volume: 0.45,
        rememberSearchHistory: false,
        showSearchSuggestions: false,
        searchHistoryLimit: 4
      }
    })
  })

  it('仅拣选白名单字段，不会把令牌或自定义源脚本写回设置', () => {
    const parsed = parseLocalSettingsBackup({
      format: LOCAL_SETTINGS_BACKUP_FORMAT,
      version: LOCAL_SETTINGS_BACKUP_VERSION,
      settings: { theme: 'amber', accessToken: 'secret', customSourceScript: 'alert(1)' }
    })

    expect(parsed.settings).toEqual({ theme: 'amber' })
    expect(parsed.settings).not.toHaveProperty('accessToken')
    expect(parsed.settings).not.toHaveProperty('customSourceScript')
  })

  it('拒绝格式、版本与值越界的备份', () => {
    expect(() => parseLocalSettingsBackup('{not json')).toThrow('文件不是有效的 JSON')
    expect(() => parseLocalSettingsBackup({ format: 'other', version: 1, settings: { theme: 'cyan' } })).toThrow('不是 Music Holo')
    expect(() => parseLocalSettingsBackup({ format: LOCAL_SETTINGS_BACKUP_FORMAT, version: 2, settings: { theme: 'cyan' } })).toThrow('不支持此设置备份版本')
    expect(() => parseLocalSettingsBackup({
      format: LOCAL_SETTINGS_BACKUP_FORMAT,
      version: LOCAL_SETTINGS_BACKUP_VERSION,
      settings: { volume: 2 }
    })).toThrow('音量配置无效')
    expect(() => parseLocalSettingsBackup({
      format: LOCAL_SETTINGS_BACKUP_FORMAT,
      version: LOCAL_SETTINGS_BACKUP_VERSION,
      settings: { rememberSearchHistory: 'no' }
    })).toThrow('搜索历史偏好无效')
    expect(() => parseLocalSettingsBackup({
      format: LOCAL_SETTINGS_BACKUP_FORMAT,
      version: LOCAL_SETTINGS_BACKUP_VERSION,
      settings: { searchHistoryLimit: 6 }
    })).toThrow('搜索历史条数配置无效')
  })
})
