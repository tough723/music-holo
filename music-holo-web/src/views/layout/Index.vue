<template>
  <div class="layout">
    <!-- 侧边导航 -->
    <aside class="sidebar glass-panel">
      <div class="logo" @click="$router.push('/home')">
        <div class="logo-icon">
          <el-icon><ChromeFilled /></el-icon>
        </div>
        <div class="logo-text">
          <div class="logo-title holo-text">全息音乐</div>
          <div class="logo-sub">MUSIC HOLO</div>
        </div>
      </div>

      <el-menu
        :default-active="activeMenu"
        class="nav-menu"
        :router="true"
      >
        <el-menu-item index="/home">
          <el-icon><HomeFilled /></el-icon><span>首页</span>
        </el-menu-item>
        <el-menu-item index="/daily">
          <el-icon><Calendar /></el-icon><span>每日推荐</span>
        </el-menu-item>
        <el-menu-item index="/singers">
          <el-icon><User /></el-icon><span>歌手</span>
        </el-menu-item>
        <el-menu-item index="/playlists">
          <el-icon><Collection /></el-icon><span>歌单</span>
        </el-menu-item>
        <el-menu-item index="/songs">
          <el-icon><Headset /></el-icon><span>歌曲</span>
        </el-menu-item>
        <el-menu-item index="/search">
          <el-icon><Search /></el-icon><span>全局搜索</span>
        </el-menu-item>
        <el-menu-item index="/charts">
          <el-icon><TrendCharts /></el-icon><span>排行榜</span>
        </el-menu-item>
        <el-menu-item v-if="userStore.isLogin" index="/recent">
          <el-icon><Clock /></el-icon><span>最近播放</span>
        </el-menu-item>
        <el-menu-item index="/favorites">
          <el-icon><Star /></el-icon><span>我的收藏</span>
        </el-menu-item>
        <el-menu-item index="/queue">
          <el-icon><List /></el-icon><span>播放列表</span>
        </el-menu-item>

        <el-sub-menu v-if="userStore.isAdmin" index="admin">
          <template #title>
            <el-icon><Setting /></el-icon><span>管理后台</span>
          </template>
          <el-menu-item index="/admin/dashboard">
            <el-icon><DataAnalysis /></el-icon><span>仪表盘</span>
          </el-menu-item>
          <el-menu-item index="/admin/singers">
            <el-icon><User /></el-icon><span>歌手管理</span>
          </el-menu-item>
          <el-menu-item index="/admin/songs">
            <el-icon><Headset /></el-icon><span>歌曲管理</span>
          </el-menu-item>
          <el-menu-item index="/admin/playlists">
            <el-icon><Collection /></el-icon><span>歌单管理</span>
          </el-menu-item>
          <el-menu-item index="/admin/categories">
            <el-icon><CollectionTag /></el-icon><span>分类管理</span>
          </el-menu-item>
          <el-menu-item index="/admin/reviews">
            <el-icon><ChatDotRound /></el-icon><span>短评审核</span>
          </el-menu-item>
        </el-sub-menu>

              <el-menu-item index="/settings">
                <el-icon><Setting /></el-icon><span>设置</span>
              </el-menu-item>
            </el-menu>

      <div class="sidebar-footer">
        <div class="mini-holo">
          <HoloProjector
            :cover="playerStore.currentSong?.cover"
            :title="playerStore.currentSong?.title"
            :playing="playerStore.playing"
            :size="72"
          />
        </div>
      </div>
    </aside>

    <!-- 主区域 -->
    <div class="main">
      <header class="header glass-panel">
        <el-button
          class="mobile-menu-trigger"
          circle
          text
          aria-label="打开导航"
          :aria-expanded="mobileNavVisible"
          @click="mobileNavVisible = true"
        >
          <el-icon><Menu /></el-icon>
        </el-button>
        <div class="header-title-wrap">
          <div class="header-mark" :class="{ 'is-playing': playerStore.playing }" aria-hidden="true">
            <div class="header-mark__beam"></div>
            <div class="header-mark__disc"><i></i></div>
            <div class="header-mark__orbit"></div>
          </div>
          <div class="header-title-block">
            <div class="header-title">{{ pageTitle }}</div>
            <div class="header-kicker">{{ headerCaption }}</div>
          </div>
        </div>
        <div class="header-search">
          <el-input
            ref="searchInput"
            v-model="searchTerm"
            size="default"
            clearable
            placeholder="搜索歌曲、歌手、歌词或歌单"
            aria-label="全局搜索"
            @keyup.enter="submitSearch"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <kbd>⌘ K</kbd>
        </div>
        <div class="header-user">
          <el-dropdown @command="onCommand">
            <div class="user-chip">
              <div class="user-avatar">
                <Cover :src="userStore.userInfo?.avatar" :text="userStore.userInfo?.nickname || userStore.userInfo?.username" :size="34" />
              </div>
              <span class="user-name">{{ userStore.userInfo?.nickname || userStore.userInfo?.username || '游客' }}</span>
              <el-icon><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-if="!userStore.isLogin" command="login">
                  <el-icon><User /></el-icon> 登录
                </el-dropdown-item>
                <el-dropdown-item v-if="!userStore.isLogin" command="register">
                  <el-icon><CirclePlus /></el-icon> 注册
                </el-dropdown-item>
                <el-dropdown-item command="settings">
                  <el-icon><Setting /></el-icon> 设置
                </el-dropdown-item>
                <el-dropdown-item command="favorites">
                  <el-icon><Star /></el-icon> 我的收藏
                </el-dropdown-item>
                <el-dropdown-item v-if="userStore.isLogin" command="recent">
                  <el-icon><Clock /></el-icon> 最近播放
                </el-dropdown-item>
                <el-dropdown-item v-if="userStore.isLogin" divided command="logout">
                  <el-icon><SwitchButton /></el-icon> 退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="content">
        <router-view v-slot="{ Component }">
          <transition name="page-fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>

    <el-drawer
      v-model="mobileNavVisible"
      title="MUSIC HOLO 导航"
      direction="ltr"
      size="min(320px, 88vw)"
      class="mobile-nav-drawer"
      append-to-body
    >
      <div class="mobile-nav-hint">选择页面，播放器会继续固定在底部</div>
      <el-menu
        :default-active="activeMenu"
        class="mobile-nav-menu"
        :router="true"
        @select="closeMobileNav"
      >
        <el-menu-item index="/home"><el-icon><HomeFilled /></el-icon><span>首页</span></el-menu-item>
        <el-menu-item index="/daily"><el-icon><Calendar /></el-icon><span>每日推荐</span></el-menu-item>
        <el-menu-item index="/search"><el-icon><Search /></el-icon><span>全局搜索</span></el-menu-item>
        <el-menu-item index="/playlists"><el-icon><Collection /></el-icon><span>歌单</span></el-menu-item>
        <el-menu-item index="/songs"><el-icon><Headset /></el-icon><span>歌曲</span></el-menu-item>
        <el-menu-item index="/singers"><el-icon><User /></el-icon><span>歌手</span></el-menu-item>
        <el-menu-item index="/charts"><el-icon><TrendCharts /></el-icon><span>排行榜</span></el-menu-item>
        <el-menu-item v-if="userStore.isLogin" index="/recent"><el-icon><Clock /></el-icon><span>最近播放</span></el-menu-item>
        <el-menu-item index="/favorites"><el-icon><Star /></el-icon><span>我的收藏</span></el-menu-item>
        <el-menu-item index="/queue"><el-icon><List /></el-icon><span>播放列表</span></el-menu-item>
        <el-sub-menu v-if="userStore.isAdmin" index="admin">
          <template #title><el-icon><Setting /></el-icon><span>管理后台</span></template>
          <el-menu-item index="/admin/dashboard"><el-icon><DataAnalysis /></el-icon><span>仪表盘</span></el-menu-item>
          <el-menu-item index="/admin/singers"><el-icon><User /></el-icon><span>歌手管理</span></el-menu-item>
          <el-menu-item index="/admin/songs"><el-icon><Headset /></el-icon><span>歌曲管理</span></el-menu-item>
          <el-menu-item index="/admin/playlists"><el-icon><Collection /></el-icon><span>歌单管理</span></el-menu-item>
          <el-menu-item index="/admin/categories"><el-icon><CollectionTag /></el-icon><span>分类管理</span></el-menu-item>
          <el-menu-item index="/admin/reviews"><el-icon><ChatDotRound /></el-icon><span>短评审核</span></el-menu-item>
        </el-sub-menu>
        <el-menu-item index="/settings"><el-icon><Setting /></el-icon><span>设置</span></el-menu-item>
      </el-menu>
    </el-drawer>

    <!-- 传送到 body，避免 3D scene / overflow 容器把 fixed 底栏变成随页面滚动的元素。 -->
    <Teleport to="body">
      <PlayerBar />
      <LyricPanel />
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/store/user'
import { usePlayerStore } from '@/store/player'
import PlayerBar from '@/components/PlayerBar.vue'
import LyricPanel from '@/components/LyricPanel.vue'
import HoloProjector from '@/components/HoloProjector.vue'
import Cover from '@/components/Cover.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const playerStore = usePlayerStore()
const searchTerm = ref('')
const searchInput = ref(null)
const mobileNavVisible = ref(false)

