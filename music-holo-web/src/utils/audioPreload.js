/**
 * 下一首的元数据预取（纯策略部分，便于单测）。
 *
 * 只在「下一首是确定的」并且「不碍事」的时候做：
 *   - 顺序播放 / 列表循环才预取；单曲循环下一首还是自己，随机类模式根本猜不到下一首。
 *   - 系统开了省流量（Save-Data）或网络是 2G 一类：不预取。
 *   - 本地 blob / 已缓存的演示副本：已经在本地，预取没有意义。
 *   - 自定义源的一次性签名地址：预取可能白耗一次签名，不预取。
 *
 * 预取用游离的媒体元素（preload=metadata），不占用播放器那两个正在用的元素，
 * 也不会和交叉淡入抢资源。
 */

/** 下一首确定的播放模式。 */
export const DETERMINISTIC_NEXT_MODES = Object.freeze(['order', 'loop'])
/** 省流量或极慢网络下不预取。 */
export const METERED_EFFECTIVE_TYPES = Object.freeze(['slow-2g', '2g'])

/** 顺序/列表循环下“下一首”的下标；列表循环会绕回队首，其他模式返回 -1。 */
export function nextPreloadIndex(queue, currentIndex, mode) {
  const list = Array.isArray(queue) ? queue : []
  if (list.length < 2) return -1
  const index = Number(currentIndex)
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return -1
  if (!DETERMINISTIC_NEXT_MODES.includes(mode)) return -1
  return (index + 1) % list.length
}

/**
 * 是否该预取下一首。
 * @param {object} options
 * @returns {boolean}
 */
export function shouldPreloadNext(options = {}) {
  const {
    hasNext = false,
    isRemote = false,
    isLocal = false,
    isCustomSource = false,
    saveData = false,
    effectiveType = ''
  } = options
  if (!hasNext || !isRemote) return false
  if (isLocal || isCustomSource) return false
  if (saveData === true) return false
  if (METERED_EFFECTIVE_TYPES.includes(String(effectiveType || '').toLowerCase())) return false
  return true
}
