const MEDIA_ACTIONS = [
  'play',
  'pause',
  'stop',
  'previoustrack',
  'nexttrack',
  'seekbackward',
  'seekforward',
  'seekto'
]

/**
 * Bridges player state to the browser/OS media controls when Media Session is available.
 * It deliberately accepts callbacks and metadata only; it never loads third-party scripts.
 */
export function createMediaSessionController({
  navigatorObject = globalThis.navigator,
  MediaMetadataConstructor = globalThis.MediaMetadata,
  actions = {}
} = {}) {
  let session
  try {
    session = navigatorObject?.mediaSession
  } catch {
    return null
  }
  if (!session) return null

  const registeredActions = []
  for (const action of MEDIA_ACTIONS) {
    const handler = actions[action]
    if (typeof handler !== 'function' || typeof session.setActionHandler !== 'function') continue
    try {
      session.setActionHandler(action, handler)
      registeredActions.push(action)
    } catch {
      // Some browsers expose Media Session but support only a subset of actions.
    }
  }

  return {
    updateMetadata(song, baseUrl) {
      if (!song) {
        try { session.metadata = null } catch { /* optional browser API */ }
        return false
      }
      if (typeof MediaMetadataConstructor !== 'function') return false

      const artwork = []
      // Custom-source artwork is loaded directly by the browser with anonymous
      // CORS. Do not hand that URL to the operating system's Media Session API.
      if (song.cover && !song.isCustomSource) {
        let src = song.cover
        try { src = new URL(song.cover, baseUrl).href } catch { /* Keep browser-native URL validation. */ }
        artwork.push({ src, sizes: '512x512' })
      }
      try {
        session.metadata = new MediaMetadataConstructor({
          title: song.title || 'Music Holo',
          artist: song.singerName || 'Music Holo',
          album: song.album || 'Music Holo',
          artwork
        })
        return true
      } catch {
        return false
      }
    },

    updatePlaybackState(playing, hasSong) {
      try {
        session.playbackState = hasSong ? (playing ? 'playing' : 'paused') : 'none'
        return true
      } catch {
        return false
      }
    },

    updatePosition({ duration, position, playbackRate = 1 } = {}) {
      if (typeof session.setPositionState !== 'function') return false
      const safeDuration = Number(duration)
      const safePosition = Number(position)
      const safeRate = Number(playbackRate)
      if (!Number.isFinite(safeDuration) || safeDuration <= 0 || !Number.isFinite(safePosition)) return false

      try {
        session.setPositionState({
          duration: safeDuration,
          position: Math.max(0, Math.min(safePosition, safeDuration)),
          playbackRate: Number.isFinite(safeRate) && safeRate > 0 ? safeRate : 1
        })
        return true
      } catch {
        // Position reporting is optional and some browsers reject transient media states.
        return false
      }
    },

    close() {
      if (typeof session.setActionHandler === 'function') {
        for (const action of registeredActions) {
          try { session.setActionHandler(action, null) } catch { /* optional browser API */ }
        }
      }
      try { session.playbackState = 'none' } catch { /* optional browser API */ }
      try { session.metadata = null } catch { /* optional browser API */ }
    }
  }
}
