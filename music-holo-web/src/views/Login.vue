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
        <div class="auth-title holo-text">3D 全息音乐</div>
        <div class="auth-sub">登录后开启你的全息音乐之旅</div>
      </div>
      <el-form ref="formRef" :model="form" :rules="rules" size="large" @submit.prevent>
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="用户名" :prefix-icon="User" clearable />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            :prefix-icon="Lock"
            show-password
            @keyup.enter="onSubmit"
          />
        </el-form-item>
        <el-button class="auth-btn" type="primary" size="large" :loading="loading" @click="onSubmit">
          登 录
        </el-button>
      </el-form>
      <div class="auth-foot">
        还没有账号？
        <el-link type="primary" @click="$router.push('/register')">立即注册</el-link>
      </div>
      <div class="auth-tip">
        <el-icon><InfoFilled /></el-icon>
        演示账号：admin / 123456（管理员） 或 demo / 123456（普通用户）
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/store/user'
import HoloProjector from '@/components/HoloProjector.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const formRef = ref(null)
const loading = ref(false)
const form = reactive({ username: '', password: '' })
const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

const onSubmit = async () => {
  await formRef.value.validate()
  loading.value = true
  try {
    await userStore.login(form)
    ElMessage.success('登录成功，欢迎回来！')
    router.push(route.query.redirect || '/home')
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
.auth-tip {
  margin-top: 16px;
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--holo-primary) 8%, transparent);
  color: var(--text-sub);
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}
@media (max-width: 900px) {
  .auth-bg {
    display: none;
  }
}
</style>
