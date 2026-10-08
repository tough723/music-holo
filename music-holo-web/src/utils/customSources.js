export const CUSTOM_SOURCE_STORAGE_KEY = 'mh_custom_sources_v1'
export const MAX_CUSTOM_SOURCE_BYTES = 128 * 1024
export const MAX_CUSTOM_SOURCES = 24

const ALLOWED_EXTENSIONS = new Set(['.js', '.mjs'])
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.lan']

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength
}

export function parseCustomSourceUrl(rawUrl) {
  let url
  try {
    url = new URL(String(rawUrl || '').trim())
  } catch {
    throw new Error('请输入有效的 HTTPS 音源地址')
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const isIpv4Literal = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)
  const isIpv6Literal = host.includes(':')
  if (url.protocol !== 'https:' || url.username || url.password || isIpv4Literal || isIpv6Literal ||
      host === 'localhost' || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new Error('仅允许无账号信息的公网 HTTPS 地址；本地与内网地址会被拦截')
  }
  return url
}

export function sourceFileNameFromUrl(url) {
  const pathName = url instanceof URL ? url.pathname : new URL(url).pathname
  let fileName = pathName.split('/').filter(Boolean).at(-1) || 'custom-source.js'
  try { fileName = decodeURIComponent(fileName) } catch { /* Keep the encoded segment. */ }
  if (!/\.(?:m?js)$/i.test(fileName)) fileName += '.js'
  return fileName
}

function extractTag(header, tag) {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = header.match(new RegExp(`(?:^|\\n)\\s*(?:\\*\\s*)?@${escapedTag}\\s+([^\\r\\n*]+)`))
  return match?.[1]?.trim() || ''
}

function fingerprint(script) {
  // FNV-1a is used only for duplicate detection, not as a security signature.
  let hash = 0x811c9dc5
  for (let index = 0; index < script.length; index += 1) {
    hash ^= script.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${(hash >>> 0).toString(16).padStart(8, '0')}-${script.length}`
}

export function parseCustomSourceFile(fileName, script, importedAt = new Date().toISOString()) {
  const cleanFileName = String(fileName || '').trim().split(/[\\/]/).pop()
  const extension = cleanFileName.match(/\.[^.]+$/)?.[0]?.toLowerCase() || ''
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error('仅支持导入 .js 或 .mjs 音源文件')
  }
  if (typeof script !== 'string' || !script.trim()) {
    throw new Error('音源文件为空或无法读取')
  }
  const sizeBytes = byteLength(script)
  if (sizeBytes > MAX_CUSTOM_SOURCE_BYTES) {
    throw new Error('单个音源文件不能超过 128 KB')
  }

  const header = script.slice(0, 8192)
  const fallbackName = cleanFileName.replace(/\.[^.]+$/, '') || '未命名音源'
  const name = extractTag(header, 'name') || fallbackName
  const version = extractTag(header, 'version') || '未标注'
  const description = extractTag(header, 'description')
  const hash = fingerprint(script)

  return {
    id: `source-${hash}`,
    hash,
    fileName: cleanFileName.slice(0, 120),
    name: name.slice(0, 80),
    version: version.slice(0, 40),
    description: description.slice(0, 180),
    sizeBytes,
    importedAt,
    script
  }
}

function isStoredSource(source) {
  return source && typeof source === 'object' &&
    typeof source.id === 'string' && typeof source.fileName === 'string' &&
    typeof source.name === 'string' && typeof source.script === 'string' &&
    byteLength(source.script) <= MAX_CUSTOM_SOURCE_BYTES
}

export function readCustomSources(storage = globalThis.localStorage, key = CUSTOM_SOURCE_STORAGE_KEY) {
  try {
    const raw = storage?.getItem(key)
    if (!raw) return []
    const sources = JSON.parse(raw)
    if (!Array.isArray(sources)) return []
    return sources.filter(isStoredSource).slice(0, MAX_CUSTOM_SOURCES)
  } catch {
    return []
  }
}

export function writeCustomSources(sources, storage = globalThis.localStorage, key = CUSTOM_SOURCE_STORAGE_KEY) {
  if (!Array.isArray(sources) || sources.length > MAX_CUSTOM_SOURCES || !sources.every(isStoredSource)) {
    return false
  }
  try {
    storage?.setItem(key, JSON.stringify(sources))
    return !!storage
  } catch {
    return false
  }
}

export function formatSourceSize(sizeBytes) {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) return '未知大小'
  if (sizeBytes < 1024) return `${sizeBytes} B`
  return `${(sizeBytes / 1024).toFixed(1)} KB`
}
