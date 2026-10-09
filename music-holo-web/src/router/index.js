import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router'
import { useUserStore } from '@/store/user'
import { desktopSourceBridge } from '@/utils/desktopSource'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { title: '登录', guest: true }
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/Register.vue'),
    meta: { title: '注册', guest: true }
  },
  {
    path: '/',
    component: () => import('@/views/layout/Index.vue'),
    redirect: () => desktopSourceBridge() ? '/sources' : '/home',
    children: [
      { path: 'sources', name: 'DesktopSources', component: () => import('@/views/DesktopSources.vue'), meta: { title: '本机音源', desktopOnly: true } },
      { path: 'home', name: 'Home', component: () => import('@/views/Home.vue'), meta: { title: '首页' } },
      { path: 'daily', name: 'DailyRecommendation', component: () => import('@/views/DailyRecommendation.vue'), meta: { title: '每日推荐' } },
      { path: 'singers', name: 'Singers', component: () => import('@/views/Singers.vue'), meta: { title: '歌手' } },
      { path: 'singers/:id', name: 'SingerDetail', component: () => import('@/views/SingerDetail.vue'), meta: { title: '歌手详情' } },
      { path: 'playlists', name: 'Playlists', component: () => import('@/views/Playlists.vue'), meta: { title: '歌单' } },
      { path: 'playlists/:id', name: 'PlaylistDetail', component: () => import('@/views/PlaylistDetail.vue'), meta: { title: '歌单详情' } },
      { path: 'albums', name: 'Albums', component: () => import('@/views/Albums.vue'), meta: { title: '专辑' } },
      { path: 'albums/detail', name: 'AlbumDetail', component: () => import('@/views/AlbumDetail.vue'), meta: { title: '专辑详情' } },
      { path: 'songs', name: 'Songs', component: () => import('@/views/Songs.vue'), meta: { title: '歌曲' } },
      { path: 'radio', name: 'SongRadio', component: () => import('@/views/Radio.vue'), meta: { title: '相似歌曲电台' } },
      { path: 'search', name: 'Search', component: () => import('@/views/Search.vue'), meta: { title: '全局搜索' } },
      { path: 'charts', name: 'Charts', component: () => import('@/views/Charts.vue'), meta: { title: '排行榜' } },
      { path: 'recent', name: 'RecentlyPlayed', component: () => import('@/views/RecentlyPlayed.vue'), meta: { title: '最近播放', requiresAuth: true } },
      { path: 'favorites', name: 'Favorites', component: () => import('@/views/Favorites.vue'), meta: { title: '我的收藏', requiresAuth: true } },
      { path: 'queue', name: 'Queue', component: () => import('@/views/Queue.vue'), meta: { title: '播放列表', requiresAuth: true } },
      { path: 'downloads', name: 'Downloads', component: () => import('@/views/Downloads.vue'), meta: { title: '下载中心' } },
      { path: 'import', name: 'PlaylistImport', component: () => import('@/views/PlaylistImport.vue'), meta: { title: '歌单导入' } },
      { path: 'settings', name: 'Settings', component: () => import('@/views/Settings.vue'), meta: { title: '设置', requiresAuth: true } },
      // ---------- 管理后台 ----------
      { path: 'admin/dashboard', name: 'AdminDashboard', component: () => import('@/views/admin/Dashboard.vue'), meta: { title: '仪表盘', requiresAuth: true, requiresAdmin: true } },
      { path: 'admin/singers', name: 'AdminSingers', component: () => import('@/views/admin/SingerManage.vue'), meta: { title: '歌手管理', requiresAuth: true, requiresAdmin: true } },
      { path: 'admin/songs', name: 'AdminSongs', component: () => import('@/views/admin/SongManage.vue'), meta: { title: '歌曲管理', requiresAuth: true, requiresAdmin: true } },
      { path: 'admin/playlists', name: 'AdminPlaylists', component: () => import('@/views/admin/PlaylistManage.vue'), meta: { title: '歌单管理', requiresAuth: true, requiresAdmin: true } },
      { path: 'admin/categories', name: 'AdminCategories', component: () => import('@/views/admin/CategoryManage.vue'), meta: { title: '分类管理', requiresAuth: true, requiresAdmin: true } },
      { path: 'admin/reviews', name: 'AdminReviews', component: () => import('@/views/admin/ReviewModeration.vue'), meta: { title: '短评审核', requiresAuth: true, requiresAdmin: true } }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/home' }
]

const router = createRouter({
  history: globalThis.musicHoloDesktop ? createWebHashHistory() : createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

router.beforeEach((to) => {
  const userStore = useUserStore()
  const title = to.meta.title ? `${to.meta.title} · 3D全息音乐` : '3D全息音乐'
  document.title = title

  if (to.meta.desktopOnly && !desktopSourceBridge()) return { path: '/home' }
  if (to.meta.guest && userStore.isLogin) {
    return { path: '/home' }
  }
  if (to.meta.requiresAuth && !userStore.isLogin) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.meta.requiresAdmin && !userStore.isAdmin) {
    return { path: '/home' }
  }
  return true
})

export default router
