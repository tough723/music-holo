<template>
  <div class="page">
    <div class="page-head glass-panel">
      <div class="page-heading-copy">
        <div class="settings-eyebrow">MUSIC HOLO · PERSONAL CONSOLE</div>
        <div class="page-title">设置中心</div>
        <div class="page-subtitle">按类别管理视觉、播放、本机数据、账号安全与自定义音源。</div>
      </div>
      <div class="settings-overview" aria-label="当前设置概览">
        <div class="overview-chip">
          <span class="overview-dot"></span>
          <span>主题</span>
          <strong>{{ themeStore.current.label }}</strong>
        </div>
        <div class="overview-chip">
          <span class="overview-dot glass-dot"></span>
          <span>玻璃</span>
          <strong>{{ themeStore.glassOpacity }}%</strong>
        </div>
        <div class="overview-chip">
          <span class="overview-dot motion-dot"></span>
          <span>动效</span>
          <strong>{{ preferencesStore.visualMotion === 'calm' ? '柔和' : '影院' }}</strong>
        </div>
      </div>
    </div>

    <el-tabs v-model="activeTab" :tab-position="tabPosition" class="settings-tabs" @tab-change="persistActiveTab">
      <el-tab-pane label="通用设置" name="general">
        <GeneralPreferences @navigate="activeTab = $event" />
      </el-tab-pane>

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
        <div class="theme-tip" role="status" :class="`theme-sync-${themeSyncState}`">
          <el-icon><InfoFilled /></el-icon>
          <span>{{ themeSyncMessage }}</span>
          <el-button v-if="themeSyncState === 'error'" text type="primary" size="small" @click="retryThemeSync">重试同步</el-button>
        </div>
        <div class="theme-preview-panel glass-panel">
          <div class="preview-title">实时预览</div>
          <div class="preview-stage">
            <HoloProjector
              :cover="playerStore.currentSong?.cover"
              :anonymous-cover="Boolean(playerStore.currentSong?.isCustomSource)"
              :title="playerStore.currentSong?.title || '全息投影'"
              :singer="playerStore.currentSong?.singerName"
              :playing="playerStore.playing"
              :size="150"
              show-caption
            />
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="不喜欢" name="dislike">
        <DislikeRulesPanel />
      </el-tab-pane>

      <el-tab-pane label="播放偏好" name="playback">
        <PlaybackPreferences />
      </el-tab-pane>

      <el-tab-pane label="搜索与隐私" name="search">
        <SearchPreferences />
      </el-tab-pane>

      <!-- 个人资料 -->
      <el-tab-pane label="个人资料" name="profile">
        <div v-loading="loadingProfile" class="profile-panel glass-panel">
          <el-alert v-if="profileLoadError" type="error" :closable="false" show-icon class="profile-load-error">
            <template #title>资料暂时无法读取</template>
            <el-button text type="primary" @click="loadProfile">重试</el-button>
          </el-alert>
          <el-form ref="profileFormRef" :model="profileForm" :rules="profileRules" label-width="80px" style="max-width: 520px">
            <el-form-item label="头像">
              <div class="avatar-row">
                <div class="avatar-preview">
                  <Cover :src="profileForm.avatar" :text="profileForm.nickname || profileForm.username" :size="72" />
                </div>
                <div class="avatar-actions">
                  <el-upload
                    :show-file-list="false"
                    :http-request="onUploadAvatar"
                    :before-upload="beforeAvatarUpload"
                    accept=".png,.jpg,.jpeg,.webp"
                    :disabled="avatarUploading"
                  >
                    <el-button :loading="avatarUploading">上传头像</el-button>
                  </el-upload>
                  <small>支持 JPG、PNG、WebP，最大 5 MB</small>
                </div>
              </div>
            </el-form-item>
            <el-form-item label="用户名">
              <el-input v-model="profileForm.username" disabled />
            </el-form-item>
            <el-form-item label="昵称" prop="nickname">
              <el-input v-model="profileForm.nickname" maxlength="32" show-word-limit placeholder="请输入昵称" />
            </el-form-item>
            <el-form-item label="性别" prop="gender">
              <el-radio-group v-model="profileForm.gender">
                <el-radio :value="0">保密</el-radio>
                <el-radio :value="1">男</el-radio>
                <el-radio :value="2">女</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="邮箱" prop="email">
              <el-input v-model="profileForm.email" type="email" maxlength="100" placeholder="选填，name@example.com" />
            </el-form-item>
            <el-form-item label="手机号" prop="phone">
              <el-input v-model="profileForm.phone" maxlength="24" placeholder="选填" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="savingProfile" :disabled="loadingProfile || !!profileLoadError" @click="onSaveProfile">保存资料</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <!-- 修改密码 -->
      <el-tab-pane label="修改密码" name="password">
        <div class="profile-panel glass-panel">
          <div class="security-note">
            <el-icon><Lock /></el-icon>
            <span>为保护账号安全，密码修改成功后会退出当前账号，需要使用新密码重新登录。</span>
          </div>
          <el-form ref="passwordFormRef" :model="passwordForm" :rules="passwordRules" label-width="90px" style="max-width: 420px">
            <el-form-item label="原密码" prop="oldPassword">
              <el-input v-model="passwordForm.oldPassword" type="password" show-password autocomplete="current-password" placeholder="请输入原密码" />
            </el-form-item>
            <el-form-item label="新密码" prop="newPassword">
              <el-input v-model="passwordForm.newPassword" type="password" show-password autocomplete="new-password" placeholder="6-32 位新密码" />
            </el-form-item>
            <el-form-item label="确认新密码" prop="confirm">
              <el-input v-model="passwordForm.confirm" type="password" show-password autocomplete="new-password" placeholder="请再次输入新密码" @keyup.enter="onChangePassword" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="savingPassword" @click="onChangePassword">修改密码</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <!-- 自定义音源：脚本本地管理，不在未隔离环境执行 -->
      <el-tab-pane label="自定义源" name="sources">
        <CustomSourceManager />
      </el-tab-pane>

      <el-tab-pane label="本机数据" name="data">
        <SettingsBackupPanel @navigate="activeTab = $event" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import * as userApi from '@/api/user'
