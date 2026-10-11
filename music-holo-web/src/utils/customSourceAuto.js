import { createCustomSourceSession, runCustomSourceCompatibility, validateCustomSourceMediaUrl, parseCustomSourceLyricBundle } from './customSourceRuntime'
import { createCustomSourceRequestBridge } from './customSourceConsent'
import { customSourceStorageKeyForOwner, readCustomSources } from './customSources'
import { desktopMediaUrl } from './desktopSource'

const capabilityCache = new Map()
const sessionCache = new Map()
const bootstrapPromises = new Map()

function ownerKey() {
  try {
    const user = JSON.parse(localStorage.getItem('mh_user') || 'null')
    return user?.id ?? user?.username ?? 'local'
  } catch {
    return 'local'
  }
}

function sourcesForOwner() {
  return readCustomSources(localStorage, customSourceStorageKeyForOwner(ownerKey()))
}

function activeSourceFor(platformKey) {
  return sourcesForOwner().find((source) => source.autoRun !== false &&
    (capabilityCache.get(source.id)?.sources || []).some((item) => item.key === platformKey && item.actions.includes('musicUrl')))
    || sourcesForOwner().find((source) => source.autoRun !== false)
}

async function openSession(source) {
  const current = sessionCache.get(source.id)
  if (current?.isActive) return current
  const session = await createCustomSourceSession(source, {
    onRequest: createCustomSourceRequestBridge(source)
  })
  sessionCache.set(source.id, session)
  return session
}

export function getAutoSources() {
  return sourcesForOwner().filter((source) => source.autoRun !== false)
}

export function getAutoCapabilities() {
  return [...capabilityCache.values()]
}

export async function bootstrapAutoSources() {
  const sources = getAutoSources()
  await Promise.all(sources.map(async (source) => {
    if (bootstrapPromises.has(source.id)) return bootstrapPromises.get(source.id)
    const promise = runCustomSourceCompatibility(source, {
      onRequest: createCustomSourceRequestBridge(source)
    }).then((result) => {
      capabilityCache.set(source.id, result)
      return result
    }).catch((error) => {
      capabilityCache.set(source.id, { sources: [], error: error?.message || '音源初始化失败' })
      return null
    }).finally(() => bootstrapPromises.delete(source.id))
    bootstrapPromises.set(source.id, promise)
    return promise
  }))
  return getAutoCapabilities()
}

export async function resolveAutoTrack(track, { quality = '320k' } = {}) {
  const platformKey = String(track?.platform || 'wy')
  const source = activeSourceFor(platformKey)
  if (!source) throw new Error('请先导入可自动运行的自定义音源')
  const session = await openSession(source)
  const platform = session.capabilities?.sources?.find((item) => item.key === platformKey && item.actions.includes('musicUrl'))
  if (!platform) throw new Error(`当前音源未声明「${platformKey}」的 musicUrl 能力`)
  const musicInfo = {
    ...(track.musicInfo || {}),
    title: track.name || track.musicInfo?.name || '',
    name: track.name || track.musicInfo?.name || '',
    singerName: track.singer || track.musicInfo?.singer || '',
    singer: track.singer || track.musicInfo?.singer || '',
    albumName: track.album || track.musicInfo?.albumName || ''
  }
  const raw = await session.request({
    source: platformKey,
    action: 'musicUrl',
    info: { type: quality, musicInfo }
  })
  const media = validateCustomSourceMediaUrl(raw)
  let lyricBundle = { lines: [], translationLines: [], romajiLines: [], verbatimLines: [] }
  if (platform.actions.includes('lyric')) {
    try {
      const value = await session.request({ source: platformKey, action: 'lyric', info: { musicInfo } })
      lyricBundle = parseCustomSourceLyricBundle(value)
    } catch { /* 歌词失败不阻断播放 */ }
  }
  let cover = ''
  if (platform.actions.includes('pic')) {
    try { cover = String(await session.request({ source: platformKey, action: 'pic', info: { musicInfo } }) || '') } catch { /* optional */ }
  }
  return {
    id: `online-${platformKey}-${musicInfo.id || musicInfo.songmid || musicInfo.hash || Date.now()}`,
    title: musicInfo.title || '在线曲目',
    singerName: musicInfo.singerName || '未知歌手',
    album: musicInfo.albumName || '',
    cover,
    audioUrl: await desktopMediaUrl(media.href),
    audioOrigin: media.origin,
    customLyrics: lyricBundle.lines,
    customTranslationLyrics: lyricBundle.translationLines,
    customRomajiLyrics: lyricBundle.romajiLines,
    customVerbatimLyrics: lyricBundle.verbatimLines,
    categoryName: '在线平台',
    sourceName: source.name,
    sourcePlatform: platform.name,
    isCustomSource: true
  }
}

export function disposeAutoSourceSessions() {
  for (const session of sessionCache.values()) session.destroy()
  sessionCache.clear()
}
