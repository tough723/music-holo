const { randomUUID } = require('node:crypto')
const { sourceUrl, requestOptions } = require('./policy.cjs')
const { untilAborted } = require('./abort.cjs')
class SourceSessions {
  constructor({ confirm, request, deniedHosts = [], ttl = 600000 }) {
    this.confirm = confirm; this.request = request; this.deniedHosts = deniedHosts; this.ttl = ttl
    this.sessions = new Map(); this.active = 0
  }
  open(name) {
    if (this.sessions.size >= 8) throw new Error('桌面音源会话过多')
    const id = randomUUID()
    const session = { name: String(name || '自定义音源').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 80), approvals: new Map(), pending: new Map() }
    session.timer = setTimeout(() => this.close(id), this.ttl)
    session.timer.unref?.(); this.sessions.set(id, session)
    return id
  }
  close(id) {
    const session = this.sessions.get(id)
    if (!session) return
    clearTimeout(session.timer)
    for (const controller of session.pending.values()) controller.abort()
    for (const approval of session.approvals.values()) approval.controller.abort()
    this.sessions.delete(id)
  }
  closeAll() { for (const id of this.sessions.keys()) this.close(id) }
  cancel(id, requestId) { this.sessions.get(id)?.pending.get(requestId)?.abort() }
  async run(id, requestId, rawUrl, options) {
    const session = this.sessions.get(id)
    if (!session) throw new Error('桌面音源会话已结束')
    if (typeof requestId !== 'string' || requestId.length > 100 || session.pending.has(requestId)) throw new Error('请求 ID 无效或重复')
    if (this.active >= 4) throw new Error('桌面音源网络并发超过上限')
    const url = sourceUrl(rawUrl, this.deniedHosts)
    requestOptions(options) // Reject malformed requests before showing a permission dialog.
    if (!session.approvals.has(url.origin) && session.approvals.size >= 16) throw new Error('本次会话授权来源超过 16 个')
    const controller = new AbortController()
    session.pending.set(requestId, controller); this.active++
    let approval
    try {
      approval = session.approvals.get(url.origin)
      if (!approval) {
        approval = { controller: new AbortController(), waiters: 0, settled: false }
        approval.promise = Promise.resolve().then(() => {
          approval.controller.signal.throwIfAborted()
          return this.confirm(session.name, url, approval.controller.signal)
        }).finally(() => { approval.settled = true })
        session.approvals.set(url.origin, approval)
      }
      approval.waiters++
      if (!await untilAborted(approval.promise, controller.signal)) throw new Error('用户拒绝音源域名访问')
      controller.signal.throwIfAborted()
      return await untilAborted(this.request(url.href, options, { signal: controller.signal, deniedHosts: this.deniedHosts }), controller.signal)
    } finally {
      if (approval && --approval.waiters === 0 && !approval.settled) {
        approval.controller.abort()
        if (session.approvals.get(url.origin) === approval) session.approvals.delete(url.origin)
      }
      session.pending.delete(requestId); this.active--
    }
  }
}
module.exports = { SourceSessions }