import * as commonApi from '@/api/common'
import { useUserStore } from '@/store/user'
import { useThemeStore, THEMES } from '@/store/theme'
import { usePlayerStore } from '@/store/player'
import HoloProjector from '@/components/HoloProjector.vue'
import Cover from '@/components/Cover.vue'
import CustomSourceManager from '@/components/settings/CustomSourceManager.vue'
import GeneralPreferences from '@/components/settings/GeneralPreferences.vue'
import PlaybackPreferences from '@/components/settings/PlaybackPreferences.vue'
import DislikeRulesPanel from '@/components/settings/DislikeRulesPanel.vue'
import SearchPreferences from '@/components/settings/SearchPreferences.vue'
import SettingsBackupPanel from '@/components/settings/SettingsBackupPanel.vue'
import { usePreferencesStore } from '@/store/preferences'

const userStore = useUserStore()
const themeStore = useThemeStore()
const playerStore = usePlayerStore()
const preferencesStore = usePreferencesStore()

const SETTINGS_TAB_KEY = 'mh_settings_tab'
const SETTINGS_TABS = ['general', 'theme', 'dislike', 'playback', 'search', 'profile', 'password', 'sources', 'data']
const savedTab = localStorage.getItem(SETTINGS_TAB_KEY)
const activeTab = ref(SETTINGS_TABS.includes(savedTab) ? savedTab : 'general')
const tabPosition = ref(typeof window !== 'undefined' && window.innerWidth <= 760 ? 'top' : 'left')
const updateTabPosition = () => { tabPosition.value = window.innerWidth <= 760 ? 'top' : 'left' }
const persistActiveTab = (tab) => {
  if (SETTINGS_TABS.includes(tab)) localStorage.setItem(SETTINGS_TAB_KEY, tab)
}
const glassOpacity = computed({
  get: () => themeStore.glassOpacity,
  set: (value) => themeStore.setGlassOpacity(value)
})
const formatOpacity = (value) => `${value}%`
const savingProfile = ref(false)
const savingPassword = ref(false)
const loadingProfile = ref(false)
const profileLoadError = ref(false)
const avatarUploading = ref(false)
const profileFormRef = ref(null)
const passwordFormRef = ref(null)
const themeSyncState = ref('ready')

