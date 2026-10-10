const { randomBytes } = require('node:crypto')
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
/**
 * 构造 multipart/form-data 请求体。字段名必须是不含 CR/LF/引号的简单文本，
 * 避免脚本通过字段名注入额外请求头或分部；值一律按 UTF-8 文本发送。
 */
function buildMultipartBody(rawForm) {
  if (!rawForm || typeof rawForm !== 'object' || Array.isArray(rawForm)) throw new Error('formData 格式无效')
  const entries = Object.entries(rawForm)
  if (entries.length > 32) throw new Error('formData 字段过多')
  const boundary = `----MusicHoloFormBoundary${randomBytes(16).toString('hex')}`
  const parts = []
  for (const [name, value] of entries) {
    const field = String(name)
    if (!field || !/^[\w.$[\]-]{1,128}$/.test(field)) throw new Error('formData 字段名无效')
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"\r\n\r\n${String(value)}\r\n`, 'utf8'))
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'))
  return { buffer: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` }
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
    if (raw.formData) {
      body = buildMultipartBody(raw.formData)
      headers['content-type'] = body.contentType
      body = body.buffer
    } else if (raw.form) {
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
