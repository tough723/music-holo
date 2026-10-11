import { beforeEach, describe, expect, it, vi } from 'vitest'

const catalog = vi.hoisted(() => ({
  searchPlatformTracks: vi.fn(),
  listPlatformCharts: vi.fn(),
  fetchPlatformChartTracks: vi.fn()
}))
const auto = vi.hoisted(() => ({
  bootstrapAutoSources: vi.fn(),
  resolveAutoTrack: vi.fn()
}))

vi.mock('@/utils/sourceCatalog', () => catalog)
vi.mock('@/utils/customSourceAuto', () => auto)

import {
  bootstrapOnlineSources,
  fetchOnlineChartTracks,
  listOnlineCharts,
  resolveOnlineTrack,
  searchOnlineTracks
} from '@/utils/onlineTrackService'

describe('统一在线曲目服务', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('启动自动音源时透传能力结果', async () => {
    const result = [{ sources: [{ key: 'wy' }] }]
    auto.bootstrapAutoSources.mockResolvedValue(result)
    await expect(bootstrapOnlineSources()).resolves.toBe(result)
    expect(auto.bootstrapAutoSources).toHaveBeenCalledOnce()
  })

  it('搜索透传平台、关键词和全部选项，并保持结果引用', async () => {
    const request = vi.fn()
    const signal = new AbortController().signal
    const result = [{ platform: 'wy', name: '甲乙丙丁' }]
    catalog.searchPlatformTracks.mockResolvedValue(result)
    await expect(searchOnlineTracks('wy', '甲乙丙丁', { limit: 10, request, signal })).resolves.toBe(result)
    expect(catalog.searchPlatformTracks).toHaveBeenCalledWith('wy', '甲乙丙丁', { limit: 10, request, signal })
  })

  it('榜单默认使用 wy 并透传选项', async () => {
    const result = [{ id: '3778678' }]
    catalog.listPlatformCharts.mockResolvedValue(result)
    await expect(listOnlineCharts()).resolves.toBe(result)
    expect(catalog.listPlatformCharts).toHaveBeenCalledWith('wy', {})
  })

  it('榜单曲目透传榜单 ID 和选项', async () => {
    const result = [{ platform: 'wy', name: '榜单歌曲' }]
    catalog.fetchPlatformChartTracks.mockResolvedValue(result)
    await expect(fetchOnlineChartTracks('wy', '3778678', { limit: 20 })).resolves.toBe(result)
    expect(catalog.fetchPlatformChartTracks).toHaveBeenCalledWith('wy', '3778678', { limit: 20 })
  })

  it('在线曲目解析透传曲目和音质', async () => {
    const track = { platform: 'wy', name: '甲乙丙丁' }
    const result = { isCustomSource: true, title: '甲乙丙丁' }
    auto.resolveAutoTrack.mockResolvedValue(result)
    await expect(resolveOnlineTrack(track, { quality: '320k' })).resolves.toBe(result)
    expect(auto.resolveAutoTrack).toHaveBeenCalledWith(track, { quality: '320k' })
  })

  it('依赖错误原样向上抛出', async () => {
    const error = new Error('network')
    catalog.searchPlatformTracks.mockRejectedValue(error)
    await expect(searchOnlineTracks('wy', 'x')).rejects.toBe(error)
    auto.bootstrapAutoSources.mockRejectedValue(error)
    await expect(bootstrapOnlineSources()).rejects.toBe(error)
    auto.resolveAutoTrack.mockRejectedValue(error)
    await expect(resolveOnlineTrack({ platform: 'wy' })).rejects.toBe(error)
  })
})