const activeMenu = computed(() => route.path)
const pageTitle = computed(() => route.meta.title || '首页')
const headerCaption = computed(() => route.path.startsWith('/admin')
  ? 'HOLO CONTROL · 空间控制台'
  : 'MUSIC HOLO · 全息声场')

watch(() => route.query.q, (value) => {
  searchTerm.value = String(value || '')
}, { immediate: true })

const submitSearch = () => {
  const q = searchTerm.value.trim()
  router.push({ path: '/search', query: q ? { q } : {} })
}

const closeMobileNav = () => { mobileNavVisible.value = false }

const onGlobalShortcut = (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    searchInput.value?.focus?.()
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalShortcut))
onUnmounted(() => window.removeEventListener('keydown', onGlobalShortcut))

const onCommand = async (command) => {
  if (command === 'login') {
    router.push('/login')
  } else if (command === 'register') {
    router.push('/register')
  } else if (command === 'logout') {
    await userStore.logout()
    router.push('/login')
  } else if (command === 'settings') {
    router.push('/settings')
  } else if (command === 'favorites') {
    router.push('/favorites')
  } else if (command === 'recent') {
    router.push('/recent')
  }
}
</script>

<style scoped>
.layout {
  display: flex;
  height: 100%;
  min-height: 100vh;
}

