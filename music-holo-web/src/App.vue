<template>
  <div class="app-shell">
    <HoloEnvironment />
    <div class="route-root">
      <router-view />
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import HoloEnvironment from '@/components/HoloEnvironment.vue'
import { usePlayerStore } from '@/store/player'
import { useUserStore } from '@/store/user'
import { bindDesktopIntegration } from '@/utils/desktopIntegration'
import { bootstrapAutoSources, disposeAutoSourceSessions } from '@/utils/customSourceAuto'

// 桌面集成（托盘 / 全局快捷键 / 桌面歌词窗 / 本机 API / 启动参数）在应用启动时绑定，
// 网页版没有这些桥接，bindDesktopIntegration 会直接返回空解绑函数。
const playerStore = usePlayerStore()
const userStore = useUserStore()
const router = useRouter()
let unbind = null
let autoRunPromise = null
const startAutoSources = () => {
  if (!userStore.isLogin || autoRunPromise) return autoRunPromise
  autoRunPromise = bootstrapAutoSources().catch(() => null)
  return autoRunPromise
}
onMounted(() => {
  unbind = bindDesktopIntegration({ playerStore, router })
  startAutoSources()
})
watch(() => userStore.isLogin, (loggedIn) => {
  if (loggedIn) {
    autoRunPromise = null
    startAutoSources()
  }
})
onBeforeUnmount(() => {
  unbind?.()
  disposeAutoSourceSessions()
})
</script>

<style>
.app-shell {
  position: relative;
  min-height: 100vh;
  isolation: isolate;
  transform-style: preserve-3d;
}
.route-root {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  transform-style: preserve-3d;
}
</style>
