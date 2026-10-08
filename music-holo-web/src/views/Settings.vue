<template>
  <div class="page">
    <div class="page-head">
      <div>
        <div class="page-title">设置</div>
        <div class="page-subtitle">打造属于你的全息视界</div>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="settings-tabs">
      <!-- 主题设置 -->
      <el-tab-pane label="全息主题" name="theme">
        <div class="theme-grid">
          <div
            v-for="t in THEMES"
            :key="t.key"
            class="theme-card glass-panel"
            :class="{ active: themeStore.theme === t.key }"
            @click="onTheme(t.key)"
          >
            <div class="theme-preview" :style="{ background: `linear-gradient(135deg, ${t.primary}, ${t.secondary})` }">
              <div class="theme-orb"></div>
            </div>
            <div class="theme-name">{{ t.label }}</div>
            <div class="theme-desc">{{ t.desc }}</div>
            <el-icon v-if="themeStore.theme === t.key" class="theme-check"><CircleCheckFilled /></el-icon>
          </div>
        </div>
        <div class="theme-tip">
          <el-icon><InfoFilled /></el-icon>
          主题会即时生效并自动同步到你的账号（登录后），下次登录自动恢复。
        </div>
        <div class="theme-preview-panel glass-panel">
          <div class="preview-title">实时预览</div>
          <div class="preview-stage">
            <HoloProjector
              :cover="playerStore.currentSong?.cover"
              :title="playerStore.currentSong?.title || '全息投影'"
              :singer="playerStore.currentSong?.singerName"
              :playing="playerStore.playing"
              :size="150"
              show-caption
            />
          </div>
        </div>
      </el-tab-pane>

      <!-- 个人资料 -->
      <el-tab-pane label="个人资料" name="profile">
        <div class="profile-panel glass-panel">
          <el-form :model="profileForm" label-width="80px" style="max-width: 520px">
            <el-form-item label="头像">
              <div class="avatar-row">
                <div class="avatar-preview">
                  <Cover :src="profileForm.avatar" :text="profileForm.nickname || profileForm.username" :size="72" />
                </div>
                <el-upload :show-file-list="false" :http-request="onUploadAvatar" accept="image/*">
                  <el-button>上传头像</el-button>
                </el-upload>
              </div>
            </el-form-item>
            <el-form-item label="用户名">
              <el-input v-model="profileForm.username" disabled />
            </el-form-item>
            <el-form-item label="昵称">
              <el-input v-model="profileForm.nickname" placeholder="请输入昵称" />
            </el-form-item>
            <el-form-item label="性别">
              <el-radio-group v-model="profileForm.gender">
                <el-radio :value="0">保密</el-radio>
                <el-radio :value="1">男</el-radio>
                <el-radio :value="2">女</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="邮箱">
              <el-input v-model="profileForm.email" placeholder="请输入邮箱" />
            </el-form-item>
            <el-form-item label="手机号">
              <el-input v-model="profileForm.phone" placeholder="请输入手机号" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="savingProfile" @click="onSaveProfile">保存资料</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <!-- 修改密码 -->
      <el-tab-pane label="修改密码" name="password">
        <div class="profile-panel glass-panel">
          <el-form :model="passwordForm" label-width="90px" style="max-width: 420px">
            <el-form-item label="原密码">
              <el-input v-model="passwordForm.oldPassword" type="password" show-password placeholder="请输入原密码" />
            </el-form-item>
            <el-form-item label="新密码">
              <el-input v-model="passwordForm.newPassword" type="password" show-password placeholder="6-32 位新密码" />
            </el-form-item>
            <el-form-item label="确认新密码">
              <el-input v-model="passwordForm.confirm" type="password" show-password placeholder="请再次输入新密码" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="savingPassword" @click="onChangePassword">修改密码</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import * as userApi from '@/api/user'
import * as commonApi from '@/api/common'
import { useUserStore } from '@/store/user'
import { useThemeStore, THEMES } from '@/store/theme'
import { usePlayerStore } from '@/store/player'
import HoloProjector from '@/components/HoloProjector.vue'
import Cover from '@/components/Cover.vue'

