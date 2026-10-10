/**
 * 音频加载失败的自动重试策略（纯计算，便于单测）。
 *
 * 只有「瞬时故障」值得自动重试：网络中断（2）和解码失败（3）常常再来一次就好；
 * 地址本身不支持（4）或播放被主动中止（1）重试多少次都不会变，
 * 盲目重试只会把一次明确的失败变成三次没有声音的等待。
 */

export const MEDIA_ERR_ABORTED = 1
export const MEDIA_ERR_NETWORK = 2
export const MEDIA_ERR_DECODE = 3
export const MEDIA_ERR_SRC_NOT_SUPPORTED = 4

/** 三次机会，退避间隔（毫秒）：先快后慢，避免在网络抖动时打爆音源。 */
export const AUTO_RETRY_DELAYS_MS = Object.freeze([800, 2500, 6000])
export const AUTO_RETRY_MAX_ATTEMPTS = AUTO_RETRY_DELAYS_MS.length

export function isTransientAudioError(code) {
  const value = Number(code)
  return value === MEDIA_ERR_NETWORK || value === MEDIA_ERR_DECODE
}

/**
 * 第 attempt 次失败后该等多久。
 * @param {number} attempt 已经尝试过的次数（1 表示第一次失败）
 * @returns {number|null} null = 不再自动重试，交给用户手动重试
 */
export function nextRetryDelay(attempt) {
  const index = Number(attempt) - 1
  if (!Number.isInteger(index) || index < 0) return null
  return AUTO_RETRY_DELAYS_MS[index] ?? null
}

/** 是否还该继续自动重试（没超过次数上限）。 */
export function shouldAutoRetry(attempts, code) {
  if (!isTransientAudioError(code)) return false
  return nextRetryDelay(Number(attempts) + 1) !== null
}
