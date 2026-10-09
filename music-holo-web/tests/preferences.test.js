import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  usePreferencesStore,
  UI_PREFERENCES_KEY,
  SIDEBAR_PREFERENCE_KEY,
  RECENT_SEARCH_STORAGE_KEY,
  SEARCH_HISTORY_LIMITS
} from '../src/store/preferences.js'

describe('本机界面偏好', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-holo-motion')
    setActivePinia(createPinia())
  })

  it('首次启动默认使用柔和动效并在切换时立即应用', () => {
    const preferences = usePreferencesStore()
    expect(preferences.visualMotion).toBe('calm')

    preferences.applyVisualMotion()
    expect(document.documentElement.dataset.holoMotion).toBe('calm')
    expect(preferences.setVisualMotion('cinematic')).toBe(true)
    expect(document.documentElement.dataset.holoMotion).toBe('cinematic')
    expect(JSON.parse(localStorage.getItem(UI_PREFERENCES_KEY)).visualMotion).toBe('cinematic')
  })

  it('保留旧版侧栏偏好并继续同步原有存储键', () => {
    localStorage.setItem(SIDEBAR_PREFERENCE_KEY, 'true')
    const preferences = usePreferencesStore()
    expect(preferences.sidebarCollapsed).toBe(true)

    preferences.setSidebarCollapsed(false)
    expect(localStorage.getItem(SIDEBAR_PREFERENCE_KEY)).toBe('false')
    expect(JSON.parse(localStorage.getItem(UI_PREFERENCES_KEY)).sidebarCollapsed).toBe(false)
  })

  it('拒绝未知动效值并可将界面偏好复原为安全默认值', () => {
    const preferences = usePreferencesStore()
    expect(preferences.setVisualMotion('unknown')).toBe(false)
    preferences.setVisualMotion('cinematic')
    preferences.setSidebarCollapsed(true)
    preferences.reset()

    expect(preferences.visualMotion).toBe('calm')
    expect(preferences.sidebarCollapsed).toBe(false)
    expect(document.documentElement.dataset.holoMotion).toBe('calm')
  })

  it('关闭最近搜索记忆时立即清除搜索词并持久化本机偏好', () => {
    localStorage.setItem(RECENT_SEARCH_STORAGE_KEY, JSON.stringify(['夜航星', '旧日信件']))
    const preferences = usePreferencesStore()

    preferences.setRememberSearchHistory(false)

    expect(preferences.rememberSearchHistory).toBe(false)
    expect(localStorage.getItem(RECENT_SEARCH_STORAGE_KEY)).toBe(null)
    expect(JSON.parse(localStorage.getItem(UI_PREFERENCES_KEY)).rememberSearchHistory).toBe(false)
  })

  it('只接受 4、8、12 条历史上限并在调低时立即截断本机记录', () => {
    const preferences = usePreferencesStore()
    const terms = ['一', '二', '三', '四', '五', '六']
    localStorage.setItem(RECENT_SEARCH_STORAGE_KEY, JSON.stringify(terms))

    expect(SEARCH_HISTORY_LIMITS).toEqual([4, 8, 12])
    expect(preferences.setSearchHistoryLimit(4)).toBe(true)
    expect(preferences.searchHistoryLimit).toBe(4)
    expect(JSON.parse(localStorage.getItem(RECENT_SEARCH_STORAGE_KEY))).toEqual(terms.slice(0, 4))
    expect(preferences.setSearchHistoryLimit(6)).toBe(false)
    expect(preferences.searchHistoryLimit).toBe(4)
  })

  it('可以清空最近搜索，且清空操作不改变记忆开关', () => {
    const preferences = usePreferencesStore()
    localStorage.setItem(RECENT_SEARCH_STORAGE_KEY, JSON.stringify(['夜航星']))

    preferences.clearSearchHistory()

    expect(localStorage.getItem(RECENT_SEARCH_STORAGE_KEY)).toBe(null)
    expect(preferences.rememberSearchHistory).toBe(true)
  })
})
