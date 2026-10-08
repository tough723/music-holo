import { defineStore } from 'pinia'
import * as systemApi from '@/api/system'
import { useUserStore } from './user'

/** 平台支持的 3D 全息主题 */
export const THEMES = [
  { key: 'cyan', label: '深空棱镜', desc: '冷色星雾与清透玻璃', primary: '#22d3ee', secondary: '#818cf8', mood: 'DEEP SPACE' },
  { key: 'magenta', label: '紫雾回响', desc: '柔和霓虹与流动声场', primary: '#f472b6', secondary: '#c084fc', mood: 'NEON HAZE' },
  { key: 'amber', label: '琥珀舞台', desc: '暖色灯束与黑胶余温', primary: '#fbbf24', secondary: '#fb7185', mood: 'GOLDEN STAGE' },
  { key: 'lime', label: '矩阵声场', desc: '荧绿数据与空间网格', primary: '#a3e635', secondary: '#34d399', mood: 'SOUND MATRIX' },
  { key: 'ruby', label: '绯红现场', desc: '红色演出灯与深玻璃质感', primary: '#ff536b', secondary: '#ff9b83', mood: 'LIVE ROOM' }
]

const THEME_KEY = 'mh_theme'
const GLASS_KEY = 'mh_glass_opacity'

const readGlassOpacity = () => {
  const saved = Number(localStorage.getItem(GLASS_KEY))
  return Number.isFinite(saved) && saved > 0 ? Math.max(40, Math.min(88, saved)) : 68
}

/** 十六进制颜色转 rgba */
export function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const useThemeStore = defineStore('theme', {
  state: () => ({
    theme: localStorage.getItem(THEME_KEY) || 'cyan',
    /** 面板不透明度，越低越通透；仅保存在当前浏览器 */
    glassOpacity: readGlassOpacity()
  }),
  getters: {
    current: (state) => THEMES.find((t) => t.key === state.theme) || THEMES[0]
  },
  actions: {
    /** 应用主题：改写 CSS 变量 + 标记 data-theme + 持久化 */
    apply(key) {
      const theme = THEMES.find((t) => t.key === key) || THEMES[0]
      this.theme = theme.key
      const root = document.documentElement
      root.style.setProperty('--holo-primary', theme.primary)
      root.style.setProperty('--holo-secondary', theme.secondary)
      root.style.setProperty('--holo-glow', hexToRgba(theme.primary, 0.45))
      root.dataset.theme = theme.key
      localStorage.setItem(THEME_KEY, theme.key)
      this.applyGlassOpacity(this.glassOpacity)
    },
    /** 设置全站玻璃面板不透明度 */
    applyGlassOpacity(value) {
      const opacity = Math.max(40, Math.min(88, Math.round(Number(value) || 68)))
      this.glassOpacity = opacity
      const alpha = (opacity / 100).toFixed(2)
      document.documentElement.style.setProperty('--glass-alpha', alpha)
      document.documentElement.style.setProperty('--bg-panel', `rgba(8, 14, 34, ${alpha})`)
      localStorage.setItem(GLASS_KEY, String(opacity))
    },
    setGlassOpacity(value) {
      this.applyGlassOpacity(value)
    },
    /** 切换主题并同步到服务端（仅登录用户） */
    async setTheme(key) {
      this.apply(key)
      const userStore = useUserStore()
      if (!userStore.isLogin) return { synced: false, localOnly: true }
      try {
        await systemApi.setTheme({ theme: key, scope: 'user' })
        return { synced: true, localOnly: false }
      } catch (e) {
        // 同步失败不影响本地主题；由设置页明确提示并允许用户重试。
        return { synced: false, localOnly: false }
      }
    }
  }
})
