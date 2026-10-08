/** 格式化工具 */

/** 秒 -> mm:ss */
export function fmtDuration(seconds) {
  if (!seconds || seconds < 0) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** 数字 -> 万字缩写（12580 -> 1.3万） */
export function fmtCount(num) {
  if (num == null) return '0'
  if (num < 10000) return String(num)
  return (num / 10000).toFixed(1) + '万'
}

/** 日期时间格式化 */
export function fmtDateTime(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 文本 hash -> 稳定下标（用于生成渐变封面的颜色） */
export function hashCode(text) {
  let hash = 0
  const str = String(text || '')
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}
