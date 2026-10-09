import { parseCustomSourceUrl } from './customSources'

export function desktopSourceBridge() {
  return globalThis.musicHoloDesktop?.version ? globalThis.musicHoloDesktop : null
}

export function parseSourceNetworkUrl(value) {
  if (!desktopSourceBridge()) return parseCustomSourceUrl(value)
  const url = new URL(String(value || ''))
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('音源仅允许 HTTP(S) 地址')
  // Reuse host/credential validation; main process also resolves and pins public IPs.
  const check = new URL(url.href)
  check.protocol = 'https:'
  parseCustomSourceUrl(check.href)
  return url
}

export function createDesktopSourceRequestBridge(source) {
  const native = desktopSourceBridge()
  let sessionPromise, disposed = false
  const run = async (url, options, signal) => {
    if (disposed || signal?.aborted) throw new Error('桌面音源会话已取消')
    sessionPromise ||= native.openSourceSession(source?.name || '自定义音源')
    const id = await sessionPromise
    if (disposed || signal?.aborted) throw new Error('桌面音源会话已取消')
    const requestId = globalThis.crypto.randomUUID()
    const cancel = () => { native.cancel(id, requestId).catch(() => {}) }
    signal?.addEventListener('abort', cancel, { once: true })
    try {
      const response = await native.request(id, requestId, url, options || {})
      if (signal?.aborted || disposed) throw new Error('桌面音源会话已取消')
      return response
    } finally { signal?.removeEventListener('abort', cancel) }
  }
  run.dispose = () => {
    disposed = true
    sessionPromise?.then((id) => native.closeSourceSession(id)).catch(() => {})
  }
  return run
}

export async function desktopMediaUrl(url) {
  return desktopSourceBridge() ? desktopSourceBridge().media(url) : url
}
