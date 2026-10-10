const SPATIAL_DRY_MIX = 0.72
const SPATIAL_WET_MIX = 0.28

/** 均衡器频段：低频用 lowshelf、高频用 highshelf，中间用 peaking。 */
export const EQ_BANDS = Object.freeze([
  { frequency: 60, type: 'lowshelf', label: '60' },
  { frequency: 150, type: 'peaking', label: '150', q: 0.9 },
  { frequency: 400, type: 'peaking', label: '400', q: 0.9 },
  { frequency: 1000, type: 'peaking', label: '1k', q: 0.9 },
  { frequency: 3000, type: 'peaking', label: '3k', q: 0.9 },
  { frequency: 12000, type: 'highshelf', label: '12k' }
])
/** 增益上下限（dB）：超过 ±12dB 再叠加空间音效很容易削波。 */
export const EQ_GAIN_LIMIT = 12
export const EQ_FLAT_GAINS = Object.freeze(EQ_BANDS.map(() => 0))

export const EQ_PRESETS = Object.freeze([
  { key: 'flat', label: '原声', gains: [0, 0, 0, 0, 0, 0] },
  { key: 'pop', label: '流行', gains: [-1, 2, 4, 3, 1, -1] },
  { key: 'rock', label: '摇滚', gains: [5, 3, -2, -1, 2, 4] },
  { key: 'vocal', label: '人声', gains: [-3, -1, 1, 4, 4, 2] },
  { key: 'electronic', label: '电子', gains: [6, 4, 0, -1, 1, 5] },
  { key: 'headphone', label: '耳机增强', gains: [3, 1, 0, 1, 3, 4] }
])

/** 把任意输入收敛成合法的均衡器增益数组（dB）。 */
export function normalizeEqualizerGains(gains) {
  const list = Array.isArray(gains) ? gains : []
  return EQ_BANDS.map((_, index) => {
    const value = Number(list[index])
    if (!Number.isFinite(value)) return 0
    return Math.max(-EQ_GAIN_LIMIT, Math.min(EQ_GAIN_LIMIT, Math.round(value * 10) / 10))
  })
}

/** 判断一组增益是否等于某个预设（用于把自定义值归类回预设）。 */
export function matchEqualizerPreset(gains) {
  const normalized = normalizeEqualizerGains(gains)
  const found = EQ_PRESETS.find((preset) => {
    const target = normalizeEqualizerGains(preset.gains)
    return target.every((value, index) => Math.abs(value - normalized[index]) < 0.01)
  })
  return found ? found.key : 'custom'
}

export function presetGains(key) {
  const preset = EQ_PRESETS.find((item) => item.key === key)
  return preset ? normalizeEqualizerGains(preset.gains) : EQ_FLAT_GAINS.slice()
}

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
  // 均衡器串在 dry/wet 混合之后、总音量之前；空间处理与均衡互不干扰。
  let eqInput = null
  let eqFilters = []
  let equalizerGains = EQ_FLAT_GAINS.slice()

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
    ensureEqualizer()
  } catch (error) {
    try {
      const closing = context.close?.()
      closing?.catch?.(() => {})
    } catch {
      // Keep the original graph-construction error.
    }
    throw error
  }

  /**
   * 惰性串接均衡器：把 dry/wet 的汇入点从 masterGain 改到滤波器链。
   * 浏览器没有 BiquadFilter 时保持直通，不影响空间音效与原声。
   */
  function ensureEqualizer() {
    if (eqFilters.length || eqInput) return Boolean(eqInput)
    if (typeof context.createBiquadFilter !== 'function') return false
    try {
      eqInput = context.createGain()
      let node = eqInput
      const filters = []
      for (const band of EQ_BANDS) {
        const filter = context.createBiquadFilter()
        filter.type = band.type
        filter.frequency.value = band.frequency
        if (band.q) filter.Q.value = band.q
        filter.gain.value = 0
        node.connect(filter)
        node = filter
        filters.push(filter)
      }
      node.connect(masterGain)
      try {
        dryGain.disconnect(masterGain)
        wetGain.disconnect(masterGain)
      } catch {
        // 旧实现可能没有 disconnect(target) 重载，退回到断开全部再重连。
        dryGain.disconnect()
        wetGain.disconnect()
      }
      dryGain.connect(eqInput)
      wetGain.connect(eqInput)
      eqFilters = filters
      return true
    } catch {
      eqFilters = []
      eqInput = null
      return false
    }
  }

  return {
    context,
    get state() {
      return context.state
    },
    /**
     * 重新拉起被浏览器挂起的音频上下文。
     * 后台标签页、系统休眠或长时间空闲都会让浏览器 suspend 掉 AudioContext，
     * 此时媒体元素仍在播放但经过 Web Audio 的声音会完全静音，必须显式 resume。
     * @returns {Promise<boolean>} 是否真的执行了 resume
     */
    resume() {
      if (context.state === 'closed' || context.state === 'running') return Promise.resolve(false)
      if (typeof context.resume !== 'function') return Promise.resolve(false)
      try {
        return Promise.resolve(context.resume()).then(() => true).catch(() => false)
      } catch {
        return Promise.resolve(false)
      }
    },
    setEnabled(enabled) {
      setGain(dryGain, enabled ? SPATIAL_DRY_MIX : 1, context)
      setGain(wetGain, enabled ? SPATIAL_WET_MIX : 0, context)
    },
    setVolume(volume) {
      const normalized = Math.min(1, Math.max(0, Number(volume) || 0))
      setGain(masterGain, normalized, context)
    },
    /** 均衡器是否真的接进了音频链路（跨域音源与不支持的浏览器会返回 false）。 */
    supportsEqualizer() {
      return ensureEqualizer()
    },
    /**
     * 设置均衡器增益（dB，按 EQ_BANDS 顺序）。
     * @returns {boolean} 是否生效
     */
    setEqualizer(gains) {
      const normalized = normalizeEqualizerGains(gains)
      equalizerGains = normalized
      if (!ensureEqualizer()) return false
      for (let i = 0; i < eqFilters.length; i += 1) {
        const param = eqFilters[i]?.gain
        if (!param) continue
        if (typeof param.setTargetAtTime === 'function') {
          param.setTargetAtTime(normalized[i] || 0, context.currentTime || 0, 0.02)
        } else {
          param.value = normalized[i] || 0
        }
      }
      return true
    },
    getEqualizerGains() {
      return equalizerGains.slice()
    },
    close() {
      if (context.state !== 'closed' && typeof context.close === 'function') {
        return context.close()
      }
      return Promise.resolve()
    }
  }
}
