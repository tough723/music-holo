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
          <button
            v-for="t in THEMES"
            :key="t.key"
            type="button"
            class="theme-card glass-panel"
            :class="{ active: themeStore.theme === t.key }"
            :aria-pressed="themeStore.theme === t.key"
            @click="onTheme(t.key)"
          >
            <div class="theme-preview" :style="{ '--preview-primary': t.primary, '--preview-secondary': t.secondary }">
              <div class="theme-preview-grid"></div>
              <div class="theme-preview-orbit orbit-a"><i></i></div>
              <div class="theme-preview-orbit orbit-b"></div>
              <div class="theme-preview-beam"></div>
              <div class="theme-preview-disc"><i></i></div>
              <span class="theme-mood">{{ t.mood }}</span>
            </div>
            <div class="theme-copy">
              <div class="theme-name">{{ t.label }}</div>
              <div class="theme-desc">{{ t.desc }}</div>
            </div>
            <el-icon v-if="themeStore.theme === t.key" class="theme-check"><CircleCheckFilled /></el-icon>
            <span v-if="themeStore.theme === t.key" class="theme-current">LIVE</span>
          </button>
        </div>

        <div class="glass-control glass-panel">
          <div class="glass-control-head">
            <div>
              <div class="glass-control-title">3D 透明玻璃</div>
              <div class="glass-control-sub">调整全站面板的不透明度，越低越通透</div>
            </div>
            <el-tag effect="plain" round>{{ themeStore.glassOpacity }}% 不透明</el-tag>
          </div>
          <div class="glass-control-body">
            <div class="glass-slider-wrap">
              <el-slider v-model="glassOpacity" :min="40" :max="88" :show-tooltip="true" :format-tooltip="formatOpacity" />
              <div class="glass-scale"><span>空间更清晰</span><span>面板更聚焦</span></div>
            </div>
            <div class="glass-preview-window">
              <div class="sample-orbit orbit-one"></div>
              <div class="sample-orbit orbit-two"></div>
              <div class="glass-preview-card glass-panel">
                <span>HOLO GLASS</span>
                <strong>{{ 100 - themeStore.glassOpacity }}<small>% 光感</small></strong>
              </div>
            </div>
          </div>
          <div class="glass-control-foot"><el-icon><InfoFilled /></el-icon> 玻璃强度保存在此设备；主题色可同步至账号。</div>
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
import { computed, onMounted, reactive, ref } from 'vue'
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
const glassOpacity = computed({
  get: () => themeStore.glassOpacity,
  set: (value) => themeStore.setGlassOpacity(value)
})
const formatOpacity = (value) => `${value}%`
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