const profileForm = reactive({
  username: '',
  nickname: '',
  avatar: '',
  gender: 0,
  email: '',
  phone: ''
})

const profileRules = {
  nickname: [
    { required: true, message: '请输入昵称', trigger: 'blur' },
    { max: 32, message: '昵称最多 32 个字符', trigger: 'blur' }
  ],
  email: [{
    validator: (_rule, value, callback) => {
      const email = String(value || '').trim()
      if (!email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) callback()
      else callback(new Error('邮箱格式不正确'))
    },
    trigger: 'blur'
  }],
  phone: [{
    validator: (_rule, value, callback) => {
      const phone = String(value || '').trim()
      if (!phone || /^[0-9+().\s-]{7,24}$/.test(phone)) callback()
      else callback(new Error('手机号格式不正确'))
    },
    trigger: 'blur'
  }]
}

const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirm: ''
})

const passwordRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 32, message: '新密码长度需为 6-32 位', trigger: 'blur' }
  ],
  confirm: [{
    validator: (_rule, value, callback) => {
      if (!value) callback(new Error('请确认新密码'))
      else if (value !== passwordForm.newPassword) callback(new Error('两次输入的新密码不一致'))
      else callback()
    },
    trigger: 'blur'
  }]
}

const themeSyncMessage = computed(() => {
  if (themeSyncState.value === 'saving') return '正在应用主题并同步账号设置…'
  if (themeSyncState.value === 'error') return '主题已应用到本机，但账号同步失败；可稍后重试。'
  if (themeSyncState.value === 'local') return '主题已应用到此设备；登录后切换主题即可同步到账号。'
  if (themeSyncState.value === 'synced') return '主题已同步到账号；玻璃透明度仅保存在此设备。'
  return userStore.isLogin
    ? '切换主题会即时生效并同步到账号，下次登录自动恢复。'
    : '游客模式下主题保存在此设备；登录后可同步到账号。'
})

async function syncTheme(key) {
  const wasLoggedIn = userStore.isLogin
  themeSyncState.value = 'saving'
  try {
    const result = await themeStore.setTheme(key)
    if (!wasLoggedIn) {
      themeSyncState.value = 'local'
      ElMessage.success(`已在此设备切换主题：${THEMES.find((theme) => theme.key === key)?.label}`)
    } else if (result?.synced) {
      themeSyncState.value = 'synced'
      ElMessage.success(`主题已切换并同步到账号：${THEMES.find((theme) => theme.key === key)?.label}`)
    } else {
      themeSyncState.value = 'error'
      ElMessage.warning('主题已在本机生效，但账号同步失败；可稍后重试')
    }
  } catch {
    themeSyncState.value = wasLoggedIn ? 'error' : 'local'
    ElMessage.warning(wasLoggedIn ? '主题已在本机生效，但账号同步失败；可稍后重试' : '主题已在此设备应用')
  }
}

const onTheme = (key) => {
  if (themeStore.theme === key && themeSyncState.value !== 'error') return
  syncTheme(key)
}

const retryThemeSync = () => {
  if (userStore.isLogin) syncTheme(themeStore.theme)
  else themeSyncState.value = 'local'
}

const loadProfile = async () => {
  loadingProfile.value = true
  profileLoadError.value = false
  try {
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
  } catch {
    profileLoadError.value = true
  } finally {
    loadingProfile.value = false
  }
}

