/**
 * 播放模式的选曲策略（与“不喜欢”规则配合）。
 * 全部是纯函数：随机源可注入，便于单测；队列变更用歌曲 id 而不是下标来记忆。
 */

/** 从候选里挑一个不被“不喜欢”规则跳过的下标。 */
function eligibleIndices(queue, currentIndex, rules, isSkipped) {
  const list = []
  for (let i = 0; i < queue.length; i++) {
    if (i === currentIndex) continue
    if (isSkipped(queue[i], rules)) continue
    list.push(i)
  }
  return list
}

/** 加权随机：权重越大越容易被抽到；全 0 时退化为等概率。 */
export function pickWeightedIndex(weights, random = Math.random) {
  const list = Array.isArray(weights) ? weights : []
  if (list.length === 0) return -1
  const positive = list.map((value) => {
    const number = Number(value)
    return Number.isFinite(number) && number > 0 ? number : 0
  })
  const total = positive.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return Math.min(list.length - 1, Math.max(0, Math.floor(random() * list.length)))
  let cursor = random() * total
  for (let i = 0; i < positive.length; i++) {
    cursor -= positive[i]
    if (cursor <= 0) return i
  }
  return positive.length - 1
}

/**
 * 不重复随机（shuffle bag）：一轮内每首只出现一次，抽完自动重洗。
 * @param {Array} bag 上一轮剩下的歌曲 id
 * @returns {{ index: number, bag: string[] }}
 */
export function nextShuffleIndex({ queue, currentIndex, bag = [], rules, isSkipped, random = Math.random }) {
  const queueList = Array.isArray(queue) ? queue : []
  if (queueList.length === 0) return { index: null, bag: [] }
  const idsOf = (indices) => indices.map((index) => queueList[index]?.id)
  const alive = (list) => list.filter((id) => queueList.some((song) => song?.id === id))

  let remaining = alive(Array.isArray(bag) ? bag : [])
  // 当前曲目如果在剩余列表里，说明上一轮没走完，直接接着抽。
  const currentId = queueList[currentIndex]?.id
  const currentStillPending = remaining.includes(currentId)
  if (!currentStillPending) remaining = remaining.filter((id) => id !== currentId)
  if (remaining.length === 0) {
    const pool = idsOf(eligibleIndices(queueList, currentIndex, rules, isSkipped))
      .filter((id) => id !== undefined && id !== null)
    remaining = shuffleList(pool, random)
  }
  if (remaining.length === 0) return { index: null, bag: [] }

  const pick = Math.min(remaining.length - 1, Math.max(0, Math.floor(random() * remaining.length)))
  const pickedId = remaining[pick]
  const nextBag = remaining.filter((_, i) => i !== pick)
  const index = queueList.findIndex((song) => song?.id === pickedId)
  if (index < 0) return { index: null, bag: nextBag }
  return { index, bag: nextBag }
}

/**
 * 心动模式：按权重挑选（收藏与常听优先）。
 * @param {Array<{index:number, weight:number}>} entries
 */
export function nextHeartIndex({ entries = [], random = Math.random } = {}) {
  const list = entries.filter((entry) => Number.isInteger(entry?.index))
  if (list.length === 0) return null
  const position = pickWeightedIndex(list.map((entry) => entry.weight), random)
  if (position < 0) return null
  return list[position].index
}

export function shuffleList(list, random = Math.random) {
  const copy = (Array.isArray(list) ? list : []).slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** 心动模式权重：收藏 +3，常听最多 +3，完整播放 +0.5，被跳过 -0.5，保底 0.2。 */
export function heartWeight({ isFavorite = false, stats = null } = {}) {
  const count = Math.max(0, Number(stats?.count) || 0)
  const completed = Math.max(0, Number(stats?.completed) || 0)
  const skipped = Math.max(0, Number(stats?.skipped) || 0)
  const weight = 1 +
    (isFavorite ? 3 : 0) +
    Math.min(3, count * 0.3) +
    Math.min(1, completed * 0.2) -
    Math.min(1.5, skipped * 0.3)
  return Math.max(0.2, Math.round(weight * 100) / 100)
}

/**
 * 播放失败后「跳到下一首」的兜底下标。
 *
 * next() 会按模式与不喜欢规则选曲，单曲循环或顺序播放到队尾时它不前进；
 * 用户明确点了「跳到下一首」时，卡在一首坏掉的歌上更糟，所以这里按位置强行往后挪。
 * 顺序模式到队尾就是真的没有下一首（-1），其余模式绕回队首。
 *
 * @param {{ queueLength?: number, currentIndex?: number, mode?: string }} options
 * @returns {number} 下一首下标，没有则返回 -1
 */
export function nextIndexAfterFailure(options = {}) {
  const { queueLength = 0, currentIndex = -1, mode = 'order' } = options
  const length = Number(queueLength)
  const index = Number(currentIndex)
  if (!Number.isInteger(length) || length <= 1) return -1
  if (!Number.isInteger(index) || index < 0 || index >= length) return -1
  if (mode === 'order' && index >= length - 1) return -1
  return (index + 1) % length
}
