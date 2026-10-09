function mediaRange(value) {
  if (value == null) return undefined
  if (typeof value !== 'string' || value.length > 80) throw new Error('Invalid range')
  const match = /^bytes=(\d*)-(\d*)$/.exec(value)
  if (!match || (!match[1] && !match[2])) throw new Error('Invalid range')
  const start = match[1] ? Number(match[1]) : undefined
  const end = match[2] ? Number(match[2]) : undefined
  if ([start, end].some((number) => number !== undefined && !Number.isSafeInteger(number)) ||
      (start === undefined && end === 0) || (start !== undefined && end !== undefined && start > end)) throw new Error('Invalid range')
  return value
}
function mediaContentType(value) {
  const type = String(value || '').split(';', 1)[0].trim().toLowerCase()
  // SVG is an active document, not an allowed cover format on our app origin.
  if (/^(?:audio|video)\/[a-z0-9.+-]+$/.test(type) || /^image\/(?:png|jpeg|gif|webp|avif|bmp)$/.test(type)) return type
  if (!type || type === 'application/octet-stream') return 'application/octet-stream'
  throw new Error('Unsupported media content type')
}
module.exports = { mediaRange, mediaContentType }
