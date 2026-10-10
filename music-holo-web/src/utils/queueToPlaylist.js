/**
 * 「把当前队列存为歌单」的纯逻辑部分，便于单测。
 *
 * 队列里既可能有曲库里的歌，也可能有本地文件和自定义源的一次性地址；
 * 后者本来就不属于服务端曲库，存歌单时只能跳过——这里负责把它们分开并说清楚。
 */

/** 队列里能进歌单的歌曲：有曲库 id，且不是本地文件或自定义源。 */
export function isQueueSongSavable(song) {
  if (!song || song.isLocal || song.isCustomSource) return false
  const id = Number(song.id)
  return Number.isInteger(id) && id > 0
}

/**
 * 把队列拆成「可以存进歌单的 id 列表」和「被跳过的条目」。
 * 同一个 id 只保留一次，顺序与队列一致。
 * @param {Array} queue
 * @returns {{ ids: number[], skipped: Array, savableCount: number }}
 */
export function partitionQueueForPlaylist(queue) {
  const list = Array.isArray(queue) ? queue : []
  const ids = []
  const skipped = []
  const seen = new Set()
  for (const song of list) {
    if (!isQueueSongSavable(song)) {
      if (song) skipped.push(song)
      continue
    }
    const id = Number(song.id)
    if (seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return { ids, skipped, savableCount: ids.length }
}

/** 默认歌单名：带日期时间，多次保存不会重名。 */
export function suggestQueuePlaylistName(queue, now = new Date()) {
  const count = Array.isArray(queue) ? queue.length : 0
  const date = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const stamp = `${pad(date.getMonth() + 1)}${pad(date.getDate())} ${pad(date.getHours())}${pad(date.getMinutes())}`
  return `我的队列 · ${stamp}${count ? `（${count}首）` : ''}`
}

/**
 * 保存结果的人话说明（服务端会跳过它不认识的 id，这里如实报数）。
 * @param {{ name?: string, requested?: number, added?: number, skippedCount?: number }} result
 * @returns {{ type: 'success'|'warning'|'error', text: string }}
 */
export function describeQueueSaveResult(result = {}) {
  const { name = '', requested = 0, added = 0, skippedCount = 0, action = '存入' } = result
  const addedCount = Number.isFinite(Number(added)) ? Number(added) : 0
  if (addedCount <= 0) {
    return {
      type: 'warning',
      text: `歌单《${name}》已创建，但服务端曲库里没有这些歌曲，一首都没存进去`
    }
  }
  const missing = Math.max(0, Number(requested) - addedCount)
  const parts = [`已${action}歌单《${name}》${addedCount} 首`]
  if (missing > 0) parts.push(`另有 ${missing} 首服务端未收录`)
  if (skippedCount > 0) parts.push(`${skippedCount} 首本地/自定义源歌曲不上传`)
  return { type: missing > 0 ? 'warning' : 'success', text: parts.join('，') }
}
