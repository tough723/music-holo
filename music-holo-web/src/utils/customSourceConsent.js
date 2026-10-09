import { ElMessageBox } from 'element-plus'
import { parseCustomSourceUrl } from './customSources'
import { performCustomSourceRequest } from './customSourceRuntime'

export function confirmCustomSourceNetworkRequest({ sourceName, method, target }) {
  return ElMessageBox.confirm(
    `「${String(sourceName || '自定义音源').slice(0, 80)}」请求 ${method} ${target.origin}${target.pathname}。请求不携带 Cookie 或登录态，不绕过浏览器 CORS；该来源仅在本次运行期间允许。`,
    '确认音源网络请求',
    { type: 'warning', confirmButtonText: '仅本次允许', cancelButtonText: '拒绝请求', closeOnClickModal: false }
  )
}

/**
 * Create an origin-consent bridge scoped to one disposable custom-source session.
 * The returned bridge never persists approvals and still delegates requests to
 * the CORS-only, credential-free runtime transport.
 */
export function createCustomSourceRequestBridge(source, {
  confirmRequest = confirmCustomSourceNetworkRequest,
  request = performCustomSourceRequest
} = {}) {
  const approvedOrigins = new Set()
  const sourceName = String(source?.name || '自定义音源').slice(0, 80)

  return async (rawUrl, options, signal) => {
    const target = parseCustomSourceUrl(rawUrl)
    if (signal?.aborted) throw new Error('网络请求已取消')

    if (!approvedOrigins.has(target.origin)) {
      const method = String(options?.method || 'GET').toUpperCase()
      await confirmRequest({ sourceName, method, target, signal })
      if (signal?.aborted) throw new Error('网络请求已取消')
      approvedOrigins.add(target.origin)
    }

    return request(target.href, options, { signal })
  }
}
