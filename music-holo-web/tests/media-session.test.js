import { describe, expect, it, vi } from 'vitest'
import { createMediaSessionController } from '../src/utils/mediaSession.js'

function createSession(overrides = {}) {
  return {
    metadata: null,
    playbackState: 'none',
    handlers: {},
    setActionHandler(action, handler) {
      this.handlers[action] = handler
    },
    setPositionState: vi.fn(),
    ...overrides
  }
}

class FakeMediaMetadata {
  constructor(data) {
    Object.assign(this, data)
  }
}

describe('Media Session bridge', () => {
  it('returns null when the browser does not expose Media Session', () => {
    expect(createMediaSessionController({ navigatorObject: {} })).toBeNull()
  })

  it('registers supported actions and removes them during cleanup', () => {
    const session = createSession({
      setActionHandler(action, handler) {
        if (action === 'seekto') throw new Error('unsupported action')
        this.handlers[action] = handler
      }
    })
    const play = vi.fn()
    const controller = createMediaSessionController({
      navigatorObject: { mediaSession: session },
      actions: { play, seekto: vi.fn() }
    })

    expect(session.handlers.play).toBe(play)
    expect(session.handlers.seekto).toBeUndefined()
    controller.close()
    expect(session.handlers.play).toBeNull()
    expect(session.playbackState).toBe('none')
  })

  it('publishes song metadata and clears it when playback has no current song', () => {
    const session = createSession()
    const controller = createMediaSessionController({
      navigatorObject: { mediaSession: session },
      MediaMetadataConstructor: FakeMediaMetadata
    })

    expect(controller.updateMetadata({
      title: '霓虹海',
      singerName: 'Music Holo',
      album: '夜航',
      cover: '/covers/neon.webp'
    }, 'https://music.example/search')).toBe(true)
    expect(session.metadata).toMatchObject({
      title: '霓虹海',
      artist: 'Music Holo',
      album: '夜航',
      artwork: [{ src: 'https://music.example/covers/neon.webp', sizes: '512x512' }]
    })

    controller.updateMetadata(null)
    expect(session.metadata).toBeNull()
  })

  it('does not disclose custom-source artwork URLs to the operating system', () => {
    const session = createSession()
    const controller = createMediaSessionController({
      navigatorObject: { mediaSession: session },
      MediaMetadataConstructor: FakeMediaMetadata
    })

    controller.updateMetadata({
      title: '临时解析曲目',
      singerName: '测试歌手',
      album: '全息试听',
      cover: 'https://cdn.example.org/signed-cover?token=temporary',
      isCustomSource: true
    }, 'https://music.example')
    expect(session.metadata).toMatchObject({ title: '临时解析曲目', artwork: [] })
  })

  it('reports playback state and safely clamps the system seek position', () => {
    const session = createSession()
    const controller = createMediaSessionController({ navigatorObject: { mediaSession: session } })

    controller.updatePlaybackState(true, true)
    expect(session.playbackState).toBe('playing')
    controller.updatePlaybackState(false, true)
    expect(session.playbackState).toBe('paused')
    controller.updatePlaybackState(false, false)
    expect(session.playbackState).toBe('none')

    expect(controller.updatePosition({ duration: 90, position: 100, playbackRate: 1.25 })).toBe(true)
    expect(session.setPositionState).toHaveBeenCalledWith({ duration: 90, position: 90, playbackRate: 1.25 })
    expect(controller.updatePosition({ duration: 0, position: 1 })).toBe(false)
  })
})
