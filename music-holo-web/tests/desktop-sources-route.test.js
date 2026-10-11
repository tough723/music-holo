import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import router from '../src/router'
import { useUserStore } from '../src/store/user'

beforeEach(async () => {
  localStorage.clear()
  setActivePinia(createPinia())
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  // router 是模块级单例：如果上一个用例的落点恰好就是本次要跳的目标，
  // vue-router 会把它判成重复导航、不再执行守卫，于是「应被重定向」的断言会假失败。
  // 所以每个用例先回到一个无守卫的中性路由，保证用例顺序被打乱时结论一致。
  await router.replace('/lyrics')
})
afterEach(() => { delete globalThis.musicHoloDesktop; vi.restoreAllMocks() })
it('web cannot reach the desktop-only workspace', async () => {
  await router.push('/sources')
  expect(router.currentRoute.value.path).toBe('/home')
})
it('desktop can start at its local workspace without a token or backend', async () => {
  globalThis.musicHoloDesktop = { version: 'test' }
  await router.push('/')
  expect(router.currentRoute.value.path).toBe('/sources')
  expect(useUserStore().isLogin).toBe(false)
  expect(router.currentRoute.value.meta.requiresAuth).not.toBe(true)
})
it('desktop does not bypass account or admin authorization', async () => {
  globalThis.musicHoloDesktop = { version: 'test' }
  await router.push('/settings')
  expect(router.currentRoute.value.path).toBe('/login')
  expect(router.currentRoute.value.query.redirect).toBe('/settings')
  const user = useUserStore(); user.token = 'test-token'; user.userInfo = { id: 2, role: 1 }
  await router.push('/admin/dashboard')
  expect(router.currentRoute.value.path).toBe('/home')
})
