/**
 * 响度归一化（P2-10）的纯计算部分。
 *
 * 目标不是“把所有歌拉到一模一样响”，而是把专辑之间的整体响度差压到听感可接受的范围：
 *   - 目标响度 targetLufs（默认 -16 LUFS，流媒体常见档位）
 *   - 峰值上限 ceilingDb（默认 -1 dBFS）：算出来的增益不能把波形推到削波
 *   - 补偿增益 = clamp(目标 - 实测, ±MAX_GAIN_DB)，再按峰值上限回退
 *
 * 这里的 LUFS 是**近似值**：真正的 EBU R128 需要 K 加权 + 400ms 块门控，
 * 浏览器端我们只用一阶高搁架（K 权重的低频衰减部分）+ RMS 做近似，
 * 足够区分“这轨明显偏轻/偏响”，不宣称符合广播级测量标准。
 */

/** 目标响度档位（LUFS）。off = 关闭归一化。 */
export const LOUDNESS_TARGETS = Object.freeze([
  { key: 'off', label: '关闭', lufs: null },
  { key: 'streaming', label: '标准 −16', lufs: -16 },
  { key: 'loud', label: '偏响 −14', lufs: -14 },
  { key: 'quiet', label: '偏轻 −18', lufs: -18 }
])
export const DEFAULT_LOUDNESS_TARGET = 'streaming'
/** 峰值上限（dBFS）：补偿后估算峰值不能超过它，否则回退增益。 */
export const DEFAULT_CEILING_DB = -1
/** 单次补偿的最大幅度（dB）：避免把底噪或极静的轨推爆。 */
export const MAX_GAIN_DB = 12
/** 低于这个 RMS 视为静音/空轨，不参与统计。 */
export const SILENCE_RMS = 1e-4

export function dbToGain(db) {
  const value = Number(db)
  if (!Number.isFinite(value)) return 1
  return Math.pow(10, value / 20)
}

export function gainToDb(gain) {
  const value = Number(gain)
  if (!Number.isFinite(value) || value <= 0) return -Infinity
  return 20 * Math.log10(value)
}

export function clampGainDb(db) {
  const value = Number(db)
  if (!Number.isFinite(value)) return 0
  return Math.max(-MAX_GAIN_DB, Math.min(MAX_GAIN_DB, value))
}

export function normalizeLoudnessTarget(key) {
  return LOUDNESS_TARGETS.some((item) => item.key === key) ? key : DEFAULT_LOUDNESS_TARGET
}

export function targetLufs(key) {
  return LOUDNESS_TARGETS.find((item) => item.key === normalizeLoudnessTarget(key))?.lufs ?? null
}

/** 均方根（RMS）。空数组返回 0。 */
export function rms(samples) {
  if (!samples || typeof samples.length !== 'number' || samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i += 1) {
    const value = Number(samples[i]) || 0
    sum += value * value
  }
  return Math.sqrt(sum / samples.length)
}

/** 峰值（0..1）。 */
export function peak(samples) {
  if (!samples || typeof samples.length !== 'number' || samples.length === 0) return 0
  let max = 0
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.abs(Number(samples[i]) || 0)
    if (value > max) max = value
  }
  return max
}

/** 双二阶滤波器系数（RBJ 设计式），只在这里用于 K 加权。 */
function designHighShelf(gainDb, freq, q, rate) {
  const A = Math.pow(10, gainDb / 40)
  const w0 = (2 * Math.PI * freq) / rate
  const cos = Math.cos(w0)
  const alpha = Math.sin(w0) / (2 * q)
  const sqrtA2alpha = 2 * Math.sqrt(A) * alpha
  return {
    b0: A * ((A + 1) + (A - 1) * cos + sqrtA2alpha),
    b1: -2 * A * ((A - 1) + (A + 1) * cos),
    b2: A * ((A + 1) + (A - 1) * cos - sqrtA2alpha),
    a0: (A + 1) - (A - 1) * cos + sqrtA2alpha,
    a1: 2 * ((A - 1) - (A + 1) * cos),
    a2: (A + 1) - (A - 1) * cos - sqrtA2alpha
  }
}

function designHighPass(freq, q, rate) {
  const w0 = (2 * Math.PI * freq) / rate
  const cos = Math.cos(w0)
  const alpha = Math.sin(w0) / (2 * q)
  return {
    b0: (1 + cos) / 2,
    b1: -(1 + cos),
    b2: (1 + cos) / 2,
    a0: 1 + alpha,
    a1: -2 * cos,
    a2: 1 - alpha
  }
}

function runBiquad(coeffs, samples) {
  const { b0, b1, b2, a0, a1, a2 } = coeffs
  const nb0 = b0 / a0
  const nb1 = b1 / a0
  const nb2 = b2 / a0
  const na1 = a1 / a0
  const na2 = a2 / a0
  const out = new Array(samples.length)
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < samples.length; i += 1) {
    const x0 = Number(samples[i]) || 0
    const y0 = nb0 * x0 + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2
    out[i] = y0
    x2 = x1
    x1 = x0
    y2 = y1
    y1 = y0
  }
  return out
}

/**
 * K 加权（BS.1770 的两级滤波：4dB 高搁架 + RLB 高通），系数按实际采样率现场设计，
 * 因此 44.1k / 48k 都成立，不需要预置表。
 * @param {ArrayLike<number>} samples
 * @param {number} sampleRate
 */
export function kWeight(samples, sampleRate = 48000) {
  if (!samples || typeof samples.length !== 'number' || samples.length === 0) return []
  const rate = Number(sampleRate) > 0 ? Number(sampleRate) : 48000
  const shelf = designHighShelf(4, 1681.97, 0.7071, rate)
  const rlb = designHighPass(38.13, 0.5, rate)
  return runBiquad(rlb, runBiquad(shelf, samples))
}

