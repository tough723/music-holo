// music-holo:// 启动参数：支持 play / search / import / lyrics 四类意图。
// 解析结果只作为导航意图交给主窗口，绝不据此自动播放第三方媒体或加载外部脚本。
const SCHEME = 'music-holo'
const ALLOWED_ACTIONS = new Set(['play', 'search', 'import', 'lyrics', 'open'])

/** 解析 music-holo://action?params 为 { action, params }；无法识别返回 null。 */
function parseDeepLink(rawUrl) {
  let url
  try {
    url = new URL(String(rawUrl || ''))
  } catch {
    return null
  }
  if (url.protocol !== `${SCHEME}:`) return null
  const action = String(url.hostname || '').toLowerCase().replace(/^www\./, '')
  if (!ALLOWED_ACTIONS.has(action)) return null
  const params = {}
  for (const [key, value] of url.searchParams.entries()) {
    if (params[key] != null) continue
    params[key] = String(value).slice(0, 512)
  }
  return { action, params }
}

function registerProtocol(app, { onLink }) {
  let pending = null
  const deliver = (target) => {
    const parsed = parseDeepLink(target)
    if (!parsed) return false
    // 冷启动时窗口尚未就绪，先缓存最后一条意图。
    if (!onLink(parsed)) {
      pending = parsed
      return true
    }
    return true
  }
  if (process.defaultApp && process.argv.length >= 2) {
    // 开发环境：node main.cjs music-holo://...
    for (const argument of process.argv.slice(2)) deliver(argument)
  }
  const registered = app.setAsDefaultProtocolClient?.(SCHEME) ?? false
  app.on('second-instance', (_event, argv) => {
    for (const argument of argv) deliver(argument)
  })
  app.on('open-url', (_event, url) => deliver(url))
  return {
    registered,
    /** 窗口就绪后取走冷启动期间缓存的意图。 */
    takePending() {
      const value = pending
      pending = null
      return value
    },
    deliver
  }
}

module.exports = { parseDeepLink, registerProtocol, SCHEME, ALLOWED_ACTIONS }
