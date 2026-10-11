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
 * 是否是我们自己造成的“中止”（MEDIA_ERR_ABORTED）。
 *
 * 按 HTML 规范，code 1 表示取流过程被中止——换 src、调 load()、快速切歌都会触发它，
 * 它是我们自己的动作，不是故障。以前会把这种事件当成一次播放失败弹提示，
 * 于是网络慢一点、多切两首歌就会看到「《新歌》音频加载失败」这种假警报。
 * 真要是切完之后卡住不出声，由缓冲看门狗（连续 8 秒没进展）兜住。
 */
export function isAbortedError(code) {
  return Number(code) === MEDIA_ERR_ABORTED
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

/**
 * 缓冲卡死：播放意图在、进度却长时间不动，通常是连接断了但浏览器没报错。
 * 判定阈值（毫秒）：比一般的缓冲等待长一截，避免在弱网正常缓冲时误判。
 */
export const STALL_TIMEOUT_MS = 8000
/** 进度推进小于这个秒数视为“没动”。 */
export const STALL_MIN_PROGRESS_SECONDS = 0.05

/**
 * 是否该判定为卡死。
 * @param {{ stalledSince?: number, now?: number, timeoutMs?: number }} options
 */
export function isPlaybackStalled({ stalledSince = 0, now = Date.now(), timeoutMs = STALL_TIMEOUT_MS } = {}) {
  const since = Number(stalledSince)
  const current = Number(now)
  if (!Number.isFinite(since) || since <= 0 || !Number.isFinite(current)) return false
  const timeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : STALL_TIMEOUT_MS
  return current - since >= timeout
}

/** 进度是否有实质推进。 */
export function hasProgress(previousTime, currentTime) {
  const previous = Number(previousTime)
  const current = Number(currentTime)
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return false
  return Math.abs(current - previous) > STALL_MIN_PROGRESS_SECONDS
}

/** 是否还该继续自动重试（没超过次数上限）。 */
export function shouldAutoRetry(attempts, code) {
  if (!isTransientAudioError(code)) return false
  return nextRetryDelay(Number(attempts) + 1) !== null
}