/* 侧边栏 */
.sidebar {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  margin: 12px 0 12px 12px;
  border-radius: 16px;
  overflow: hidden;
  height: calc(100vh - var(--player-h) - 24px);
  position: sticky;
  top: 12px;
}
.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 16px 12px;
  cursor: pointer;
}
.logo-icon {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  color: var(--holo-primary);
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.13), color-mix(in srgb, var(--holo-primary) 14%, transparent));
  border: 1px solid color-mix(in srgb, var(--holo-primary) 35%, transparent);
  box-shadow: 0 0 18px var(--holo-glow), inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 8px 16px rgba(0, 0, 0, 0.28);
  transform: perspective(500px) rotateY(-10deg) rotateX(8deg) translateZ(8px);
  transform-style: preserve-3d;
}
.logo-icon::after {
  content: '';
  position: absolute;
  inset: 6px;
  border: 1px solid color-mix(in srgb, var(--holo-secondary) 54%, transparent);
  border-radius: 8px;
  transform: translateZ(-8px) rotateZ(45deg);
  opacity: 0.7;
  pointer-events: none;
}
.logo-title {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 2px;
}
.logo-sub {
  font-size: 10px;
  color: var(--text-sub);
  letter-spacing: 3px;
}

.nav-menu {
  flex: 1;
  border-right: none;
  background: transparent;
  overflow-y: auto;
  perspective: 900px;
}
.nav-menu :deep(.el-menu-item),
.nav-menu :deep(.el-sub-menu__title) {
  margin: 3px 8px;
  border-radius: 10px;
  transform-style: preserve-3d;
  transition: transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}
.nav-menu :deep(.el-menu-item:hover),
.nav-menu :deep(.el-sub-menu__title:hover) {
  transform: perspective(600px) translate3d(3px, -1px, 6px) rotateY(-2deg);
  background: color-mix(in srgb, var(--holo-primary) 9%, transparent);
}
.nav-menu :deep(.el-menu-item.is-active) {
  background: color-mix(in srgb, var(--holo-primary) 14%, transparent);
  color: var(--holo-primary);
  border-right: 2px solid var(--holo-primary);
  box-shadow: 0 8px 18px -12px var(--holo-glow), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  transform: translateZ(5px);
}

.sidebar-footer {
  display: flex;
  justify-content: center;
  padding: 8px 0 14px;
}

