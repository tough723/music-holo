/** 比较曲库 id，兼容数字与字符串，不把本地临时 id 当成曲库歌曲。 */
export function sameId(left, right) {
  return left != null && right != null && String(left) === String(right)
}

/**
 * 自动切歌是否应跳过该曲目。本地文件不参与账号规则；
 * 自定义源若仍携带曲库歌曲或歌手 id，则按同一身份跳过。
 */
export function isSkippedByDislike(song, rules) {
  if (!song || song.isLocal) return false
  const songIds = rules?.songIds || []
  const singerIds = rules?.singerIds || []
  if (songIds.some((id) => sameId(id, song.id))) return true
  return song.singerId != null && singerIds.some((id) => sameId(id, song.singerId))
}

/**
 * 从当前下标按方向寻找下一首可自动播放的曲目。
 * 随机模式忽略方向，只在非当前且未屏蔽的曲目中选择。
 * 找不到时 index 为 null，skippedCount 记录沿途跳过的屏蔽曲目。
 */
export function findAdvanceIndex(queue, currentIndex, direction, mode, rules, random = Math.random) {
  const length = Array.isArray(queue) ? queue.length : 0
  if (length === 0) return { index: null, skippedCount: 0 }
  const step = direction < 0 ? -1 : 1
  if (mode === 'random') {
    const eligible = []
    for (let i = 0; i < length; i++) {
      if (i === currentIndex) continue
      if (!isSkippedByDislike(queue[i], rules)) eligible.push(i)
    }
    if (eligible.length === 0) return { index: null, skippedCount: Math.max(0, length - (currentIndex >= 0 && currentIndex < length ? 1 : 0)) }
    const pick = Math.min(eligible.length - 1, Math.max(0, Math.floor(random() * eligible.length)))
    return { index: eligible[pick], skippedCount: 0 }
  }

  const start = Number.isInteger(currentIndex) ? currentIndex : (step > 0 ? -1 : length)
  let skippedCount = 0
  for (let offset = 1; offset <= length; offset++) {
    let index = start + step * offset
    if (mode === 'loop') {
      index = ((index % length) + length) % length
    } else if (index < 0 || index >= length) {
      return { index: null, skippedCount }
    }
    if (index === currentIndex) return { index: null, skippedCount }
    if (isSkippedByDislike(queue[index], rules)) {
      skippedCount += 1
      continue
    }
    return { index, skippedCount }
  }
  return { index: null, skippedCount }
}