/* 立体全息主题预览 */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(205px, 1fr));
  gap: 16px;
  perspective: 1400px;
}
.theme-card {
  position: relative;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--border-color);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  appearance: none;
  transform-style: preserve-3d;
  backface-visibility: hidden;
}
.theme-card.active {
  border-color: var(--holo-primary);
  box-shadow: 0 0 28px -10px var(--holo-glow), inset 0 1px 0 rgba(255, 255, 255, 0.14);
}
.theme-preview {
  position: relative;
  height: 112px;
  overflow: hidden;
  border-radius: 12px;
  isolation: isolate;
  perspective: 520px;
  transform-style: preserve-3d;
  background:
    radial-gradient(ellipse at 72% 38%, color-mix(in srgb, var(--preview-secondary) 62%, transparent), transparent 50%),
    linear-gradient(140deg, color-mix(in srgb, var(--preview-primary) 90%, #10172b), #0b1024 74%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), inset 0 -18px 30px rgba(0, 0, 0, 0.34), 0 10px 20px -16px #000;
}
.theme-preview-grid {
  position: absolute;
  left: -18%;
  right: -18%;
  bottom: -66%;
  height: 105%;
  transform: rotateX(68deg) translateZ(-12px);
  transform-origin: center top;
  background-image:
    linear-gradient(to right, color-mix(in srgb, var(--preview-primary) 40%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in srgb, var(--preview-primary) 40%, transparent) 1px, transparent 1px);
  background-size: 22px 22px;
  mask-image: linear-gradient(to top, #000, transparent 80%);
}
.theme-preview-orbit {
  position: absolute;
  z-index: 1;
  left: 68%;
  top: 46%;
  width: 76px;
  height: 42px;
  border: 1px solid color-mix(in srgb, var(--preview-primary) 85%, white);
  border-radius: 50%;
  transform: translate(-50%, -50%) rotateX(70deg) rotateZ(-18deg) translateZ(28px);
  box-shadow: 0 0 18px -6px var(--preview-primary);
}
.theme-preview-orbit i {
  position: absolute;
  top: 0;
  left: 50%;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 12px 3px var(--preview-primary);
}
.theme-preview-orbit.orbit-b {
  width: 60px;
  height: 30px;
  border-color: color-mix(in srgb, var(--preview-secondary) 72%, white);
  transform: translate(-50%, -50%) rotateX(65deg) rotateZ(54deg) translateZ(15px);
}
.theme-preview-beam {
  position: absolute;
  z-index: 0;
  left: 68%;
  top: -8%;
  width: 104px;
  height: 118%;
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
  transform: translateX(-50%) translateZ(10px);
  background: linear-gradient(180deg, color-mix(in srgb, var(--preview-primary) 36%, transparent), transparent 80%);
  filter: blur(8px);
}
.theme-preview-disc {
  position: absolute;
  z-index: 2;
  left: 68%;
  top: 47%;
  width: 48px;
  height: 48px;
  border: 1px solid rgba(255, 255, 255, 0.56);
  border-radius: 50%;
  transform: translate(-50%, -50%) rotateX(64deg) translateZ(35px);
  background: repeating-radial-gradient(circle, rgba(255, 255, 255, 0.27) 0 1px, transparent 2px 6px), radial-gradient(circle, var(--preview-secondary), var(--preview-primary) 48%, rgba(9, 14, 34, 0.22) 74%);
  box-shadow: 0 0 24px color-mix(in srgb, var(--preview-primary) 60%, transparent), inset 0 0 12px rgba(255, 255, 255, 0.35);
}
.theme-preview-disc i {
  position: absolute;
  inset: 42%;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 7px #fff;
}
.theme-mood {
  position: absolute;
  z-index: 3;
  left: 10px;
  bottom: 9px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 8px;
  letter-spacing: 1.6px;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.7);
}
.theme-copy {
  position: relative;
  z-index: 3;
  padding: 2px 4px 3px;
  transform: translateZ(18px);
}
.theme-name {
  margin-top: 10px;
  font-size: 15px;
  font-weight: 650;
}
.theme-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-sub);
}
.theme-check {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 4;
  color: #fff;
  font-size: 20px;
  filter: drop-shadow(0 0 8px var(--holo-primary));
}
.theme-current {
  position: absolute;
  right: 14px;
  bottom: 17px;
  z-index: 4;
  color: var(--holo-primary);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 1.4px;
}
.glass-control {
  margin-top: 16px;
  padding: 18px 20px;
}
.glass-control-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.glass-control-title {
  font-size: 15px;
  font-weight: 700;
}
.glass-control-sub,
.glass-control-foot {
  margin-top: 4px;
  color: var(--text-sub);
  font-size: 11px;
}
.glass-control-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 250px;
  align-items: center;
  gap: 28px;
  margin-top: 12px;
}
.glass-slider-wrap {
  padding: 0 8px;
}
.glass-slider-wrap :deep(.el-slider__runway) {
  background: linear-gradient(90deg, color-mix(in srgb, var(--holo-primary) 18%, transparent), rgba(148, 163, 184, 0.14));
}
.glass-scale {
  display: flex;
  justify-content: space-between;
  margin-top: -4px;
  color: var(--text-sub);
  font-size: 10px;
}
.glass-preview-window {
  position: relative;
  height: 82px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--holo-primary) 22%, var(--border-color));
  border-radius: 14px;
  background:
    linear-gradient(90deg, transparent 49.5%, rgba(255, 255, 255, 0.1) 50%, transparent 50.5%),
    linear-gradient(0deg, transparent 49.5%, rgba(255, 255, 255, 0.1) 50%, transparent 50.5%),
    radial-gradient(circle at 26% 50%, var(--holo-primary), transparent 28%),
    radial-gradient(circle at 78% 50%, var(--holo-secondary), transparent 32%),
    #090e22;
  background-size: 36px 36px, 36px 36px, auto, auto, auto;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
}
.sample-orbit {
  position: absolute;
  left: 26%;
  top: 50%;
  width: 90px;
  height: 30px;
  border: 1px solid color-mix(in srgb, var(--holo-primary) 76%, white);
  border-radius: 50%;
  transform: translate(-50%, -50%) rotateX(68deg) rotateZ(-20deg);
}
.sample-orbit.orbit-two {
  left: 78%;
  width: 104px;
  border-color: color-mix(in srgb, var(--holo-secondary) 75%, white);
  transform: translate(-50%, -50%) rotateX(68deg) rotateZ(24deg);
}
.glass-preview-card {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 142px;
  min-height: 56px;
  padding: 8px 11px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-radius: 11px;
  background: var(--bg-panel);
  transform: translate(-50%, -50%) perspective(650px) rotateY(-8deg) rotateX(5deg) translateZ(20px);
  box-shadow: 0 12px 24px -15px #000, inset 0 1px 0 rgba(255, 255, 255, 0.16);
  color: var(--text-main);
  font-size: 8px;
  letter-spacing: 1px;
}
.glass-preview-card strong {
  color: var(--holo-primary);
  font-size: 19px;
  white-space: nowrap;
}
.glass-preview-card small {
  font-size: 8px;
  font-weight: 500;
}
.glass-control-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
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
@media (max-width: 760px) {
  .glass-control-body {
    grid-template-columns: minmax(0, 1fr) 205px;
    gap: 16px;
  }
}
@media (max-width: 560px) {
  .theme-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .theme-card {
    padding: 8px;
  }
  .theme-preview {
    height: 92px;
  }
  .theme-name {
    font-size: 13px;
  }
  .theme-desc {
    font-size: 10px;
    line-height: 1.45;
  }
  .theme-current {
    display: none;
  }
  .glass-control {
    padding: 14px;
  }
  .glass-control-head {
    align-items: flex-start;
  }
  .glass-control-head :deep(.el-tag) {
    flex: 0 0 auto;
    font-size: 10px;
  }
  .glass-control-body {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .glass-preview-window {
    height: 72px;
  }
  .theme-preview-panel {
    gap: 14px;
  }
}
</style>
