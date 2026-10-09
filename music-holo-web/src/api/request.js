import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'
import { useUserStore } from '@/store/user'
import { mockRequest, mockEnabled } from './mock'

/**
 * 统一请求封装：
 * - baseURL 为 /api，开发环境由 Vite 代理到后端（见 vite.config.js）
 * - 自动携带 Sa-Token 的 token 请求头（music-holo-token）
 * - 统一拆包 Result{code,msg,data}，code 非 200 时提示并 reject
 * - VITE_API_MOCK=true 时走内置 Mock 服务（无后端也能完整体验前端）
 */
const service = axios.create({
  baseURL: '/api',
  timeout: 20000
})

service.interceptors.request.use((config) => {
  const userStore = useUserStore()
  if (userStore.token) {
    config.headers['music-holo-token'] = userStore.token
  }
  return config
})

service.interceptors.response.use(
  (res) => {
    const data = res.data
    // 文件下载等 blob 响应直接透传
    if (data instanceof Blob) {
      return data
    }
    if (data && typeof data === 'object' && 'code' in data) {
      if (data.code === 200) {
        return data.data
      }
      if (data.code === 401) {
        const userStore = useUserStore()
        userStore.logoutLocal()
        if (router.currentRoute.value.path !== '/login') {
          router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } })
        }
      }
      ElMessage.error(data.msg || '请求失败')
      return Promise.reject(new Error(data.msg || '请求失败'))
    }
    return data
  },
  (err) => {
    if (err.code !== 'ERR_CANCELED') {
      ElMessage.error('无法连接后端服务，请确认 music-holo-server 已启动（或开启 Mock 演示模式）')
    }
    return Promise.reject(err)
  }
)

/** Mock 模式下手动补上 token 请求头（axios 拦截器不经过 mock 链路） */
function withToken(config) {
  const userStore = useUserStore()
  return {
    ...config,
    headers: {
      ...(config.headers || {}),
      'music-holo-token': userStore.token || ''
    }
  }
}

/**
 * 统一入口：Mock 模式下走 mockRequest，否则走 axios
 */
export function api(config) {
  if (mockEnabled) {
    return mockRequest(withToken(config))
  }
  return service(config)
}

/** 直接走 axios（用于 multipart 上传等场景，Mock 模式下同样接管） */
export function rawPost(url, data, config = {}) {
  if (mockEnabled) {
    return mockRequest(withToken({ url, method: 'post', data, ...config }))
  }
  const userStore = useUserStore()
  return service.post(url, data, {
    headers: { 'music-holo-token': userStore.token || '' },
    ...config
  })
}

export default service
