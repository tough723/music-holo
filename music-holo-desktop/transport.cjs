const http = require('node:http')
const https = require('node:https')
const { promisify } = require('node:util')
const zlib = require('node:zlib')
const { untilAborted } = require('./abort.cjs')
const MAX_RESPONSE_BYTES = 512 * 1024
const decoders = { gzip: promisify(zlib.gunzip), deflate: promisify(zlib.inflate), br: promisify(zlib.brotliDecompress) }
const { sourceUrl, resolvePublic, requestOptions } = require('./policy.cjs')

async function openPublicResponse(rawUrl, rawOptions = {}, { signal, deniedHosts = [], lookup } = {}) {
  const url = sourceUrl(rawUrl, deniedHosts)
  const options = requestOptions(rawOptions)
  signal?.throwIfAborted()
  const address = await untilAborted(resolvePublic(url, lookup), signal)
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const req = (url.protocol === 'https:' ? https : http).request(url, {
      method: options.method, headers: options.headers, signal,
      agent: false, // No shared cookies, cache, proxy or pooled connection.
      lookup: (_host, opts, cb) => opts.all ? cb(null, [{ address, family: 4 }]) : cb(null, address, 4),
    }, (response) => {
      // Never follow a redirect to an unapproved origin or private address.
      if (response.statusCode >= 300 && response.statusCode < 400) {
        response.destroy(); reject(new Error('音源重定向已拒绝，请提供最终地址')); return
      }
      resolve(response)
    })
    req.on('error', reject)
    req.setTimeout(options.timeout, () => req.destroy(new Error('音源连接超时')))
    if (options.body) req.write(options.body)
    req.end()
  })
}
async function sourceRequest(url, options, config = {}) {
  // Wall-clock limit includes DNS and slow responses, not just socket inactivity.
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (config.signal?.aborted) controller.abort()
  else config.signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, Math.max(500, Math.min(15000, Number(options?.timeout) || 10000)))
  try {
    const response = await openPublicResponse(url, options, { ...config, signal: controller.signal })
    const chunks = []
    let bytes = 0
    for await (const chunk of response) {
      bytes += chunk.length
      if (bytes > MAX_RESPONSE_BYTES) { response.destroy(); throw new Error('音源响应超过 512 KB') }
      chunks.push(chunk)
    }
    const headers = Object.fromEntries(Object.entries(response.headers).filter(([key]) => !['set-cookie', 'set-cookie2'].includes(key)))
    let buffer = Buffer.concat(chunks)
    const encoding = String(headers['content-encoding'] || 'identity').trim().toLowerCase()
    // Body-less responses can legitimately advertise the resource's encoding.
    if (String(options?.method).toUpperCase() !== 'HEAD' && ![204, 205, 304].includes(response.statusCode) && encoding !== 'identity') {
      if (!Object.hasOwn(decoders, encoding)) throw new Error('音源响应使用不支持的压缩编码')
      try {
        buffer = await untilAborted(decoders[encoding](buffer, { maxOutputLength: MAX_RESPONSE_BYTES }), controller.signal)
      } catch {
        controller.signal.throwIfAborted()
        throw new Error('音源压缩响应损坏或解压后超过 512 KB')
      }
      delete headers['content-encoding']
      headers['content-length'] = String(buffer.length)
    }
    controller.signal.throwIfAborted()
    // Keep transport raw: importing a .js file must never parse/evaluate it.
    // LX-specific JSON parsing belongs in the worker's callback adapter.
    return { statusCode: response.statusCode, headers, body: buffer.toString('utf8') }
  } finally { clearTimeout(timer); config.signal?.removeEventListener('abort', abort) }
}
module.exports = { openPublicResponse, sourceRequest }
