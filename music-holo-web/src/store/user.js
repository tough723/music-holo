import { defineStore } from 'pinia'
import * as authApi from '@/api/auth'
import { useThemeStore } from './theme'

const TOKEN_KEY = 'mh_token'
const USER_KEY = 'mh_user'

export const useUserStore = defineStore('user', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) || '',
    userInfo: JSON.parse(localStorage.getItem(USER_KEY) || 'null')
  }),
  getters: {
    isLogin: (state) => !!state.token,
    isAdmin: (state) => state.userInfo?.role === 0
  },
  actions: {
    async login(form) {
      const data = await authApi.login(form)
      this.token = data.token
      this.userInfo = data.userInfo
      localStorage.setItem(TOKEN_KEY, data.token)
      localStorage.setItem(USER_KEY, JSON.stringify(data.userInfo))
      // 应用服务端保存的个性化主题
      const themeStore = useThemeStore()
      if (data.userInfo?.theme) {
        themeStore.apply(data.userInfo.theme)
      }
      return data
    },
    async register(form) {
      return await authApi.register(form)
    },
    async fetchInfo() {
      const info = await authApi.info()
      this.userInfo = info
      localStorage.setItem(USER_KEY, JSON.stringify(info))
      const themeStore = useThemeStore()
      if (info?.theme) {
        themeStore.apply(info.theme)
      }
      return info
    },
    async logout() {
      try {
        await authApi.logout()
      } catch (e) {
        // 忽略退出接口异常
      }
      this.logoutLocal()
    },
    logoutLocal() {
      this.token = ''
      this.userInfo = null
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    }
  }
})
