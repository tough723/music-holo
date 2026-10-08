import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'
import './styles/global.css'

import { useThemeStore } from './store/theme'
import { usePreferencesStore } from './store/preferences'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.use(ElementPlus, { locale: zhCn })

// 注册全部 Element Plus 图标
for (const [name, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(name, component)
}

// 初始化外观偏好，避免首屏先播放强闪烁动效再切换到用户设置。
const preferencesStore = usePreferencesStore(pinia)
preferencesStore.applyVisualMotion()

// 初始化主题（CSS 变量 + data-theme）
const themeStore = useThemeStore(pinia)
themeStore.apply(themeStore.theme)

app.mount('#app')