const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
function beforeAvatarUpload(file) {
  if (!ALLOWED_AVATAR_TYPES.has(file?.type)) {
    ElMessage.warning('头像仅支持 JPG、PNG 或 WebP 格式')
    return false
  }
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.warning('头像文件不能超过 5 MB')
    return false
  }
  return true
}

const onUploadAvatar = async ({ file }) => {
  if (!beforeAvatarUpload(file)) return
  avatarUploading.value = true
  try {
    const result = await commonApi.upload(file)
    profileForm.avatar = result.url
    ElMessage.success('头像上传成功，保存资料后完成更新')
  } catch {
    // API 拦截器负责展示上传错误。
  } finally {
    avatarUploading.value = false
  }
}

const onSaveProfile = async () => {
  const valid = await profileFormRef.value?.validate().catch(() => false)
  if (!valid) return
  savingProfile.value = true
  try {
    const info = await userApi.updateProfile({
      nickname: profileForm.nickname.trim(),
      avatar: profileForm.avatar,
      gender: profileForm.gender,
      email: profileForm.email.trim(),
      phone: profileForm.phone.trim()
    })
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
    ElMessage.success('资料保存成功')
  } catch {
    // API 拦截器负责展示保存错误。
  } finally {
    savingProfile.value = false
  }
}

const onChangePassword = async () => {
  const valid = await passwordFormRef.value?.validate().catch(() => false)
  if (!valid) return
  savingPassword.value = true
  try {
    await userApi.changePassword({
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword
    })
    ElMessage.success('密码修改成功，请使用新密码重新登录')
    await userStore.logout()
    location.href = '/login'
  } catch {
    // API 拦截器负责展示密码修改错误。
  } finally {
    savingPassword.value = false
  }
}

