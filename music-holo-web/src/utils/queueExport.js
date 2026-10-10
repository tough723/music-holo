/**
 * 队列导出的纯格式化部分（便于单测）。
 *
 * 队列里混着两类地址：曲库的 http(s) 地址可以写进文件下次还能用，
 * 本地 blob 与自定义源的一次性签名地址只在本次浏览器会话有效，写进去只会得到一个打不开的文件，
 * 所以 m3u8 里直接跳过，并把跳过了几首如实告诉用户。
 */

function isExportableUrl(url) {
  if (typeof url !== 'string' || !url) return false
  if (url.startsWith('blob:') || url.startsWith('data:')) return false
  try {
    const parsed = new URL(url, 'https://example.invalid')
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function title(song) {
  return String(song?.title || song?.name || '').trim()
}

function artist(song) {
  return String(song?.artist || song?.singerName || '').trim()
}

/** 队列的人读文本：一行一首，「序号. 标题 — 歌手」。 */
export function formatQueueAsText(queue) {
  const list = (Array.isArray(queue) ? queue : []).filter(Boolean)
  const lines = []
  let index = 0
  for (const song of list) {
    index += 1
    const name = title(song) || '未命名'
    lines.push(artist(song) ? `${index}. ${name} — ${artist(song)}` : `${index}. ${name}`)
  }
  return lines.join('\n')
}

/**
 * 队列的 m3u8 文本。
 * @returns {{ content: string, exported: number, skipped: number }}
 */
export function formatQueueAsM3u(queue) {
  const list = (Array.isArray(queue) ? queue : []).filter(Boolean)
  const lines = ['#EXTM3U']
  let exported = 0
  let skipped = 0
  for (const song of list) {
    if (song?.isLocal || song?.isCustomSource || !isExportableUrl(song?.audioUrl)) {
      skipped += 1
      continue
    }
    const seconds = Math.max(0, Math.round(Number(song.duration) || 0))
    lines.push(`#EXTINF:${seconds},${artist(song) ? `${artist(song)} - ` : ''}${title(song)}`)
    lines.push(song.audioUrl)
    exported += 1
  }
  return { content: `${lines.join('\n')}\n`, exported, skipped }
}

/** 导出文件名：带日期时间，多次导出不互相覆盖。 */
export function queueExportFileName(now = new Date()) {
  const date = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
  return `music-holo-队列-${stamp}.m3u8`
}
