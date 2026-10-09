import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

const reviewApi = vi.hoisted(() => ({
  page: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  setLiked: vi.fn(),
  report: vi.fn(),
  adminPage: vi.fn(),
  adminReportsPage: vi.fn(),
  setVisibility: vi.fn(),
  handleReport: vi.fn()
}))

vi.mock('@/api/review', () => reviewApi)

import ReviewPanel from '../src/components/ReviewPanel.vue'
import ReviewModeration from '../src/views/admin/ReviewModeration.vue'

const mountedApps = []

async function flushUpdates() {
  await Promise.resolve()
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

async function mountRoot(rootComponent) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => h('main') } }]
  })
  await router.push('/')
  await router.isReady()

  const app = createApp(rootComponent)
  app.use(createPinia())
  app.use(router)
  app.use(ElementPlus)
  for (const [name, component] of Object.entries(ElementPlusIconsVue)) app.component(name, component)

  const host = document.createElement('div')
  document.body.append(host)
  app.mount(host)
  mountedApps.push({ app, host })
  await flushUpdates()
  return { app, host, router }
}

async function mountComponent(component, props = {}) {
  return mountRoot({ render: () => h(component, props) })
}

function findButton(host, label) {
  return [...host.querySelectorAll('button')].find((button) => button.textContent.includes(label))
}

function reviewRecord(id, content) {
  return {
    id,
    targetType: 'song',
    targetId: id,
    authorName: '听众',
    content,
    likeCount: 0,
    status: 1,
    mine: false,
    liked: false,
    createTime: '2026-10-09T00:00:00'
  }
}

beforeEach(() => {
  localStorage.clear()
  Object.values(reviewApi).forEach((method) => method.mockReset())
  reviewApi.page.mockResolvedValue({ records: [], total: 0 })
  reviewApi.adminPage.mockResolvedValue({ records: [], total: 0 })
  reviewApi.adminReportsPage.mockResolvedValue({ records: [], total: 0 })
})

afterEach(() => {
  for (const { app, host } of mountedApps.splice(0)) {
    app.unmount()
    host.remove()
  }
})

describe('短评加载失败与恢复', () => {
  it('短评接口失败时不会伪装成空列表，并提供重试', async () => {
    reviewApi.page.mockRejectedValueOnce(new Error('offline'))
    const { host } = await mountComponent(ReviewPanel, { targetType: 'song', targetId: 1 })

    expect(host.querySelector('[role="alert"]')?.textContent).toContain('这不代表当前没有短评')
    expect(host.querySelector('.review-total')).toBe(null)
    expect(host.textContent).not.toContain('还没有短评')

    reviewApi.page.mockResolvedValueOnce({ records: [], total: 0 })
    findButton(host, '重试').click()
    await flushUpdates()

    expect(host.textContent).toContain('还没有短评')
    expect(host.querySelector('[role="alert"]')).toBe(null)
    expect(reviewApi.page).toHaveBeenCalledTimes(2)
  })

  it('目标切换后忽略较早的短评响应', async () => {
    let resolveOld
    let resolveCurrent
    reviewApi.page
      .mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveCurrent = resolve }))

    const targetId = ref(1)
    const { host } = await mountRoot({
      render: () => h(ReviewPanel, { targetType: 'song', targetId: targetId.value })
    })
    targetId.value = 2
    await flushUpdates()
    expect(reviewApi.page).toHaveBeenCalledTimes(2)

    resolveCurrent({ records: [reviewRecord(2, '当前对象的短评')], total: 1 })
    await flushUpdates()
    resolveOld({ records: [reviewRecord(1, '过期对象的短评')], total: 1 })
    await flushUpdates()

    expect(host.textContent).toContain('当前对象的短评')
    expect(host.textContent).not.toContain('过期对象的短评')
  })

  it('管理员举报队列失败时明确提示不可用，重试成功后恢复列表', async () => {
    reviewApi.adminReportsPage.mockRejectedValueOnce(new Error('offline'))
    const { host } = await mountComponent(ReviewModeration)

    expect(host.querySelector('[role="alert"]')?.textContent).toContain('不能确认队列是否为空')
    expect(host.querySelector('.queue-load-error')).not.toBe(null)

    reviewApi.adminReportsPage.mockResolvedValueOnce({ records: [], total: 0 })
    findButton(host, '重试').click()
    await flushUpdates()

    expect(host.querySelector('[role="alert"]')).toBe(null)
    expect(host.querySelector('.queue-load-error')).toBe(null)
    expect(reviewApi.adminReportsPage).toHaveBeenCalledTimes(2)
  })

  it('管理员短评列表加载失败时提供单独的重试状态', async () => {
    const { host } = await mountComponent(ReviewModeration)
    reviewApi.adminPage.mockRejectedValueOnce(new Error('offline'))
    const reviewsTab = [...host.querySelectorAll('.el-tabs__item')]
      .find((tab) => tab.textContent.includes('短评管理'))
    reviewsTab.click()
    await flushUpdates()

    expect(host.querySelector('[role="alert"]')?.textContent).toContain('短评列表暂不可用')

    reviewApi.adminPage.mockResolvedValueOnce({ records: [], total: 0 })
    findButton(host, '重试').click()
    await flushUpdates()

    expect(host.querySelector('.queue-load-error')).toBe(null)
    expect(reviewApi.adminPage).toHaveBeenCalledTimes(2)
  })
})
