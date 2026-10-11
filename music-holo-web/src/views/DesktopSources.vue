<template>
  <div class="desktop-sources-page">
    <section class="glass-panel desktop-source-intro">
      <div>
        <div class="desktop-source-eyebrow">DESKTOP · LOCAL FIRST</div>
        <h1>本机音源工作台</h1>
        <p>无需登录即可导入可信脚本、检测能力和解析试听。脚本不会上传，也不会在启动时自动执行。</p>
        <p v-if="!userStore.isLogin" class="desktop-source-note">当前使用本机访客源库；登录后切换到独立的账号源库，不自动迁移。账号、收藏和站内曲库需要连接业务后端，音源试听不需要。</p>
        <p class="desktop-source-note">第三方搜索与榜单由 Music Holo 平台适配器提供，与音源脚本无关；在试听台按平台搜索或加载榜单即可自动填入真实平台曲目 ID。不要填入账号密码或登录令牌。</p>
      </div>
      <el-button v-if="!userStore.isLogin" @click="router.push('/login')">连接账号（可选）</el-button>
    </section>
    <CustomSourceManager :catalog-available="userStore.isLogin" />
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useUserStore } from '@/store/user'
import CustomSourceManager from '@/components/settings/CustomSourceManager.vue'
const router = useRouter()
const userStore = useUserStore()
</script>

<style scoped>
.desktop-sources-page { display: grid; gap: 20px; }
.desktop-source-intro { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding: 24px; }
.desktop-source-eyebrow { color: var(--holo-primary); font-size: 11px; letter-spacing: 2px; }
h1 { margin: 10px 0; font-size: 24px; }
p { margin: 8px 0 0; line-height: 1.8; }
.desktop-source-note { color: var(--text-sub); font-size: 13px; }
@media (max-width: 900px) { .desktop-source-intro { flex-direction: column; } }
</style>
