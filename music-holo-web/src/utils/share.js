/** 只为公开歌单构造当前站点的可分享地址；私密内容不产生分享 URL。 */
export function buildPublicPlaylistShareUrl(playlist, router, origin) {
  if (!playlist || Number(playlist.isPublic) !== 1 || playlist.id == null || !router?.resolve || !origin) {
    return null
  }

  const resolved = router.resolve({ name: 'PlaylistDetail', params: { id: playlist.id } })
  if (!resolved?.href) return null
  const url = new URL(resolved.href, origin)
  if (url.origin !== new URL(origin).origin) return null
  return url.href
}

/** 优先使用原生分享；取消分享不视为错误，其余情况回退到复制链接。 */
export async function shareOrCopy(data, environment = globalThis) {
  if (!data?.url) throw new TypeError('A share URL is required')

  const navigatorRef = environment.navigator
  if (typeof navigatorRef?.share === 'function') {
    try {
      await navigatorRef.share(data)
      return 'shared'
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled'
    }
  }

  if (environment.isSecureContext && typeof navigatorRef?.clipboard?.writeText === 'function') {
    try {
      await navigatorRef.clipboard.writeText(data.url)
      return 'copied'
    } catch {
      // 权限拒绝时尝试兼容旧版浏览器的选区复制。
    }
  }

  const documentRef = environment.document
  if (!documentRef?.body || typeof documentRef.createElement !== 'function') {
    throw new Error('Clipboard is unavailable')
  }

  const field = documentRef.createElement('textarea')
  field.value = data.url
  field.setAttribute('readonly', '')
  field.setAttribute('aria-hidden', 'true')
  field.style.position = 'fixed'
  field.style.top = '-1000px'
  field.style.opacity = '0'
  documentRef.body.appendChild(field)
  field.focus()
  field.select()

  let copied = false
  try {
    copied = typeof documentRef.execCommand === 'function' && documentRef.execCommand('copy')
  } finally {
    field.remove()
  }

  if (!copied) throw new Error('Clipboard copy failed')
  return 'copied'
}