const userStore = useUserStore()
const themeStore = useThemeStore()
const playerStore = usePlayerStore()

const activeTab = ref('theme')
const savingProfile = ref(false)
const savingPassword = ref(false)

const profileForm = reactive({
  username: '',
  nickname: '',
  avatar: '',
  gender: 0,
  email: '',
  phone: ''
})

const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirm: ''
})

const onTheme = (key) => {
  themeStore.setTheme(key)
  ElMessage.success(`已切换主题：${THEMES.find((t) => t.key === key)?.label}`)
}

const loadProfile = async () => {
  const info = await userApi.getProfile()
  Object.assign(profileForm, {
    username: info.username,
    nickname: info.nickname || '',
    avatar: info.avatar || '',
    gender: info.gender ?? 0,
    email: info.email || '',
    phone: info.phone || ''
  })
  userStore.userInfo = info
  localStorage.setItem('mh_user', JSON.stringify(info))
}

const onUploadAvatar = async ({ file }) => {
  const res = await commonApi.upload(file)
  profileForm.avatar = res.url
  ElMessage.success('头像上传成功')
}

const onSaveProfile = async () => {
  savingProfile.value = true
  try {
    const info = await userApi.updateProfile({ ...profileForm })
    userStore.userInfo = info
    localStorage.setItem('mh_user', JSON.stringify(info))
    ElMessage.success('资料保存成功')
  } finally {
    savingProfile.value = false
  }
}

const onChangePassword = async () => {
  if (!passwordForm.oldPassword || !passwordForm.newPassword) {
    ElMessage.warning('请填写完整')
    return
  }
  if (passwordForm.newPassword.length < 6) {
    ElMessage.warning('新密码长度需为 6-32 位')
    return
  }
  if (passwordForm.newPassword !== passwordForm.confirm) {
    ElMessage.warning('两次输入的新密码不一致')
    return
  }
  savingPassword.value = true
  try {
    await userApi.changePassword({
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword
    })
    ElMessage.success('密码修改成功，请重新登录')
    await userStore.logout()
    location.href = '/login'
  } finally {
    savingPassword.value = false
  }
}

onMounted(loadProfile)
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}
.settings-tabs {
  padding: 0 4px;
}
.settings-tabs :deep(.el-tabs__nav-wrap::after) {
  background-color: var(--border-color);
}

/* 主题卡片 */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}
.theme-card {
  padding: 16px;
  cursor: pointer;
  position: relative;
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
  border: 1px solid var(--border-color);
}
.theme-card:hover {
  transform: translateY(-3px);
}
.theme-card.active {
  border-color: var(--holo-primary);
  box-shadow: 0 0 22px var(--holo-glow);
}
.theme-preview {
  height: 90px;
  border-radius: 10px;
  position: relative;
  overflow: hidden;
}
.theme-orb {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.28);
  box-shadow: 0 0 24px rgba(255, 255, 255, 0.5);
  animation: orbSpin 5s linear infinite;
}
@keyframes orbSpin {
  from { transform: translateY(-50%) rotate(0); }
  to { transform: translateY(-50%) rotate(360deg); }
}
.theme-name {
  margin-top: 12px;
  font-size: 15px;
  font-weight: 600;
}
.theme-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-sub);
}
.theme-check {
  position: absolute;
  top: 10px;
  right: 10px;
  color: var(--holo-primary);
  font-size: 20px;
}
.theme-tip {
  margin-top: 14px;
  font-size: 12px;
  color: var(--text-sub);
  display: flex;
  align-items: center;
  gap: 6px;
}
.theme-preview-panel {
  margin-top: 16px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 30px;
  flex-wrap: wrap;
}
.preview-title {
  font-size: 16px;
  font-weight: 600;
  writing-mode: vertical-rl;
  letter-spacing: 4px;
  color: var(--text-sub);
}
.preview-stage {
  flex: 1;
  display: flex;
  justify-content: center;
}

/* 资料面板 */
.profile-panel {
  padding: 28px;
}
.avatar-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.avatar-preview {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid color-mix(in srgb, var(--holo-primary) 50%, transparent);
}
</style>
