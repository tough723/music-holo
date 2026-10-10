import { describe, expect, it } from 'vitest'
import {
  AUTO_RETRY_DELAYS_MS,
  STALL_TIMEOUT_MS,
  hasProgress,
  isPlaybackStalled,
  AUTO_RETRY_MAX_ATTEMPTS,
  MEDIA_ERR_DECODE,
  MEDIA_ERR_NETWORK,
  MEDIA_ERR_SRC_NOT_SUPPORTED,
  isTransientAudioError,
  nextRetryDelay,
  shouldAutoRetry
} from '../src/utils/audioRetry.js'

describe('音频加载失败的自动重试策略', () => {
  it('只有网络中断与解码失败值得自动重试', () => {
    expect(isTransientAudioError(MEDIA_ERR_NETWORK)).toBe(true)
    expect(isTransientAudioError(MEDIA_ERR_DECODE)).toBe(true)
    // 地址不支持、被中止：重试多少次都不会变
    expect(isTransientAudioError(MEDIA_ERR_SRC_NOT_SUPPORTED)).toBe(false)
    expect(isTransientAudioError(1)).toBe(false)
    expect(isTransientAudioError(undefined)).toBe(false)
    expect(isTransientAudioError(null)).toBe(false)
  })

  it('退避间隔先快后慢，超过上限就不再自动重试', () => {
    expect(AUTO_RETRY_MAX_ATTEMPTS).toBe(3)
    expect(nextRetryDelay(1)).toBe(800)
    expect(nextRetryDelay(2)).toBe(2500)
    expect(nextRetryDelay(3)).toBe(6000)
    expect(nextRetryDelay(4)).toBeNull()
    expect(nextRetryDelay(0)).toBeNull()
    expect(nextRetryDelay('x')).toBeNull()
    expect(AUTO_RETRY_DELAYS_MS[0]).toBeLessThan(AUTO_RETRY_DELAYS_MS[2])
    // 间隔递增
    for (let i = 1; i < AUTO_RETRY_DELAYS_MS.length; i += 1) {
      expect(AUTO_RETRY_DELAYS_MS[i]).toBeGreaterThan(AUTO_RETRY_DELAYS_MS[i - 1])
    }
  })

  it('缓冲卡死：进度长时间不推进才判定，正常推进立即复位', () => {
    expect(isPlaybackStalled({ stalledSince: 1000, now: 1000 + STALL_TIMEOUT_MS - 1 })).toBe(false)
    expect(isPlaybackStalled({ stalledSince: 1000, now: 1000 + STALL_TIMEOUT_MS })).toBe(true)
    // 还没开始计时 / 时钟异常：不算卡死
    expect(isPlaybackStalled({ stalledSince: 0, now: 99999 })).toBe(false)
    expect(isPlaybackStalled({ stalledSince: undefined, now: 1000 })).toBe(false)
    expect(isPlaybackStalled({ stalledSince: 1000, now: NaN })).toBe(false)
    // 阈值比一般缓冲等得久
    expect(STALL_TIMEOUT_MS).toBeGreaterThan(3000)
  })

  it('进度推进的判定有最小粒度，浮点抖动不算', () => {
    expect(hasProgress(10, 10.5)).toBe(true)
    expect(hasProgress(10, 10.01)).toBe(false)
    expect(hasProgress(10, 9.5)).toBe(true)
    expect(hasProgress(undefined, 1)).toBe(false)
    expect(hasProgress(0, NaN)).toBe(false)
  })

  it('shouldAutoRetry 同时看错误类型与已尝试次数', () => {
    expect(shouldAutoRetry(0, MEDIA_ERR_NETWORK)).toBe(true)
    expect(shouldAutoRetry(2, MEDIA_ERR_NETWORK)).toBe(true) // 第三次
    expect(shouldAutoRetry(3, MEDIA_ERR_NETWORK)).toBe(false) // 用完了
    expect(shouldAutoRetry(0, MEDIA_ERR_SRC_NOT_SUPPORTED)).toBe(false)
  })
})
