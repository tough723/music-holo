/**
 * 在线曲目队列引用：保留平台/音源身份，临时音频地址只做短期运行时缓存。
 */
export function createOnlineQueueReference(track, resolved = {}) {
  const musicInfo = { ...(track?.musicInfo || {}) }
  const platform = String(track?.platform || musicInfo.platform || '').trim()
  const platformTrackId = String(
    musicInfo.id || musicInfo.songmid || musicInfo.hash || musicInfo.rid || ''
  ).trim()
  return {
    platform,
    platformTrackId,
    musicInfo,
    sourceId: String(resolved.sourceId || resolved.sourceName || '').trim(),
    resolvedAt: Number(resolved.resolvedAt) || Date.now(),
    audioUrl: String(resolved.audioUrl || '').trim(),
    audioExpiresAt: Number(resolved.audioExpiresAt) || 0
  }
}

export function isOnlineQueueReferenceExpired(reference, now = Date.now()) {
  const expiresAt = Number(reference?.audioExpiresAt)
  return Boolean(expiresAt && expiresAt <= now)
}
