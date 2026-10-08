import { defineStore } from 'pinia'

export const UI_PREFERENCES_KEY = 'mh_ui_preferences_v1'
export const SIDEBAR_PREFERENCE_KEY = 'mh_sidebar_collapsed'
export const VISUAL_MOTION_MODES = ['calm', 'cinematic']

function readStorage(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function readPreferences() {
  try {
    const value = JSON.parse(readStorage(UI_PREFERENCES_KEY) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

function readSidebarPreference() {
  const saved = readPreferences()
  if (typeof saved.sidebarCollapsed === 'boolean') return saved.sidebarCollapsed
  return readStorage(SIDEBAR_PREFERENCE_KEY) === 'true'
}

function persistPreferences(store) {
  const payload = {
    visualMotion: store.visualMotion,
    sidebarCollapsed: store.sidebarCollapsed
  }

  try {
    localStorage.setItem(UI_PREFERENCES_KEY, JSON.stringify(payload))
    // Keep the original key in sync for existing installs and integrations.
    localStorage.setItem(SIDEBAR_PREFERENCE_KEY, String(store.sidebarCollapsed))
  } catch {
    // Visual settings are optional and should remain usable when storage is blocked.
  }
}

export const usePreferencesStore = defineStore('preferences', {
  state: () => {
    const saved = readPreferences()
    return {
      // Calm is the safe default: keep the 3D scene, but stop high-contrast ambient pulsing.
      visualMotion: VISUAL_MOTION_MODES.includes(saved.visualMotion) ? saved.visualMotion : 'calm',
      sidebarCollapsed: readSidebarPreference()
    }
  },
  actions: {
    applyVisualMotion() {
      if (typeof document !== 'undefined') {
        document.documentElement.dataset.holoMotion = this.visualMotion
      }
    },
    setVisualMotion(mode) {
      if (!VISUAL_MOTION_MODES.includes(mode)) return false
      this.visualMotion = mode
      this.applyVisualMotion()
      persistPreferences(this)
      return true
    },
    setSidebarCollapsed(value) {
      this.sidebarCollapsed = Boolean(value)
      persistPreferences(this)
    },
    reset() {
      this.visualMotion = 'calm'
      this.sidebarCollapsed = false
      this.applyVisualMotion()
      persistPreferences(this)
    }
  }
})
