import { defineStore } from 'pinia'

export const UI_PREFERENCES_KEY = 'mh_ui_preferences_v1'
export const SIDEBAR_PREFERENCE_KEY = 'mh_sidebar_collapsed'
export const RECENT_SEARCH_STORAGE_KEY = 'music-holo-recent-searches'
export const VISUAL_MOTION_MODES = ['calm', 'cinematic']
export const SEARCH_HISTORY_LIMITS = [4, 8, 12]

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

function readSearchHistory() {
  try {
    const value = JSON.parse(readStorage(RECENT_SEARCH_STORAGE_KEY) || '[]')
    return Array.isArray(value)
      ? value.filter((term) => typeof term === 'string' && term.trim()).map((term) => term.trim())
      : []
  } catch {
    return []
  }
}

function persistSearchHistory(terms) {
  try {
    localStorage.setItem(RECENT_SEARCH_STORAGE_KEY, JSON.stringify(terms))
  } catch {
    // Search history is optional and remains local to this browser.
  }
}

function readSidebarPreference(saved = readPreferences()) {
  if (typeof saved.sidebarCollapsed === 'boolean') return saved.sidebarCollapsed
  return readStorage(SIDEBAR_PREFERENCE_KEY) === 'true'
}

function persistPreferences(store) {
  const payload = {
    visualMotion: store.visualMotion,
    sidebarCollapsed: store.sidebarCollapsed,
    rememberSearchHistory: store.rememberSearchHistory,
    showSearchSuggestions: store.showSearchSuggestions,
    searchHistoryLimit: store.searchHistoryLimit
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
      sidebarCollapsed: readSidebarPreference(saved),
      rememberSearchHistory: typeof saved.rememberSearchHistory === 'boolean' ? saved.rememberSearchHistory : true,
      showSearchSuggestions: typeof saved.showSearchSuggestions === 'boolean' ? saved.showSearchSuggestions : true,
      searchHistoryLimit: SEARCH_HISTORY_LIMITS.includes(saved.searchHistoryLimit) ? saved.searchHistoryLimit : 8
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
    setRememberSearchHistory(value) {
      this.rememberSearchHistory = Boolean(value)
      if (!this.rememberSearchHistory) {
        try {
          localStorage.removeItem(RECENT_SEARCH_STORAGE_KEY)
        } catch {
          // Ignore blocked storage; Search.vue also stops reading/writing while disabled.
        }
      }
      persistPreferences(this)
    },
    setShowSearchSuggestions(value) {
      this.showSearchSuggestions = Boolean(value)
      persistPreferences(this)
    },
    setSearchHistoryLimit(value) {
      const limit = Number(value)
      if (!SEARCH_HISTORY_LIMITS.includes(limit)) return false
      this.searchHistoryLimit = limit
      if (this.rememberSearchHistory) persistSearchHistory(readSearchHistory().slice(0, limit))
      persistPreferences(this)
      return true
    },
    clearSearchHistory() {
      try {
        localStorage.removeItem(RECENT_SEARCH_STORAGE_KEY)
      } catch {
        // Ignore blocked storage.
      }
    },
    reset() {
      this.visualMotion = 'calm'
      this.sidebarCollapsed = false
      this.rememberSearchHistory = true
      this.showSearchSuggestions = true
      this.searchHistoryLimit = 8
      this.applyVisualMotion()
      persistPreferences(this)
    }
  }
})
