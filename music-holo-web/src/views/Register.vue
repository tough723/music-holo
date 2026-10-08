<template>
  <div class="auth-page">
    <div class="auth-bg">
      <HoloProjector :playing="true" :size="300" />
    </div>
    <div class="auth-card glass-panel">
      <div class="auth-head">
        <div class="auth-logo">
          <el-icon><ChromeFilled /></el-icon>
        </div>
        <div class="auth-title holo-text">注册账号</div>
        <div class="auth-sub">加入 3D 全息音乐平台</div>
      </div>
      <el-form ref="formRef" :model="form" :rules="rules" size="large" @submit.prevent>
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="用户名（3-20位字母数字下划线）" :prefix-icon="User" clearable />
        </el-form-item>
        <el-form-item prop="nickname">
          <el-input v-model="form.nickname" placeholder="昵称（可选）" :prefix-icon="Postcard" clearable />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码（6-32位）"
            :prefix-icon="Lock"
            show-password
          />
        </el-form-item>
        <el-form-item prop="confirm">
          <el-input
            v-model="form.confirm"
            type="password"
            placeholder="确认密码"
            :prefix-icon="Lock"
            show-password
            @keyup.enter="onSubmit"
          />
        </el-form-item>
        <el-button class="auth-btn" type="primary" size="large" :loading="loading" @click="onSubmit">
          注 册
        </el-button>
      </el-form>
      <div class="auth-foot">
        已有账号？
        <el-link type="primary" @click="$router.push('/login')">去登录</el-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/store/user'
import HoloProjector from '@/components/HoloProjector.vue'

const router = useRouter()
const userStore = useUserStore()

const formRef = ref(null)
const loading = ref(false)
const form = reactive({ username: '', nickname: '', password: '', confirm: '' })

const validateConfirm = (_rule, value, callback) => {
  if (value !== form.password) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_]{3,20}$/, message: '用户名需为3-20位字母、数字或下划线', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 32, message: '密码长度需为6-32位', trigger: 'blur' }
  ],
  confirm: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    { validator: validateConfirm, trigger: 'blur' }
  ]
}

const onSubmit = async () => {
  await formRef.value.validate()
  loading.value = true
  try {
    await userStore.register({
      username: form.username,
      password: form.password,
      nickname: form.nickname
    })
    ElMessage.success('注册成功，请登录')
    router.push('/login')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  padding: 20px;
}
.auth-bg {
  position: absolute;
  right: 6%;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0.5;
  pointer-events: none;
}
.auth-card {
  width: 400px;
  max-width: 100%;
  padding: 36px 32px 24px;
  position: relative;
  z-index: 1;
}
.auth-head {
  text-align: center;
  margin-bottom: 26px;
}
.auth-logo {
  width: 56px;
  height: 56px;
  margin: 0 auto 12px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  color: var(--holo-primary);
  background: color-mix(in srgb, var(--holo-primary) 14%, transparent);
  box-shadow: 0 0 24px var(--holo-glow);
}
.auth-title {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 3px;
}
.auth-sub {
  color: var(--text-sub);
  font-size: 13px;
  margin-top: 6px;
}
.auth-btn {
  width: 100%;
  margin-top: 6px;
  letter-spacing: 6px;
}
.auth-foot {
  text-align: center;
  margin-top: 18px;
  font-size: 13px;
  color: var(--text-sub);
}
@media (max-width: 900px) {
  .auth-bg {
    display: none;
  }
}
</style>
