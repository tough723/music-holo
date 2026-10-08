const SPATIAL_DRY_MIX = 0.72
const SPATIAL_WET_MIX = 0.28

/**
 * Web Audio cannot safely spatialize arbitrary cross-origin media without CORS.
 * Keep regular HTMLAudioElement playback untouched for unsupported sources.
 */
export function isSpatialAudioUrl(audioUrl, baseUrl = globalThis.location?.href) {
  if (!audioUrl || !baseUrl) return false
  try {
    const base = new URL(baseUrl)
    const source = new URL(audioUrl, base)
    const supportedProtocol = source.protocol === 'http:' || source.protocol === 'https:' || source.protocol === 'blob:'
    return supportedProtocol && source.origin === base.origin
  } catch {
    return false
  }
}

function setGain(gainNode, value, context) {
  const param = gainNode?.gain
  if (!param) return
  const now = context.currentTime || 0
  if (typeof param.setTargetAtTime === 'function') {
    param.setTargetAtTime(value, now, 0.025)
  } else {
    param.value = value
  }
}

function setPannerPosition(panner, x, context) {
  panner.panningModel = 'HRTF'
  panner.distanceModel = 'inverse'
  panner.refDistance = 1
  panner.maxDistance = 2
  panner.rolloffFactor = 0
  if (panner.positionX && panner.positionY && panner.positionZ) {
    panner.positionX.setValueAtTime(x, context.currentTime || 0)
    panner.positionY.setValueAtTime(0, context.currentTime || 0)
    panner.positionZ.setValueAtTime(-1, context.currentTime || 0)
  } else if (typeof panner.setPosition === 'function') {
    panner.setPosition(x, 0, -1)
  }
}

/**
 * Build a subtle headphone-oriented virtual speaker stage from same-origin
 * stereo audio. A dry signal remains in the mix so disabling or low browser
 * HRTF quality does not remove the original stereo image.
 */
export function createSpatialAudioGraph(audioElement, AudioContextConstructor) {
  const Context = AudioContextConstructor || globalThis.AudioContext || globalThis.webkitAudioContext
  if (!Context) throw new Error('当前浏览器不支持 Web Audio')
  if (!audioElement) throw new Error('找不到空间音效音频元素')

  const context = new Context()
  let source
  let splitter
  let leftPanner
  let rightPanner
  let spatialBus
  let dryGain
  let wetGain
  let masterGain

  try {
    source = context.createMediaElementSource(audioElement)
    splitter = context.createChannelSplitter(2)
    leftPanner = context.createPanner()
    rightPanner = context.createPanner()
    spatialBus = context.createGain()
    dryGain = context.createGain()
    wetGain = context.createGain()
    masterGain = context.createGain()

    setPannerPosition(leftPanner, -0.42, context)
    setPannerPosition(rightPanner, 0.42, context)

    source.connect(dryGain)
    source.connect(splitter)
    splitter.connect(leftPanner, 0)
    splitter.connect(rightPanner, 1)
    leftPanner.connect(spatialBus)
    rightPanner.connect(spatialBus)
    spatialBus.connect(wetGain)
    dryGain.connect(masterGain)
    wetGain.connect(masterGain)
    masterGain.connect(context.destination)

    dryGain.gain.value = 1
    wetGain.gain.value = 0
    masterGain.gain.value = 1
  } catch (error) {
    try {
      const closing = context.close?.()
      closing?.catch?.(() => {})
    } catch {
      // Keep the original graph-construction error.
    }
    throw error
  }

  return {
    context,
    setEnabled(enabled) {
      setGain(dryGain, enabled ? SPATIAL_DRY_MIX : 1, context)
      setGain(wetGain, enabled ? SPATIAL_WET_MIX : 0, context)
    },
    setVolume(volume) {
      const normalized = Math.min(1, Math.max(0, Number(volume) || 0))
      setGain(masterGain, normalized, context)
    },
    close() {
      if (context.state !== 'closed' && typeof context.close === 'function') {
        return context.close()
      }
      return Promise.resolve()
    }
  }
}
