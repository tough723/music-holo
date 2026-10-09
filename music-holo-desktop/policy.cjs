const dns = require('node:dns/promises')
const ipaddr = require('ipaddr.js')
const BLOCKED_HEADERS = /^(?:authorization|proxy-authorization|cookie2?|host|origin|referer|connection|content-length|transfer-encoding|upgrade|te|trailer|expect|accept-encoding|music-holo-token|sec-.*|proxy-.*)$/i
const BLOCKED_SUFFIX = /(?:^|\.)(?:localhost|local|internal|lan|test|home\.arpa|nip\.io|sslip\.io|xip\.io|localtest\.me|lvh\.me)$/i
function sourceUrl(value, deniedHosts = []) {
  if (typeof value !== 'string' || value.length > 4096) throw new Error('音源地址无效或过长')
  const url = new URL(value)
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      !host.includes('.') || BLOCKED_SUFFIX.test(host) || deniedHosts.includes(host) ||
      ipaddr.isValid(host.replace(/^\[|\]$/g, '')) || (url.port && !['80', '443'].includes(url.port))) {
    throw new Error('音源仅允许公网 HTTP(S) 标准端口，禁止内网、IP 直连、凭据和业务后端')
  }
  url.hash = ''
  return url
}
function isPublicAddress(address) {
  try { return ipaddr.parse(address).kind() === 'ipv4' && ipaddr.parse(address).range() === 'unicast' } catch { return false }
}
async function resolvePublic(url, lookup = dns.lookup) {
  // IPv4-only deliberately fails closed for IPv6-only hosts. Pin the validated IP
  // in the socket lookup so a second DNS answer cannot rebind to a private address.
  const answers = await lookup(url.hostname, { family: 4, all: true, verbatim: true })
  if (!answers.length || answers.some(({ address }) => !isPublicAddress(address))) throw new Error('音源 DNS 指向非公网地址')
  return answers[0].address
}
function requestOptions(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('请求选项无效')
  const method = String(raw.method || 'GET').toUpperCase()
  if (!['GET', 'POST', 'HEAD'].includes(method)) throw new Error('仅支持 GET、POST、HEAD')
  const entries = Object.entries(raw.headers || {})
  if (entries.length > 32) throw new Error('请求头过多')
  const headers = {}
  for (const [name, value] of entries) {
    const text = String(value)
    if (!/^[!#$%&'*+.^_`|~\w-]+$/.test(name) || name.length > 128 || text.length > 2048 || /[\r\n\0]/.test(text)) throw new Error('请求头无效')
    if (!BLOCKED_HEADERS.test(name)) headers[name.toLowerCase()] = text
  }
  headers['accept-encoding'] = 'identity'
  let body
  if (method === 'POST') {
    if (raw.formData) throw new Error('桌面桥暂不支持 multipart formData；请使用 form 或 body')
    if (raw.form) {
      body = Buffer.from(new URLSearchParams(raw.form).toString())
      headers['content-type'] = 'application/x-www-form-urlencoded;charset=UTF-8'
    } else if (raw.body != null) {
      if (typeof raw.body === 'string') body = Buffer.from(raw.body)
      else if (ArrayBuffer.isView(raw.body)) body = Buffer.from(raw.body.buffer, raw.body.byteOffset, raw.body.byteLength)
      else if (raw.body instanceof ArrayBuffer) body = Buffer.from(raw.body)
      else { body = Buffer.from(JSON.stringify(raw.body)); headers['content-type'] = 'application/json' }
    }
  }
  if (body?.length > 64 * 1024) throw new Error('音源请求体超过 64 KB')
  return { method, headers, body, timeout: Math.max(500, Math.min(15000, Number(raw.timeout) || 10000)) }
}
module.exports = { sourceUrl, isPublicAddress, resolvePublic, requestOptions }
