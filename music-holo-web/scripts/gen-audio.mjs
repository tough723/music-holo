/**
 * 演示音频生成脚本：合成 8 首 10 秒的 WAV 电子旋律（16kHz / 16bit / 单声道）
 * 运行：npm run gen:audio
 * 输出：public/audio/song1.wav ~ song8.wav
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SR = 16000
const SECONDS = 10
const STEP = 0.625 // 每个音符时长（秒），16 步 = 10 秒

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public', 'audio')

/** MIDI 音符号 -> 频率 */
const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12)

// 8 首歌的旋律（MIDI 音符号，-1 表示休止）
const MELODIES = [
  // song1 霓虹海 - A 小调五声
  [69, 72, 76, 74, 72, 69, 65, 69, 72, 76, 77, 76, 74, 72, 69, 65],
  // song2 云端信使 - C 大调
  [60, 64, 67, 72, 71, 67, 64, 60, 62, 64, 67, 69, 67, 64, 62, 60],
  // song3 全息之恋 - 古风五声（E 宫）
  [64, 67, 69, 72, 71, 69, 67, 64, 62, 64, 67, 69, 67, 64, 62, 60],
  // song4 极光列车 - 小调电子
  [57, 60, 64, 67, 64, 60, 57, 60, 62, 65, 69, 67, 65, 64, 62, 60],
  // song5 玻璃糖纸 - 民谣大调
  [67, 69, 72, 74, 72, 69, 67, 64, 65, 67, 69, 72, 71, 69, 67, 64],
  // song6 深空回响 - 低音电子
  [45, 48, 52, 55, 52, 48, 45, 48, 50, 53, 57, 55, 53, 52, 50, 48],
  // song7 旧城之光 - 摇滚小调
  [64, 62, 60, 62, 64, 67, 64, 62, 60, 59, 60, 62, 64, 67, 69, 67],
  // song8 幻境漫游 - 梦幻大调
  [72, 76, 79, 81, 79, 76, 72, 69, 71, 74, 76, 79, 77, 74, 72, 71]
]

// 每首歌的低音（每 4 步一个，低两个八度）
const BASS = [33, 36, 40, 43, 38, 41, 45, 47]

function writeWav(filePath, samples) {
  const dataSize = samples.length * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16) // fmt chunk size
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(SR, 24)
  buffer.writeUInt32LE(SR * 2, 28) // byte rate
  buffer.writeUInt16LE(2, 32) // block align
  buffer.writeUInt16LE(16, 34) // bits per sample
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    buffer.writeInt16LE(Math.round(v * 32767), 44 + i * 2)
  }
  writeFileSync(filePath, buffer)
}

function synth(melody, bassMidi) {
  const total = Math.floor(SECONDS * SR)
  const out = new Float64Array(total)
  const stepSamples = Math.floor(STEP * SR)

  // 主旋律：正弦 + 二三次谐波 + 颤音 + ADSR 包络
  melody.forEach((midi, step) => {
    if (midi < 0) return
    const f = freq(midi)
    const start = step * stepSamples
    const len = Math.min(stepSamples, total - start)
    const attack = Math.floor(0.03 * SR)
    const release = Math.floor(0.12 * SR)
    for (let i = 0; i < len; i++) {
      const t = i / SR
      const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5 * t)
      let env = 1
      if (i < attack) env = i / attack
      else if (i > len - release) env = Math.max(0, (len - i) / release)
      const v = Math.sin(2 * Math.PI * f * vib * t)
        + 0.35 * Math.sin(2 * Math.PI * 2 * f * t)
        + 0.12 * Math.sin(2 * Math.PI * 3 * f * t)
      out[start + i] += v * env * 0.5
    }
  })

  // 低音：每 4 步一个，正弦，低音量
  for (let step = 0; step < melody.length; step += 4) {
    const f = freq(bassMidi)
    const start = step * stepSamples
    const len = Math.min(stepSamples * 2, total - start)
    for (let i = 0; i < len; i++) {
      const t = i / SR
      const env = Math.min(1, i / (0.05 * SR)) * Math.max(0, (len - i) / (0.2 * SR))
      out[start + i] += Math.sin(2 * Math.PI * f * t) * env * 0.22
    }
  }

  // 归一化
  let peak = 0
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]))
  if (peak > 0) {
    const gain = 0.85 / peak
    for (let i = 0; i < out.length; i++) out[i] *= gain
  }
  return Array.from(out)
}

mkdirSync(OUT_DIR, { recursive: true })
MELODIES.forEach((melody, idx) => {
  const file = join(OUT_DIR, `song${idx + 1}.wav`)
  writeWav(file, synth(melody, BASS[idx]))
  console.log(`generated ${file}`)
})
console.log('done: 8 wav files ->', OUT_DIR)