/**
 * 近似积分响度（LUFS）。
 * @returns {number|null} 静音或无效输入返回 null
 */
export function estimateLufs(samples, sampleRate = 48000) {
  const level = rms(samples)
  if (!Number.isFinite(level) || level < SILENCE_RMS) return null
  const weighted = kWeight(samples, sampleRate)
  const weightedRms = rms(weighted)
  if (!Number.isFinite(weightedRms) || weightedRms <= 0) return null
  // -0.691 是 R128 里把 K 加权 RMS 折算到 LUFS 的常数偏移。
  return -0.691 + 20 * Math.log10(weightedRms)
}

/**
 * 计算补偿增益。
 * @param {{ lufs?: number|null, peak?: number }} measurement 实测响度与峰值（峰值 0..1）
 * @param {{ targetLufs?: number|null, ceilingDb?: number }} options
 * @returns {{ gainDb: number, gain: number, limited: boolean }} 关闭或无法计算时 gain = 1
 */
export function suggestGain(measurement = {}, { targetLufs: target = -16, ceilingDb = DEFAULT_CEILING_DB } = {}) {
  // 目标为 null（关闭档）时直接不改音量；注意 Number(null) === 0，必须先判空。
  if (target === null || target === undefined) return { gainDb: 0, gain: 1, limited: false }
  const goal = Number(target)
  if (!Number.isFinite(goal)) return { gainDb: 0, gain: 1, limited: false }

  const measured = Number(measurement.lufs)
  if (!Number.isFinite(measured)) return { gainDb: 0, gain: 1, limited: false }

  let gainDb = clampGainDb(goal - measured)
  // 峰值上限：补偿后的估算峰值 = 原峰值 × 增益，超过上限就回退。
  const peakValue = Number(measurement.peak)
  const ceiling = Number.isFinite(Number(ceilingDb)) ? Number(ceilingDb) : DEFAULT_CEILING_DB
  let limited = false
  if (Number.isFinite(peakValue) && peakValue > 0) {
    const peakDb = gainToDb(peakValue)
    const allowed = ceiling - peakDb
    if (Number.isFinite(allowed) && gainDb > allowed) {
      gainDb = clampGainDb(allowed)
      limited = true
    }
  }
  return { gainDb, gain: dbToGain(gainDb), limited }
}

/** 把补偿增益套到播放器音量上（原声模式没有增益节点，只能缩放元素音量）。 */
export function applyGainToVolume(volume, gain) {
  const base = Math.max(0, Math.min(1, Number(volume) || 0))
  const factor = Number(gain)
  if (!Number.isFinite(factor) || factor <= 0) return base
  return Math.max(0, Math.min(1, base * factor))
}

/** 展示用的响度描述。 */
export function describeLufs(lufs) {
  if (lufs === null || lufs === undefined) return '未测量'
  const value = Number(lufs)
  if (!Number.isFinite(value)) return '未测量'
  return `${value.toFixed(1)} LUFS`
}

/**
 * 实测一段音频的近似积分响度（需要 Web Audio，浏览器不支持时返回 null）。
 *
 * 只在能拿到完整 PCM 时才用：跨域流媒体拿不到采样数据，直接返回 null，
 * 由调用方退回“只做动态处理、不补偿增益”的模式，不瞎猜。
 *
 * @param {string} url 同源、blob 或已缓存的音频地址
 * @param {{ maxSeconds?: number, maxSamples?: number, AudioContextConstructor?: any }} options
 * @returns {Promise<{ lufs: number|null, peak: number, sampleRate: number, duration: number }|null>}
 */
export async function measureAudioLoudness(url, options = {}) {
  if (!url) return null
  const Context = options.AudioContextConstructor || globalThis.AudioContext || globalThis.webkitAudioContext
  if (!Context || typeof globalThis.fetch !== 'function') return null
  const maxSeconds = Number(options.maxSeconds) > 0 ? Number(options.maxSeconds) : 600
  const maxSamples = Number(options.maxSamples) > 0 ? Number(options.maxSamples) : 2_000_000

  let context = null
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const bytes = await response.arrayBuffer()
    if (!bytes || bytes.byteLength === 0) return null
    context = new Context()
    const decoded = await new Promise((resolve, reject) => {
      // Safari 的老式回调签名也要照顾。
      const result = context.decodeAudioData(bytes, resolve, reject)
      if (result && typeof result.then === 'function') result.then(resolve, reject)
    })
    const channels = []
    for (let i = 0; i < decoded.numberOfChannels; i += 1) channels.push(decoded.getChannelData(i))
    const usable = Math.min(decoded.length, Math.floor(decoded.sampleRate * maxSeconds))
    const stride = Math.max(1, Math.ceil(usable / maxSamples))
    const samples = new Float32Array(Math.ceil(usable / stride))
    let cursor = 0
    for (let i = 0; i < usable; i += stride) {
      let sum = 0
      for (const channel of channels) sum += channel[i] || 0
      samples[cursor] = sum / Math.max(1, channels.length)
      cursor += 1
    }
    const mono = samples.subarray(0, cursor)
    return {
      lufs: estimateLufs(mono, decoded.sampleRate),
      peak: peak(mono),
      sampleRate: decoded.sampleRate,
      duration: decoded.duration || 0
    }
  } catch {
    return null
  } finally {
    try {
      context?.close?.()
    } catch {
      // 关闭失败不影响已经算好的结果。
    }
  }
}
