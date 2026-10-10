import { afterEach, describe, expect, it, vi } from 'vitest'
import { settleOptionalRequest } from '@/utils/optionalTimeout'

afterEach(() => vi.useRealTimers())

describe('非关键的自定义源附加数据', () => {
  it('正常返回时保留结果且不调用超时回调', async () => {
    const onTimeout = vi.fn()
    await expect(settleOptionalRequest(Promise.resolve('歌词'), { timeoutMs: 100, onTimeout }))
      .resolves.toEqual({ timedOut: false, value: '歌词' })
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('超过期限后返回可继续播放的超时状态并取消底层请求', async () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    const pending = settleOptionalRequest(new Promise(() => {}), { timeoutMs: 250, onTimeout })
    await vi.advanceTimersByTimeAsync(250)
    await expect(pending).resolves.toEqual({ timedOut: true, value: undefined })
    expect(onTimeout).toHaveBeenCalledOnce()
  })

  it('附加数据请求拒绝时把错误作为可选结果，不向外抛出', async () => {
    const error = new Error('歌词不可用')
    await expect(settleOptionalRequest(Promise.reject(error), { timeoutMs: 100 }))
      .resolves.toEqual({ timedOut: false, value: undefined, error })
  })
})
