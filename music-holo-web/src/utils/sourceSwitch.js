// 「快速换源」：当前曲目播放失败或想换更高质量时，按顺序寻找仍然可用的播放地址。
//
// 候选来源（全部沿用既有安全边界：桌面逐域名授权、网页 HTTPS/CORS、无凭据）：
//   1. 已导入的自定义音源脚本（每个脚本 × 每个声明了 musicUrl 的平台 × 音质）；
//   2. 平台适配器的公开直链解析（目前 wy / kw，其余平台会明确报错而不是伪造地址）；
//   3. 曲目自身已有的 audioUrl（作为兜底与对照）。
//
// 每个候选解析出的地址都会经过媒体地址校验（公网、非同源、可执行协议检查），
// 可选再发一次 Range 探针确认真的能取到音频字节；失败原因如实回传，不做静默兜底。

import { getCatalogAdapter, resolvePlatformTrackUrl } from './sourceCatalog'
import {
  createCustomSourceSession,
  mergeCustomSourceMusicInfo,
  validateCustomSourceMediaUrl
} from './customSourceRuntime'
import { createDesktopSourceRequestBridge, desktopMediaUrl } from './desktopSource'
import { readCustomSources, customSourceStorageKeyForOwner } from './customSources'

export const SOURCE_CANDIDATE_KINDS = Object.freeze({
  CURRENT: 'current',
  CUSTOM_SOURCE: 'custom-source',
  PLATFORM: 'platform'
})

const AUDIO_CONTENT_HINT = /^(audio\/|application\/octet-stream|video\/mp4)/i

/** 读取本机已导入且已启用的自定义音源（不执行任何脚本）。 */
export function listSwitchableCustomSources(storage = globalThis.localStorage, owner = 'local') {
  if (!storage) return []
  try {
    const sources = readCustomSources(storage, customSourceStorageKeyForOwner(owner))
    return Array.isArray(sources) ? sources.filter((source) => source && !source.disabled && source.script) : []
  } catch {
    return []
  }
}

/** 展开一个曲目在所有自定义音源下的候选项（平台 × 音质）。 */
export function buildCustomSourceCandidates(sources, song, { extraFields = '{}', limit = 12 } = {}) {
  const candidates = []
  for (const source of sources) {
    for (const platform of source.capabilities?.sources || []) {
      if (!platform.actions?.includes('musicUrl')) continue
      const qualities = platform.key === 'local' ? [null] : (platform.qualities?.length ? platform.qualities : ['128k'])
      for (const quality of qualities) {
        candidates.push({
          kind: SOURCE_CANDIDATE_KINDS.CUSTOM_SOURCE,
          key: `${source.id}:${platform.key}:${quality || 'local'}`,
          label: `${source.name} · ${platform.name}${quality ? ` · ${quality}` : ''}`,
          sourceName: source.name,
          platformKey: platform.key,
          platformName: platform.name,
          quality: quality || '',
          source,
          extraFields
        })
        if (candidates.length >= limit) return candidates
      }
    }
  }
  return candidates
}

/** 展开平台适配器候选（按曲目已知的平台字段）。 */
export function buildPlatformCandidates(song, { platforms = ['wy', 'kw'], quality = '320k' } = {}) {
  const musicInfo = song?.musicInfo || song || {}
  const songPlatform = String(song?.sourcePlatformKey || song?.platform || '').trim()
  const ordered = songPlatform && platforms.includes(songPlatform)
    ? [songPlatform, ...platforms.filter((key) => key !== songPlatform)]
    : [...platforms]
  return ordered.map((key) => {
    const adapter = getCatalogAdapter(key)
    return {
      kind: SOURCE_CANDIDATE_KINDS.PLATFORM,
      key: `platform:${key}`,
      label: `${adapter?.name || key} 公开直链 · ${quality}`,
      platformKey: key,
      quality,
      musicInfo
    }
  })
}

/** 用 Range 探针确认候选地址确实能取到音频（只读取前几 KB，不落盘）。 */
export async function probeMediaUrl(url, { fetchImpl, timeout = 8000 } = {}) {
  const doFetch = fetchImpl || ((...args) => globalThis.fetch(...args))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await doFetch(url, {
      method: 'GET',
      headers: { range: 'bytes=0-2047' },
      mode: 'cors',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: controller.signal
    })
    const ok = response.status === 206 || response.status === 200 || response.status === 0
    const type = String(response.headers?.get?.('content-type') || '')
    return { ok: ok && (type ? AUDIO_CONTENT_HINT.test(type) : true), status: response.status, contentType: type }
  } catch (error) {
    return { ok: false, status: 0, contentType: '', error: String(error?.message || error) }
  } finally {
    clearTimeout(timer)
  }
}

