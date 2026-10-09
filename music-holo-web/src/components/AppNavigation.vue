<template>
  <el-menu
    :default-active="activeIndex"
    :collapse="props.collapsed"
    :collapse-transition="false"
    class="app-nav-menu"
    :router="true"
    @select="onSelect"
  >
    <el-menu-item-group>
      <template #title><span>发现</span></template>
      <el-menu-item v-if="isDesktop" index="/sources"><el-icon><Connection /></el-icon><template #title>本机音源</template></el-menu-item>
      <el-menu-item index="/home"><el-icon><HomeFilled /></el-icon><template #title>首页</template></el-menu-item>
      <el-menu-item index="/daily"><el-icon><Calendar /></el-icon><template #title>每日推荐</template></el-menu-item>
      <el-menu-item index="/search"><el-icon><Search /></el-icon><template #title>全局搜索</template></el-menu-item>
      <el-menu-item index="/charts"><el-icon><TrendCharts /></el-icon><template #title>排行榜</template></el-menu-item>
      <el-menu-item index="/radio"><el-icon><Headset /></el-icon><template #title>相似电台</template></el-menu-item>
    </el-menu-item-group>

    <el-menu-item-group>
      <template #title><span>曲库</span></template>
      <el-menu-item index="/songs"><el-icon><Headset /></el-icon><template #title>歌曲</template></el-menu-item>
      <el-menu-item index="/singers"><el-icon><User /></el-icon><template #title>歌手</template></el-menu-item>
      <el-menu-item index="/albums"><el-icon><Disc /></el-icon><template #title>专辑</template></el-menu-item>
      <el-menu-item index="/playlists"><el-icon><Collection /></el-icon><template #title>歌单</template></el-menu-item>
    </el-menu-item-group>

    <el-menu-item-group>
      <template #title><span>我的音乐</span></template>
      <el-menu-item v-if="userStore.isLogin" index="/recent"><el-icon><Clock /></el-icon><template #title>最近播放</template></el-menu-item>
      <el-menu-item index="/favorites"><el-icon><Star /></el-icon><template #title>我的收藏</template></el-menu-item>
      <el-menu-item index="/queue"><el-icon><List /></el-icon><template #title>播放列表</template></el-menu-item>
    </el-menu-item-group>

    <el-menu-item-group v-if="userStore.isAdmin">
      <template #title><span>管理</span></template>
      <el-sub-menu index="admin">
        <template #title><el-icon><Setting /></el-icon><span>管理后台</span></template>
        <el-menu-item index="/admin/dashboard"><el-icon><DataAnalysis /></el-icon><template #title>仪表盘</template></el-menu-item>
        <el-menu-item index="/admin/singers"><el-icon><User /></el-icon><template #title>歌手管理</template></el-menu-item>
        <el-menu-item index="/admin/songs"><el-icon><Headset /></el-icon><template #title>歌曲管理</template></el-menu-item>
        <el-menu-item index="/admin/playlists"><el-icon><Collection /></el-icon><template #title>歌单管理</template></el-menu-item>
        <el-menu-item index="/admin/categories"><el-icon><CollectionTag /></el-icon><template #title>分类管理</template></el-menu-item>
        <el-menu-item index="/admin/reviews"><el-icon><ChatDotRound /></el-icon><template #title>短评审核</template></el-menu-item>
      </el-sub-menu>
    </el-menu-item-group>

    <el-menu-item-group>
      <template #title><span>偏好</span></template>
      <el-menu-item index="/settings"><el-icon><Setting /></el-icon><template #title>设置</template></el-menu-item>
    </el-menu-item-group>
  </el-menu>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '@/store/user'
import { desktopSourceBridge } from '@/utils/desktopSource'

const isDesktop = !!desktopSourceBridge()

const props = defineProps({
  collapsed: { type: Boolean, default: false }
})
const emit = defineEmits(['navigate'])
const route = useRoute()
const userStore = useUserStore()

const activeIndex = computed(() => {
  const { path } = route
  if (path.startsWith('/playlists/')) return '/playlists'
  if (path.startsWith('/singers/')) return '/singers'
  if (path.startsWith('/albums/')) return '/albums'
  return path
})

const onSelect = (index) => emit('navigate', index)
</script>

<style scoped>
.app-nav-menu {
  --el-menu-item-height: 42px;
  flex: 1;
  width: 100%;
  min-height: 0;
  border-right: none;
  background: transparent;
  overflow-y: auto;
  perspective: 900px;
}
.app-nav-menu :deep(.el-menu-item-group__title) {
  padding: 12px 20px 4px;
  color: var(--text-sub);
  font-size: 10px;
  line-height: 16px;
  letter-spacing: 1.5px;
}
.app-nav-menu :deep(.el-menu-item),
.app-nav-menu :deep(.el-sub-menu__title) {
  margin: 2px 8px;
  border-radius: 10px;
  transform-style: preserve-3d;
  transition: transform 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}
.app-nav-menu :deep(.el-menu-item:hover),
.app-nav-menu :deep(.el-sub-menu__title:hover) {
  transform: perspective(600px) translate3d(3px, -1px, 5px) rotateY(-2deg);
  background: color-mix(in srgb, var(--holo-primary) 9%, transparent);
}
.app-nav-menu :deep(.el-menu-item.is-active) {
  color: var(--holo-primary);
  background: color-mix(in srgb, var(--holo-primary) 14%, transparent);
  box-shadow: 0 8px 18px -12px var(--holo-glow), inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 2px 0 var(--holo-primary);
  transform: translateZ(4px);
}
.app-nav-menu :deep(.el-menu-item-group__title) {
  white-space: nowrap;
}
:global(.app-nav-menu.el-menu--collapse .el-menu-item-group__title) {
  display: none;
}

@media (max-width: 600px) {
  .app-nav-menu :deep(.el-menu-item),
  .app-nav-menu :deep(.el-sub-menu__title) {
    margin-right: 0;
    margin-left: 0;
  }
}
</style>
