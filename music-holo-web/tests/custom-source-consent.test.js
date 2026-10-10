import { describe, expect, it, vi } from 'vitest'
import { createCustomSourceRequestBridge } from '@/utils/customSourceConsent'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('自定义音源逐会话网络授权', () => {
  it('并发网络请求按域名串行弹授权，同域名请求共享一次确认', async () => {
    const firstDomainApproval = deferred()
    const secondDomainApproval = deferred()
    let activePrompts = 0
    let maxActivePrompts = 0
    const confirmRequest = vi.fn(({ target }) => {
      activePrompts += 1
      maxActivePrompts = Math.max(maxActivePrompts, activePrompts)
      const gate = target.origin === 'https://one.example.org' ? firstDomainApproval : secondDomainApproval
      return gate.promise.finally(() => { activePrompts -= 1 })
    })
    const request = vi.fn().mockResolvedValue({ statusCode: 200 })
    const bridge = createCustomSourceRequestBridge({ name: '并发初始化源' }, { confirmRequest, request })

    const firstRequest = bridge('https://one.example.org/ip', { method: 'GET' })
    const secondDomainRequest = bridge('https://two.example.org/version', { method: 'GET' })
    const sameDomainRequest = bridge('https://one.example.org/version', { method: 'GET' })

    await vi.waitFor(() => expect(confirmRequest).toHaveBeenCalledOnce())
    expect(confirmRequest.mock.calls[0][0].target.origin).toBe('https://one.example.org')
    expect(maxActivePrompts).toBe(1)
    firstDomainApproval.resolve()

    await vi.waitFor(() => expect(confirmRequest).toHaveBeenCalledTimes(2))
    expect(confirmRequest.mock.calls[1][0].target.origin).toBe('https://two.example.org')
    expect(maxActivePrompts).toBe(1)
    secondDomainApproval.resolve()

    await Promise.all([firstRequest, secondDomainRequest, sameDomainRequest])
    expect(confirmRequest).toHaveBeenCalledTimes(2)
    expect(request).toHaveBeenCalledTimes(3)
    expect(maxActivePrompts).toBe(1)
  })

  it('同一会话内按域名只确认一次，新会话必须重新确认', async () => {
    const confirmRequest = vi.fn().mockResolvedValue(undefined)
    const request = vi.fn().mockResolvedValue({ statusCode: 200 })
    const source = { name: '隔离测试源' }
    const bridge = createCustomSourceRequestBridge(source, { confirmRequest, request })

    await bridge('https://api.example.org/first', { method: 'GET' })
    await bridge('https://api.example.org/second', { method: 'POST' })
    expect(confirmRequest).toHaveBeenCalledOnce()
    expect(confirmRequest).toHaveBeenCalledWith(expect.objectContaining({
      sourceName: '隔离测试源',
      method: 'GET',
      target: expect.objectContaining({ origin: 'https://api.example.org' })
    }))
    expect(request).toHaveBeenCalledTimes(2)

    const nextRun = createCustomSourceRequestBridge(source, { confirmRequest, request })
    await nextRun('https://api.example.org/third', { method: 'GET' })
    expect(confirmRequest).toHaveBeenCalledTimes(2)
  })

  it('用户拒绝域名时不发请求，重试仍需重新确认', async () => {
    const confirmRequest = vi.fn()
      .mockRejectedValueOnce('cancel')
      .mockResolvedValueOnce(undefined)
    const request = vi.fn().mockResolvedValue({ statusCode: 200 })
    const bridge = createCustomSourceRequestBridge({ name: '待授权源' }, { confirmRequest, request })

    await expect(bridge('https://api.example.org/song', { method: 'GET' })).rejects.toBe('cancel')
    expect(request).not.toHaveBeenCalled()
    await bridge('https://api.example.org/song', { method: 'GET' })
    expect(confirmRequest).toHaveBeenCalledTimes(2)
    expect(request).toHaveBeenCalledOnce()
  })

  it('只允许公网 HTTPS 目标，校验失败前不会询问或发出请求', async () => {
    const confirmRequest = vi.fn().mockResolvedValue(undefined)
    const request = vi.fn()
    const bridge = createCustomSourceRequestBridge({}, { confirmRequest, request })

    await expect(bridge('http://api.example.org/song', { method: 'GET' })).rejects.toThrow('公网 HTTPS')
    await expect(bridge('https://127.0.0.1/private', { method: 'GET' })).rejects.toThrow('公网 HTTPS')
    expect(confirmRequest).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })

  it('授权弹窗期间会检查取消信号，不在取消后继续网络请求', async () => {
    const controller = new AbortController()
    const confirmRequest = vi.fn(() => {
      controller.abort()
      return Promise.resolve()
    })
    const request = vi.fn()
    const bridge = createCustomSourceRequestBridge({}, { confirmRequest, request })

    await expect(bridge('https://api.example.org/song', {}, controller.signal)).rejects.toThrow('已取消')
    expect(request).not.toHaveBeenCalled()
  })
})