onMounted(() => {
  loadProfile()
  window.addEventListener('resize', updateTabPosition)
})
onUnmounted(() => window.removeEventListener('resize', updateTabPosition))
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-head {
  position: relative;
  min-height: 118px;
  padding: 20px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  overflow: hidden;
  background:
    radial-gradient(ellipse at 82% 44%, color-mix(in srgb, var(--holo-primary) 18%, transparent), transparent 38%),
    linear-gradient(115deg, color-mix(in srgb, var(--holo-secondary) 8%, transparent), transparent 68%);
}
.page-heading-copy { position: relative; z-index: 1; }
.settings-eyebrow { color: var(--holo-primary); font-size: 9px; letter-spacing: 2px; }
.page-head .page-title { margin-top: 7px; }
.settings-overview { position: relative; z-index: 1; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 9px; }
.overview-chip {
  display: flex; align-items: center; gap: 7px; padding: 9px 12px; border: 1px solid color-mix(in srgb, var(--holo-primary) 22%, var(--border-color));
  border-radius: 999px; color: var(--text-sub); background: color-mix(in srgb, var(--bg-panel) 70%, transparent); font-size: 10px;
}
.overview-chip strong { color: var(--text-main); font-size: 11px; font-weight: 650; }
.overview-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--holo-primary); box-shadow: 0 0 10px var(--holo-primary); }
.glass-dot { background: var(--holo-secondary); box-shadow: 0 0 10px var(--holo-secondary); }
.motion-dot { background: #a3e635; box-shadow: 0 0 10px #a3e635; }
.settings-tabs {
  min-width: 0;
  padding: 0 4px;
  align-items: flex-start;
  overflow: visible;
}
.settings-tabs :deep(.el-tabs__header.is-left) {
  width: 168px;
  flex: 0 0 168px;
  align-self: stretch;
  padding: 8px;
  margin-right: 18px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: linear-gradient(145deg, color-mix(in srgb, var(--holo-primary) 4%, var(--bg-panel)), var(--bg-panel));
  box-shadow: 0 18px 42px -36px #000, inset 0 1px 0 rgba(255, 255, 255, .05);
}
.settings-tabs :deep(.el-tabs__nav-wrap.is-left),
.settings-tabs :deep(.el-tabs__nav-scroll) { height: auto; }
.settings-tabs :deep(.el-tabs__nav-wrap.is-left) { margin-right: 0; overflow: visible; }
.settings-tabs :deep(.el-tabs__nav-wrap.is-left::after) { display: none; }
.settings-tabs :deep(.el-tabs__nav.is-left) { display: flex; flex-direction: column; float: none; width: 100%; gap: 4px; }
.settings-tabs :deep(.el-tabs__item.is-left) {
  justify-content: flex-start;
  height: 42px;
  padding: 0 12px;
  border-radius: 9px;
  color: var(--text-sub);
  text-align: left;
  transition: color .16s ease, background .16s ease, transform .16s ease;
}
.settings-tabs :deep(.el-tabs__item.is-left:hover) { background: color-mix(in srgb, var(--holo-primary) 7%, transparent); transform: translateX(2px); }
.settings-tabs :deep(.el-tabs__item.is-left.is-active) { color: var(--holo-primary); background: color-mix(in srgb, var(--holo-primary) 11%, transparent); box-shadow: inset 2px 0 0 var(--holo-primary); }
.settings-tabs :deep(.el-tabs__active-bar.is-left) { display: none; }
.settings-tabs :deep(.el-tabs__content) { min-width: 0; flex: 1; overflow: visible; }
.settings-tabs :deep(.el-tab-pane) { min-width: 0; }
@media (max-width: 760px) {
  .settings-tabs { display: block; }
  .settings-tabs :deep(.el-tabs__header) { width: 100%; margin: 0 0 12px; padding: 0 0 4px; border: 0; border-bottom: 1px solid var(--border-color); border-radius: 0; background: transparent; box-shadow: none; }
  .settings-tabs :deep(.el-tabs__nav-wrap) { overflow: auto; }
  .settings-tabs :deep(.el-tabs__nav-wrap::after) { display: block; height: 1px; background: var(--border-color); }
  .settings-tabs :deep(.el-tabs__nav) { flex-direction: row; gap: 2px; }
  .settings-tabs :deep(.el-tabs__item) { height: 40px; padding: 0 11px; border-radius: 8px; font-size: 12px; }
  .settings-tabs :deep(.el-tabs__item.is-active) { background: color-mix(in srgb, var(--holo-primary) 9%, transparent); }
  .settings-tabs :deep(.el-tabs__active-bar) { display: none; }
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
  flex-wrap: wrap;
  gap: 6px;
}
.theme-tip span { flex: 1 1 260px; }
.theme-sync-error { color: var(--el-color-warning); }
.theme-sync-synced { color: var(--el-color-success); }
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
.profile-load-error { max-width: 520px; margin-bottom: 16px; }
.avatar-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.avatar-actions { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; }
.avatar-actions small { color: var(--text-sub); font-size: 10px; }
.security-note {
  max-width: 620px; display: flex; align-items: flex-start; gap: 9px; margin: 0 0 20px; padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--holo-primary) 22%, var(--border-color)); border-radius: 12px;
  color: var(--text-sub); background: color-mix(in srgb, var(--holo-primary) 6%, transparent); font-size: 12px; line-height: 1.6;
}
.security-note :deep(.el-icon) { flex: 0 0 auto; margin-top: 2px; color: var(--holo-primary); }
.avatar-preview {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid color-mix(in srgb, var(--holo-primary) 50%, transparent);
}
@media (max-width: 760px) {
  .page-head { min-height: 110px; }
  .settings-overview { flex-direction: column; align-items: flex-end; }
  .glass-control-body {
    grid-template-columns: minmax(0, 1fr) 205px;
    gap: 16px;
  }
}
@media (max-width: 560px) {
  .page-head { align-items: flex-start; flex-direction: column; gap: 12px; padding: 16px; }
  .settings-overview { width: 100%; flex-direction: row; justify-content: flex-start; }
  .overview-chip { padding: 7px 10px; }
  .profile-panel { padding: 16px; }
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
