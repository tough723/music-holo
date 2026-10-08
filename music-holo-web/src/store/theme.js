import { defineStore } from 'pinia'
import * as systemApi from '@/api/system'
import { useUserStore } from './user'

/** 平台支持的全部全息主题 */
export const THEMES = [
  { key: 'cyan', label: '青蓝全息', desc: '深空海洋般的冷冽光芒', primary: '#22d3ee', secondary: '#818cf8' },
  { key: 'magenta', label: '品红幻境', desc: '赛博朋克的迷幻色调', primary: '#f472b6', secondary: '#c084fc' },
  { key: 'amber', label: '琥珀暖光', desc: '旧胶片般的温暖余晖', primary: '#fbbf24', secondary: '#fb7185' },
  { key: 'lime', label: '翠绿矩阵', desc: '黑客帝国的数据绿光', primary: '#a3e635', secondary: '#34d399' }
]

const THEME_KEY = 'mh_theme'

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
    theme: localStorage.getItem(THEME_KEY) || 'cyan'
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
    },
    /** 切换主题并同步到服务端（仅登录用户） */
    async setTheme(key) {
      this.apply(key)
      const userStore = useUserStore()
      if (userStore.isLogin) {
        try {
          await systemApi.setTheme({ theme: key, scope: 'user' })
        } catch (e) {
          // 同步失败不影响本地主题
        }
      }
    }
  }
})