async function resolveCustomSourceCandidate(candidate, song, { onProgress, signal }) {
  let session = null
  try {
    const musicInfo = mergeCustomSourceMusicInfo(song, candidate.extraFields || '{}')
    const bridge = createDesktopSourceRequestBridge(candidate.source)
    session = await createCustomSourceSession(candidate.source, { onRequest: bridge, signal })
    const platform = session.capabilities.sources.find((item) => item.key === candidate.platformKey)
    if (!platform) throw new Error('本次初始化未声明该平台')
    const rawUrl = await session.request({
      source: platform.key,
      action: 'musicUrl',
      info: { type: platform.key === 'local' ? null : (candidate.quality || platform.qualities?.[0] || '128k'), musicInfo }
    })
    const media = validateCustomSourceMediaUrl(rawUrl)
    return { url: media.href, origin: media.origin, desktopUrl: await desktopMediaUrl(media.href) }
  } finally {
    session?.destroy()
  }
}

async function resolvePlatformCandidate(candidate, song, { signal, request, probe = true, fetchImpl }) {
  const track = song?.musicInfo ? song : { musicInfo: song }
  const url = await resolvePlatformTrackUrl(candidate.platformKey, track, {
    quality: candidate.quality,
    signal,
    request
  })
  const media = validateCustomSourceMediaUrl(url)
  const probed = probe ? await probeMediaUrl(media.href, { fetchImpl }) : { ok: true, status: 0 }
  if (probe && !probed.ok) {
    throw new Error(`直链探针失败（HTTP ${probed.status || '无响应'}${probed.error ? `：${probed.error}` : ''}）`)
  }
  return { url: media.href, origin: media.origin, desktopUrl: await desktopMediaUrl(media.href) }
}

/**
 * 为一个曲目寻找可用音源。
 * @returns {Promise<{ song, candidates: Array, best: object|null }>} candidates 含每次尝试的结果
 */
export async function findAlternativeSources(song, {
  sources,
  platforms = ['wy', 'kw'],
  quality = '320k',
  extraFields = '{}',
  probe = true,
  request,
  fetchImpl,
  storage = globalThis.localStorage,
  owner = 'local',
  signal,
  onProgress = () => {}
} = {}) {
  if (!song || typeof song !== 'object') throw new Error('请选择要换源的曲目')
  const list = sources || listSwitchableCustomSources(storage, owner)
  const candidates = [
    ...(song.audioUrl ? [{
      kind: SOURCE_CANDIDATE_KINDS.CURRENT,
      key: 'current',
      label: '当前地址（不换源）',
      url: song.audioUrl
    }] : []),
    ...buildCustomSourceCandidates(list, song, { extraFields }),
    ...buildPlatformCandidates(song, { platforms, quality })
  ]

  let best = null
  const results = []
  for (const [index, candidate] of candidates.entries()) {
    if (signal?.aborted) break
    onProgress({ index, total: candidates.length, candidate })
    const entry = { ...candidate, status: 'failed', url: '', origin: '', error: '' }
    try {
      if (candidate.kind === SOURCE_CANDIDATE_KINDS.CURRENT) {
        const media = validateCustomSourceMediaUrl(candidate.url)
        const probed = probe ? await probeMediaUrl(media.href, { fetchImpl }) : { ok: true, status: 0 }
        if (probe && !probed.ok) throw new Error(`当前地址不可用（HTTP ${probed.status || '无响应'}）`)
        Object.assign(entry, { url: media.href, origin: media.origin, desktopUrl: await desktopMediaUrl(media.href) })
      } else if (candidate.kind === SOURCE_CANDIDATE_KINDS.CUSTOM_SOURCE) {
        Object.assign(entry, await resolveCustomSourceCandidate(candidate, song, { onProgress, signal }))
      } else {
        Object.assign(entry, await resolvePlatformCandidate(candidate, song, { signal, request, probe, fetchImpl }))
      }
      entry.status = 'ok'
      if (!best) best = entry
    } catch (error) {
      entry.status = 'failed'
      entry.error = String(error?.message || error || '解析失败')
    }
    results.push(entry)
  }
  return { song, candidates: results, best }
}
