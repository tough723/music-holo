import {
  searchPlatformTracks,
  listPlatformCharts,
  fetchPlatformChartTracks
} from './sourceCatalog'
import {
  bootstrapAutoSources,
  resolveAutoTrack
} from './customSourceAuto'

/**
 * Shared online-track facade used by global discovery and platform charts.
 * Keep these wrappers deliberately thin so adapter errors, request options and
 * return shapes remain identical to the existing试听台/catalog APIs.
 */
export async function bootstrapOnlineSources() {
  return bootstrapAutoSources()
}

export async function searchOnlineTracks(platformKey, query, options = {}) {
  return searchPlatformTracks(platformKey, query, options)
}

export async function listOnlineCharts(platformKey = 'wy', options = {}) {
  return listPlatformCharts(platformKey, options)
}

export async function fetchOnlineChartTracks(platformKey, chartId, options = {}) {
  return fetchPlatformChartTracks(platformKey, chartId, options)
}

export async function resolveOnlineTrack(track, options = {}) {
  return resolveAutoTrack(track, options)
}
