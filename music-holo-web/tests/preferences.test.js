import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePreferencesStore, UI_PREFERENCES_KEY, SIDEBAR_PREFERENCE_KEY } from '../src/store/preferences.js'

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
})