/* 主区域 */
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  margin: 12px 12px 0 12px;
  padding-bottom: calc(var(--player-h) + 12px);
}
.mobile-menu-trigger {
  display: none;
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
}
.mobile-nav-hint {
  margin: -8px 0 12px;
  padding: 9px 11px;
  border: 1px solid color-mix(in srgb, var(--holo-primary) 24%, transparent);
  border-radius: 10px;
  color: var(--text-sub);
  background: color-mix(in srgb, var(--holo-primary) 6%, transparent);
  font-size: 11px;
}
.mobile-nav-menu {
  border-right: none;
  background: transparent;
}
.mobile-nav-menu :deep(.el-menu-item),
.mobile-nav-menu :deep(.el-sub-menu__title) {
  margin: 3px 0;
  border-radius: 10px;
  transition: background 0.16s ease, transform 0.16s ease;
}
.mobile-nav-menu :deep(.el-menu-item:hover),
.mobile-nav-menu :deep(.el-sub-menu__title:hover) {
  transform: translateX(3px);
  background: color-mix(in srgb, var(--holo-primary) 9%, transparent);
}
.mobile-nav-menu :deep(.el-menu-item.is-active) {
  color: var(--holo-primary);
  background: color-mix(in srgb, var(--holo-primary) 14%, transparent);
  box-shadow: inset 2px 0 var(--holo-primary);
}
:global(.el-drawer.mobile-nav-drawer) {
  background: color-mix(in srgb, var(--holo-bg, #080d20) 94%, #111a34);
  backdrop-filter: blur(22px);
}
:global(.el-drawer.mobile-nav-drawer .el-drawer__header) {
  margin-bottom: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

.header {
  height: 60px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-radius: 14px;
}
.header-title-wrap {
  flex: 0 0 206px;
  display: flex;
  align-items: center;
  gap: 12px;
  transform-style: preserve-3d;
}
.header-mark {
  position: relative;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  perspective: 360px;
  transform-style: preserve-3d;
  filter: drop-shadow(0 0 12px var(--holo-glow));
}
.header-mark__beam {
  position: absolute;
  left: 50%;
  bottom: 2px;
  width: 27px;
  height: 30px;
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
  transform: translateX(-50%) translateZ(-6px);
  background: linear-gradient(180deg, color-mix(in srgb, var(--holo-primary) 44%, transparent), transparent 84%);
}
.header-mark__disc {
  position: absolute;
  left: 50%;
  top: 8px;
  width: 27px;
  height: 27px;
  border: 1px solid color-mix(in srgb, var(--holo-primary) 85%, white);
  border-radius: 50%;
  transform: translateX(-50%) rotateX(66deg) translateZ(8px);
  background: repeating-radial-gradient(circle, rgba(255, 255, 255, 0.18) 0 1px, transparent 2px 4px), radial-gradient(circle, var(--holo-secondary), color-mix(in srgb, var(--holo-primary) 75%, transparent) 56%, transparent 72%);
  box-shadow: 0 0 18px var(--holo-glow), inset 0 0 8px rgba(255, 255, 255, 0.34);
  animation: header-disc-spin 12s linear infinite paused;
}
.header-mark.is-playing .header-mark__disc {
  animation-play-state: running;
}
.header-mark__disc i {
  position: absolute;
  inset: 42%;
  border-radius: 50%;
  background: #f8fafc;
  box-shadow: 0 0 7px #fff;
}
.header-mark__orbit {
  position: absolute;
  inset: -4px 0 3px;
  border: 1px solid color-mix(in srgb, var(--holo-secondary) 65%, transparent);
  border-radius: 50%;
  transform: rotateX(72deg) rotateZ(-24deg);
  opacity: 0.72;
}
@keyframes header-disc-spin {
  to { rotate: 0 1 0 360deg; }
}
.header-title-block {
  min-width: 0;
}
.header-title {
  font-size: 17px;
  font-weight: 650;
  letter-spacing: 1px;
  white-space: nowrap;
}
.header-kicker {
  margin-top: 3px;
  color: var(--text-sub);
  font-size: 9px;
  letter-spacing: 1.5px;
  white-space: nowrap;
}
.header-search {
  position: relative;
  flex: 1;
  max-width: 520px;
  margin: 0 28px;
}
.header-search :deep(.el-input__wrapper) {
  padding-right: 58px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.32);
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.12) inset;
}
.header-search kbd {
  position: absolute;
  top: 50%;
  right: 12px;
  transform: translateY(-50%);
  padding: 2px 6px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 5px;
  color: var(--text-sub);
  font-family: inherit;
  font-size: 10px;
  line-height: 1.5;
  pointer-events: none;
}
.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 10px 4px 4px;
  border-radius: 999px;
  transition: background 0.15s;
}
.user-chip:hover {
  background: rgba(148, 163, 184, 0.12);
}
.user-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  overflow: hidden;
}
.user-name {
  font-size: 13px;
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.content {
  margin-top: 12px;
  flex: 1;
  min-height: 0;
}

.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.2s ease;
}
.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
}

@media (max-width: 900px) {
  .sidebar {
    width: 64px;
  }
  .header-title-wrap {
    flex-basis: 174px;
    gap: 9px;
  }
  .header-mark {
    transform: scale(0.9);
  }
  .header-search {
    margin: 0 14px;
    max-width: none;
  }
  .header-search kbd {
    display: none;
  }
  .logo-text,
  .nav-menu :deep(.el-menu-item span),
  .nav-menu :deep(.el-sub-menu__title span),
  .sidebar-footer {
    display: none;
  }
  .pb-left {
    width: auto !important;
  }
}
@media (max-width: 600px) {
  .sidebar {
    display: none;
  }
  .mobile-menu-trigger {
    display: inline-flex;
  }
  .header {
    padding: 0 12px;
  }
  .header-title-wrap {
    flex: 0 0 38px;
    gap: 0;
  }
  .header-title-block {
    display: none;
  }
  .header-search {
    margin: 0 10px 0 0;
  }
  .user-name {
    display: none;
  }
}
</style>
