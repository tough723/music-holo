import { desktopSourceBridge, createDesktopSourceRequestBridge } from './desktopSource'
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
  if (desktopSourceBridge() && request === performCustomSourceRequest) return createDesktopSourceRequestBridge(source)
  const approvedOrigins = new Set()
  const pendingApprovals = new Map()
  let approvalQueue = Promise.resolve()
  const sourceName = String(source?.name || '自定义音源').slice(0, 80)

  const ensureOriginApproved = async (target, method, signal) => {
    if (signal?.aborted) throw new Error('网络请求已取消')
    if (approvedOrigins.has(target.origin)) return

    let approval = pendingApprovals.get(target.origin)
    if (!approval) {
      // 音源初始化可能并发请求 IP、版本信息等多个主机。Element Plus 的
      // MessageBox 是模态框，若并发各自弹确认框，后弹框会盖住先弹框，
      // 用户既无法逐个授权，自动化也无法点击被遮挡的按钮。域名确认按会话串行，
      // 同一域名的并发请求共享一个确认结果；网络请求本身仍可并发执行。
      approval = approvalQueue.then(async () => {
        if (signal?.aborted) throw new Error('网络请求已取消')
        if (approvedOrigins.has(target.origin)) return
        await confirmRequest({ sourceName, method, target, signal })
        if (signal?.aborted) throw new Error('网络请求已取消')
        approvedOrigins.add(target.origin)
      })
      pendingApprovals.set(target.origin, approval)
      // 拒绝当前域名不应卡住后续其他域名的授权队列。
      approvalQueue = approval.then(() => undefined, () => undefined)
    }

    try {
      await approval
    } finally {
      if (pendingApprovals.get(target.origin) === approval) {
        pendingApprovals.delete(target.origin)
      }
    }
    if (signal?.aborted) throw new Error('网络请求已取消')
  }

  return async (rawUrl, options, signal) => {
    const target = parseCustomSourceUrl(rawUrl)
    const method = String(options?.method || 'GET').toUpperCase()
    await ensureOriginApproved(target, method, signal)
    return request(target.href, options, { signal })
  }
}
