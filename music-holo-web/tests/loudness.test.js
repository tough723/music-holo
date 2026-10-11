import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CEILING_DB,
  LOUDNESS_TARGETS,
  MAX_GAIN_DB,
  applyGainToVolume,
  dbToGain,
  describeLufs,
  estimateLufs,
  gainToDb,
  kWeight,
  normalizeLoudnessTarget,
  peak,
  rms,
  suggestGain,
  targetLufs
} from '../src/utils/loudness.js'

const sine = (freq, rate, seconds = 0.5, amplitude = 0.5) => {
  const count = Math.floor(rate * seconds)
  const out = new Array(count)
  for (let i = 0; i < count; i += 1) out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / rate)
  return out
}

describe('响度归一化', () => {
  it('dB 与线性增益互为逆运算', () => {
    expect(dbToGain(0)).toBeCloseTo(1)
    expect(dbToGain(6)).toBeCloseTo(1.995, 2)
    expect(dbToGain(-6)).toBeCloseTo(0.501, 2)
    expect(gainToDb(dbToGain(-7.3))).toBeCloseTo(-7.3, 5)
    expect(gainToDb(0)).toBe(-Infinity)
    expect(dbToGain('x')).toBe(1)
  })

  it('RMS 与峰值：满幅正弦的 RMS ≈ 幅度/√2', () => {
    const samples = sine(1000, 48000, 0.5, 0.5)
    expect(rms(samples)).toBeCloseTo(0.5 / Math.SQRT2, 2)
    expect(peak(samples)).toBeCloseTo(0.5, 2)
    expect(rms([])).toBe(0)
    expect(peak([])).toBe(0)
    expect(rms(null)).toBe(0)
  })

  it('K 加权抬高频、压低频：1kHz 明显强于 30Hz', () => {
    const rate = 48000
    const high = kWeight(sine(1000, rate), rate)
    const low = kWeight(sine(30, rate), rate)
    expect(gainToDb(rms(high) / rms(low))).toBeGreaterThan(6) // RLB 高通把 30Hz 切掉大半
    expect(kWeight([])).toEqual([])
  })

  it('静音与空输入不产生响度值', () => {
    expect(estimateLufs([])).toBeNull()
    expect(estimateLufs(new Array(1000).fill(0))).toBeNull()
    expect(estimateLufs(null)).toBeNull()
    const value = estimateLufs(sine(1000, 48000, 0.5, 0.5))
    expect(typeof value).toBe('number')
    expect(value).toBeGreaterThan(-40)
    expect(value).toBeLessThan(0)
    // 幅度减半 ≈ 响度降 6dB
    const quieter = estimateLufs(sine(1000, 48000, 0.5, 0.25))
    expect(value - quieter).toBeCloseTo(6, 0)
  })

  it('档位与默认：关闭档不设目标，非法 key 回落到默认', () => {
    expect(LOUDNESS_TARGETS[0].key).toBe('off')
    expect(targetLufs('off')).toBeNull()
    expect(targetLufs('streaming')).toBe(-16)
    expect(normalizeLoudnessTarget('nope')).toBe('streaming')
    expect(targetLufs('nope')).toBe(-16)
    expect(DEFAULT_CEILING_DB).toBe(-1)
  })

  it('补偿增益：偏轻的推上去、偏响的压下来，并夹在 ±12dB', () => {
    const quiet = suggestGain({ lufs: -26 }, { targetLufs: -16 })
    expect(quiet.gainDb).toBeCloseTo(10)
    expect(quiet.gain).toBeCloseTo(dbToGain(10), 5)
    expect(quiet.limited).toBe(false)

    const loud = suggestGain({ lufs: -8 }, { targetLufs: -16 })
    expect(loud.gainDb).toBeCloseTo(-8)

    expect(suggestGain({ lufs: -60 }, { targetLufs: -16 }).gainDb).toBe(MAX_GAIN_DB)
    expect(suggestGain({ lufs: 0 }, { targetLufs: -16 }).gainDb).toBe(-MAX_GAIN_DB)
    // 关闭归一化或没有实测值时不改变音量
    expect(suggestGain({ lufs: -26 }, { targetLufs: null }).gain).toBe(1)
    expect(suggestGain({}, { targetLufs: -16 }).gain).toBe(1)
  })

  it('峰值上限：会削波时回退增益并标记 limited', () => {
    // 峰值 0.9（-0.9dBFS），目标 -1dBFS：最多只能再推 -0.1dB，而不是 +10dB
    const result = suggestGain({ lufs: -26, peak: 0.9 }, { targetLufs: -16, ceilingDb: -1 })
    expect(result.limited).toBe(true)
    expect(result.gainDb).toBeCloseTo(-0.1, 1)
    expect(result.gain).toBeLessThan(1)

    const roomy = suggestGain({ lufs: -26, peak: 0.2 }, { targetLufs: -16, ceilingDb: -1 })
    expect(roomy.limited).toBe(false)
    expect(roomy.gainDb).toBeCloseTo(10)
  })

  it('补偿增益套到播放器音量上不会溢出 0..1', () => {
    expect(applyGainToVolume(0.8, 2)).toBe(1)
    expect(applyGainToVolume(0.8, 0.5)).toBeCloseTo(0.4)
    expect(applyGainToVolume(0.8, 0)).toBe(0.8) // 非法增益按不处理
    expect(applyGainToVolume(2, 1)).toBe(1)
    expect(applyGainToVolume(-1, 1)).toBe(0)
  })

  it('展示文案', () => {
    expect(describeLufs(-16.23)).toBe('-16.2 LUFS')
    expect(describeLufs(undefined)).toBe('未测量')
  })
})
