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

/** 浏览器是否具备 Web Audio（均衡器 / 空间音效 / 响度归一化都依赖它）。 */
export function hasWebAudioSupport(scope = globalThis) {
  return Boolean(scope?.AudioContext || scope?.webkitAudioContext)
}

/**
 * 解释「为什么这个音源用不了音频处理链路」。返回 null 表示可用。
 *
 * 用途是把静默失效变成可见的置灰 + 原因，而不是让用户点一下才弹个必然失败的错误提示。
 * @param {{ audioUrl?: string, isCustomSource?: boolean, isLocal?: boolean }} song
 * @param {{ origin?: string, supportsWebAudio?: boolean }} options
 * @returns {string|null}
 */
export function explainAudioProcessingBlocker(song, options = {}) {
  const origin = options.origin ?? globalThis.location?.href
  const supportsWebAudio = options.supportsWebAudio ?? hasWebAudioSupport()
  if (!song?.audioUrl) return '当前没有可播放的音频'
  if (!supportsWebAudio) return '当前浏览器不支持 Web Audio，音频处理链路不可用'
  if (song.isCustomSource) return '自定义源音源不接入音频处理链路（地址是一次性签名地址）'
  if (song.isLocal && !isSpatialAudioUrl(song.audioUrl, origin)) return '本地文件的地址无法接入音频处理链路'
  if (!isSpatialAudioUrl(song.audioUrl, origin)) return '跨域音源不接入音频处理链路（拿不到音频采样）'
  return null
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
  let eqTail = null
  let eqFilters = []
  let equalizerGains = EQ_FLAT_GAINS.slice()
  // 响度归一化串在均衡之后、总音量之前：decrease 过高响度时不会把均衡的曲线拧回去。
  let loudnessIn = null
  let loudnessTrim = null
  let compressor = null
  let loudnessEnabled = false
  let loudnessTrimValue = 1

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
   * 把「当前信号源」接到「当前末端」：末端可能是均衡链，也可能是响度级，
   * 两者都启用时顺序固定为 均衡 → 响度 → 总音量，重复调用是幂等的。
   */
  function applyTailRouting() {
    // 均衡链启用时末端是最后一个滤波器，否则是 dry/wet 两路。
    const heads = eqTail ? [eqTail] : [dryGain, wetGain]
    const tail = loudnessIn || masterGain
    for (const head of heads) {
      try {
        head.disconnect(masterGain)
      } catch {
        // 还没有连过：disconnect(目标) 会抛错，忽略即可。
      }
      try {
        head.disconnect(loudnessIn)
      } catch {
        // 同上。
      }
      head.connect(tail)
    }
  }

  /**
   * 惰性串接响度归一化：一个增益（补偿）+ 一个压缩器（动态兜底）。
   * 浏览器没有 DynamicsCompressor 时只保留增益补偿，不影响空间音效与原声。
   */
  function ensureLoudness() {
    if (loudnessIn) return true
    if (typeof context.createGain !== 'function') return false
    try {
      loudnessIn = context.createGain()
      loudnessTrim = context.createGain()
      loudnessTrim.gain.value = 1
      loudnessIn.connect(loudnessTrim)
      // 压缩器只是动态兜底：拿不到（或拿到但不能配置）时退回纯增益补偿，不影响播放。
      try {
        if (typeof context.createDynamicsCompressor === 'function') {
          const node = context.createDynamicsCompressor()
          // 温和的阈值/比例：只压掉过头的高响度，不做明显的“泵感”。
          node.threshold.value = -18
          node.knee.value = 12
          node.ratio.value = 3
          node.attack.value = 0.01
          node.release.value = 0.25
          loudnessTrim.connect(node)
          node.connect(masterGain)
          compressor = node
        }
      } catch {
        compressor = null
      }
      if (!compressor) loudnessTrim.connect(masterGain)
      applyTailRouting()
      return true
    } catch {
      loudnessIn = null
      loudnessTrim = null
      compressor = null
      return false
    }
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
      eqFilters = filters
      eqTail = node
      // dry/wet 改道进均衡链；均衡之后再统一交给末端（可能还有响度级）。
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
      applyTailRouting()
      return true
    } catch {
      eqFilters = []
      eqInput = null
      eqTail = null
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
    /** 响度归一化是否真的接进了音频链路（不支持的浏览器返回 false）。 */
    supportsLoudness() {
      return ensureLoudness()
    },
    /**
     * 设置响度归一化。
     * @param {{ enabled: boolean, trim?: number }} options trim 为线性补偿倍数（1 = 不补偿）
     * @returns {boolean} 是否生效
     */
    setLoudness(options = {}) {
      const enabled = options.enabled !== false
      const trim = Math.max(0, Math.min(4, Number(options.trim) || 0)) || 1
      loudnessEnabled = enabled
      loudnessTrimValue = trim
      if (!enabled) {
        // 关掉时恢复成 1 倍直通，保留节点以免频繁重连。
        if (loudnessTrim) setGain(loudnessTrim, 1, context)
        return Boolean(loudnessTrim)
      }
      if (!ensureLoudness()) return false
      setGain(loudnessTrim, trim, context)
      return true
    },
    getLoudness() {
      return { enabled: loudnessEnabled, trim: loudnessTrimValue, supportsCompressor: Boolean(compressor) }
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
