// 平台曲目目录（搜索 / 榜单 / 歌词封面）公共入口。
//
// 这些能力由 Music Holo 自己的平台适配器实现，不依赖任何 LX 音源脚本自带搜索；
// 适配器产出的 musicInfo 字段可直接填入试听台，交给音源脚本解析播放地址。
// 安全边界不变：桌面走受控桥逐域名授权，网页受 HTTPS/CORS 限制，全程无凭据、无密钥。

import { CATALOG_ADAPTERS } from './adapters'
import { createCatalogRequest } from './transport'

export { createCatalogRequest }

export function getCatalogAdapter(platformKey) {
  return CATALOG_ADAPTERS[String(platformKey || '')] || null
}

export function listCatalogPlatforms() {
  return Object.values(CATALOG_ADAPTERS).map((adapter) => ({
    key: adapter.key,
    name: adapter.name,
    verified: adapter.verified,
    supportsSearch: typeof adapter.search === 'function',
    supportsCharts: Boolean(adapter.charts),
    supportsExtras: typeof adapter.extras === 'function'
  }))
}

function resolveRequest(options = {}) {
  return options.request || createCatalogRequest()
}

export async function searchPlatformTracks(platformKey, query, options = {}) {
  const adapter = getCatalogAdapter(platformKey)
  if (!adapter) throw new Error(`未接入「${platformKey}」平台适配器`)
  const keyword = String(query ?? '').trim().slice(0, 80)
  if (!keyword) throw new Error('请输入搜索关键词')
  return adapter.search(keyword, {
    request: resolveRequest(options),
    limit: Math.max(1, Math.min(30, Number(options.limit) || 10)),
    signal: options.signal
  })
}

export async function listPlatformCharts(platformKey, options = {}) {
  const adapter = getCatalogAdapter(platformKey)
  if (!adapter?.charts) throw new Error(`「${adapter?.name || platformKey}」榜单尚未接入`)
  return adapter.charts.list({
    request: resolveRequest(options),
    signal: options.signal
  })
}

export async function fetchPlatformChartTracks(platformKey, chartId, options = {}) {
  const adapter = getCatalogAdapter(platformKey)
  if (!adapter?.charts) throw new Error(`「${adapter?.name || platformKey}」榜单尚未接入`)
  const id = String(chartId ?? '').trim()
  if (!id) throw new Error('请选择要加载的榜单')
  return adapter.charts.tracks(id, {
    request: resolveRequest(options),
    limit: Math.max(1, Math.min(100, Number(options.limit) || 50)),
    signal: options.signal
  })
}

export async function fetchPlatformTrackExtras(platformKey, track, options = {}) {
  const adapter = getCatalogAdapter(platformKey)
  if (!adapter?.extras) return {}
  return adapter.extras(track, {
    request: resolveRequest(options),
    signal: options.signal
  })
}
