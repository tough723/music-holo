import { createDesktopSourceRequestBridge, desktopSourceBridge } from '../desktopSource'
import { performCustomSourceRequest } from '../customSourceRuntime'
import { parseLooseJson } from './looseJson'

/**
 * 平台适配器的网络入口。桌面走受控桌面桥（逐域名原生授权、DNS 校验、无凭据），
 * 网页走隔离请求（HTTPS、CORS、无 Cookie）。适配器不携带任何密钥或登录凭据。
 */
export function createCatalogRequest({ name = '平台曲目检索（无凭据）' } = {}) {
  const desktop = desktopSourceBridge()
  if (desktop) {
    const bridge = createDesktopSourceRequestBridge({ name })
    const run = (url, options, signal) => bridge(url, options, signal)
    run.dispose = () => bridge.dispose?.()
    return run
  }
  return (url, options, signal) => performCustomSourceRequest(url, options, { signal })
}

export async function requestJson(request, url, { headers, method, signal, loose = false, timeout = 10000 } = {}) {
  const response = await request(url, { method: method || 'GET', headers, timeout }, signal)
  if (!response || typeof response.statusCode !== 'number') throw new Error('平台接口无有效响应')
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`平台接口返回 HTTP ${response.statusCode}`)
  }
  const body = typeof response.body === 'string' ? response.body : String(response?.body ?? '')
  if (!body.trim()) throw new Error('平台接口返回了空响应')
  return loose ? parseLooseJson(body) : JSON.parse(body)
}

export function requestText(request, url, { headers, method, signal, timeout = 10000 } = {}) {
  return Promise.resolve(request(url, { method: method || 'GET', headers, timeout }, signal)).then((response) => {
    if (!response || typeof response.statusCode !== 'number') throw new Error('平台接口无有效响应')
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`平台接口返回 HTTP ${response.statusCode}`)
    }
    return typeof response.body === 'string' ? response.body : String(response?.body ?? '')
  })
}
