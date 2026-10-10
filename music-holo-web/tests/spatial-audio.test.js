import { describe, expect, it } from 'vitest'
import {
  EQ_BANDS,
  EQ_GAIN_LIMIT,
  EQ_PRESETS,
  createSpatialAudioGraph,
  isSpatialAudioUrl,
  matchEqualizerPreset,
  normalizeEqualizerGains,
  presetGains
} from '../src/utils/spatialAudio.js'

describe('均衡器', () => {
  it('增益被夹在 ±12dB，非法值按 0 处理，长度对齐频段', () => {
    expect(normalizeEqualizerGains([99, -99, 'x', null, 3.3333, undefined])).toEqual([
      EQ_GAIN_LIMIT,
      -EQ_GAIN_LIMIT,
      0,
      0,
      3.3,
      0
    ])
    expect(normalizeEqualizerGains(null)).toEqual(EQ_BANDS.map(() => 0))
    expect(normalizeEqualizerGains([1, 2])).toHaveLength(EQ_BANDS.length)
  })

  it('预设可识别，改一个频段就变成自定义', () => {
    expect(matchEqualizerPreset(presetGains('pop'))).toBe('pop')
    expect(matchEqualizerPreset(presetGains('flat'))).toBe('flat')
    const tweaked = presetGains('rock')
    tweaked[2] = 6
    expect(matchEqualizerPreset(tweaked)).toBe('custom')
    expect(matchEqualizerPreset([0, 0, 0, 0, 0, 0.5])).toBe('custom')
  })

  it('预设都是合法增益且覆盖常见曲风', () => {
    const keys = EQ_PRESETS.map((preset) => preset.key)
    expect(keys).toEqual(expect.arrayContaining(['flat', 'pop', 'rock', 'vocal']))
    for (const preset of EQ_PRESETS) {
      expect(normalizeEqualizerGains(preset.gains)).toHaveLength(EQ_BANDS.length)
    }
  })

  it('均衡器串在混合之后、总音量之前，切换增益即时生效', () => {
    class FakeParam {
      constructor(value = 0) { this.value = value }
      setValueAtTime(value) { this.value = value }
      setTargetAtTime(value) { this.value = value }
    }
    class FakeNode {
      constructor() { this.connections = [] }
      connect(target, ...args) { this.connections.push({ target, args }) }
      disconnect(target) {
        if (!target) { this.connections = []; return }
        this.connections = this.connections.filter((entry) => entry.target !== target)
      }
    }
    class FakeGain extends FakeNode {
      constructor() { super(); this.gain = new FakeParam(1) }
    }
    class FakeBiquad extends FakeNode {
      constructor() {
        super()
        this.type = 'lowpass'
        this.frequency = new FakeParam(350)
        this.Q = new FakeParam(1)
        this.gain = new FakeParam(0)
      }
    }
    class FakeContext {
      constructor() {
        this.currentTime = 0
        this.state = 'running'
        this.destination = new FakeNode()
        this.gains = []
        this.filters = []
      }
      createMediaElementSource() { return new FakeNode() }
      createChannelSplitter() { return new FakeNode() }
      createPanner() { return { connect () {}, positionX: { setValueAtTime () {} } } }
      createGain() { const gain = new FakeGain(); this.gains.push(gain); return gain }
      createBiquadFilter() { const filter = new FakeBiquad(); this.filters.push(filter); return filter }
      resume() { this.state = 'running'; return Promise.resolve() }
      close() { this.state = 'closed'; return Promise.resolve() }
    }

    const graph = createSpatialAudioGraph({}, FakeContext)
    expect(graph.supportsEqualizer()).toBe(true)
    const [spatialBus, dryGain, wetGain, masterGain] = graph.context.gains
    // 滤波器把 dry/wet 的汇入点接管了：不再直连 masterGain。
    expect(dryGain.connections.some((entry) => entry.target === masterGain)).toBe(false)
    expect(wetGain.connections.some((entry) => entry.target === masterGain)).toBe(false)
    expect(graph.context.filters).toHaveLength(EQ_BANDS.length)
    expect(graph.context.filters.map((filter) => filter.type)).toEqual(EQ_BANDS.map((band) => band.type))

    expect(graph.setEqualizer([1, 2, 3, 4, 5, 6])).toBe(true)
    expect(graph.getEqualizerGains()).toEqual([1, 2, 3, 4, 5, 6])
    expect(graph.context.filters.map((filter) => filter.gain.value)).toEqual([1, 2, 3, 4, 5, 6])

    graph.setEqualizer(presetGains('flat'))
    expect(graph.context.filters.every((filter) => filter.gain.value === 0)).toBe(true)
    expect(spatialBus.connections).toHaveLength(1)
  })

  it('浏览器没有 BiquadFilter 时均衡器降级为直通，不影响原声', () => {
    class FakeContext {
      constructor() {
        this.currentTime = 0
        this.state = 'running'
        this.destination = {}
        this.gains = []
      }
      createMediaElementSource() { return { connect () {} } }
      createChannelSplitter() { return { connect () {} } }
      createPanner() { return { connect () {}, positionX: { setValueAtTime () {} } } }
      createGain() {
        const gain = { connect () {}, disconnect () {}, gain: { value: 1, setTargetAtTime (value) { this.value = value } } }
        this.gains.push(gain)
        return gain
      }
      resume() { return Promise.resolve() }
      close() { this.state = 'closed'; return Promise.resolve() }
    }
    const graph = createSpatialAudioGraph({}, FakeContext)
    expect(graph.supportsEqualizer()).toBe(false)
    expect(graph.setEqualizer([6, 6, 6, 6, 6, 6])).toBe(false)
    // 降级后空间音效仍然可用。
    graph.setEnabled(true)
    expect(graph.context.gains[1].gain.value).toBeCloseTo(0.72)
  })
})

describe('响度归一化级', () => {
  function fakeContextFactory({ withCompressor = true, withBiquad = true } = {}) {
    class FakeParam {
      constructor(value = 0) { this.value = value }
      setValueAtTime(value) { this.value = value }
      setTargetAtTime(value) { this.value = value }
    }
    class FakeNode {
      constructor() { this.connections = [] }
      connect(target, ...args) { this.connections.push({ target, args }) }
      disconnect(target) {
        if (!target) { this.connections = []; return }
        this.connections = this.connections.filter((entry) => entry.target !== target)
      }
    }
    class FakeGain extends FakeNode {
      constructor() { super(); this.gain = new FakeParam(1) }
    }
    class FakeBiquad extends FakeNode {
      constructor() {
        super()
        this.type = 'lowpass'
        this.frequency = new FakeParam(350)
        this.Q = new FakeParam(1)
        this.gain = new FakeParam(0)
      }
    }
    class FakeCompressor extends FakeNode {
      constructor() {
        super()
        this.threshold = new FakeParam(-24)
        this.knee = new FakeParam(30)
        this.ratio = new FakeParam(12)
        this.attack = new FakeParam(0.003)
        this.release = new FakeParam(0.25)
      }
    }
    class FakeContext {
      constructor() {
        this.currentTime = 0
        this.state = 'running'
        this.destination = new FakeNode()
        this.gains = []
        this.filters = []
        this.compressors = []
      }
      createMediaElementSource() { return new FakeNode() }
      createChannelSplitter() { return new FakeNode() }
      createPanner() { return { connect () {}, positionX: { setValueAtTime () {} } } }
      createGain() { const gain = new FakeGain(); this.gains.push(gain); return gain }
      createBiquadFilter() {
        if (!withBiquad) throw new Error('unsupported')
        const filter = new FakeBiquad()
        this.filters.push(filter)
        return filter
      }
      createDynamicsCompressor() {
        if (!withCompressor) throw new Error('unsupported')
        const compressor = new FakeCompressor()
        this.compressors.push(compressor)
        return compressor
      }
      resume() { this.state = 'running'; return Promise.resolve() }
      close() { this.state = 'closed'; return Promise.resolve() }
    }
    return FakeContext
  }

  it('响度级串在均衡之后、总音量之前，补偿增益生效', () => {
    const graph = createSpatialAudioGraph({}, fakeContextFactory())
    expect(graph.supportsLoudness()).toBe(true)
    const gains = graph.context.gains
    const [, dryGain, wetGain, masterGain] = gains
    // 末两个增益依次是响度级的入口与补偿增益（中间还有均衡的入口）
    const loudnessTrim = gains[gains.length - 1]
    const loudnessIn = gains[gains.length - 2]
    // dry/wet 不再直连 masterGain，均衡尾部接到响度级
    expect(dryGain.connections.some((entry) => entry.target === masterGain)).toBe(false)
    expect(wetGain.connections.some((entry) => entry.target === masterGain)).toBe(false)
    expect(loudnessIn.connections.some((entry) => entry.target === loudnessTrim)).toBe(true)
    expect(loudnessTrim.connections.some((entry) => entry.target === graph.context.compressors[0])).toBe(true)
    expect(graph.context.compressors[0].connections.some((entry) => entry.target === masterGain)).toBe(true)

    expect(graph.setLoudness({ enabled: true, trim: 0.5 })).toBe(true)
    expect(graph.getLoudness()).toMatchObject({ enabled: true, trim: 0.5, supportsCompressor: true })
    expect(loudnessTrim.gain.value).toBe(0.5)

    // 关掉只是回到 1 倍直通，不拆链路，避免频繁重连
    expect(graph.setLoudness({ enabled: false })).toBe(true)
    expect(loudnessTrim.gain.value).toBe(1)
    expect(graph.getLoudness().enabled).toBe(false)
  })

  it('均衡与响度同时开启时顺序固定：均衡 → 响度 → 总音量', () => {
    const graph = createSpatialAudioGraph({}, fakeContextFactory())
    expect(graph.supportsEqualizer()).toBe(true)
    expect(graph.supportsLoudness()).toBe(true)
    const lastFilter = graph.context.filters[graph.context.filters.length - 1]
    const loudnessIn = graph.context.gains[graph.context.gains.length - 2]
    expect(lastFilter.connections.some((entry) => entry.target === loudnessIn)).toBe(true)
  })

  it('没有 DynamicsCompressor 时降级为纯增益补偿，不报错', () => {
    const graph = createSpatialAudioGraph({}, fakeContextFactory({ withCompressor: false, withBiquad: false }))
    expect(graph.supportsEqualizer()).toBe(false)
    expect(graph.supportsLoudness()).toBe(true)
    expect(graph.setLoudness({ enabled: true, trim: 1.5 })).toBe(true)
    expect(graph.getLoudness().supportsCompressor).toBe(false)
    const [, dryGain, wetGain, masterGain] = graph.context.gains
    // 没有均衡时 dry/wet 直接进响度级
    expect(dryGain.connections.some((entry) => entry.target === masterGain)).toBe(false)
    expect(wetGain.connections.some((entry) => entry.target === masterGain)).toBe(false)
  })
})

describe('空间音效工具', () => {
  it('只允许同源和本地 Blob 音频接入 Web Audio', () => {
    const origin = 'https://music-holo.example/home'
    expect(isSpatialAudioUrl('/audio/song1.wav', origin)).toBe(true)
    expect(isSpatialAudioUrl('blob:https://music-holo.example/track-1', origin)).toBe(true)
    expect(isSpatialAudioUrl('https://cdn.example/song.wav', origin)).toBe(false)
    expect(isSpatialAudioUrl('data:audio/wav;base64,AAAA', origin)).toBe(false)
    expect(isSpatialAudioUrl('', origin)).toBe(false)
  })

  it('音频上下文被浏览器挂起后可以重新拉起（后台标签页回来不会只走进度不出声）', async () => {
    class FakeContext {
      constructor() {
        this.currentTime = 0
        this.state = 'suspended'
        this.destination = {}
        this.resumeCalls = 0
        this.failResume = false
      }
      createMediaElementSource() { return { connect () {} } }
      createChannelSplitter() { return { connect () {} } }
      createPanner() { return { connect () {}, positionX: { setValueAtTime () {} } } }
      createGain() { return { connect () {}, gain: { value: 1, setTargetAtTime () {} } } }
      resume() {
        this.resumeCalls += 1
        if (this.failResume) return Promise.reject(new Error('blocked'))
        this.state = 'running'
        return Promise.resolve()
      }
      close() {
        this.state = 'closed'
        return Promise.resolve()
      }
    }

    const graph = createSpatialAudioGraph({}, FakeContext)
    expect(graph.state).toBe('suspended')
    expect(await graph.resume()).toBe(true)
    expect(graph.state).toBe('running')
    // 已经在跑了就不需要再 resume，避免无意义的调用与手势消耗。
    expect(await graph.resume()).toBe(false)
    expect(graph.context.resumeCalls).toBe(1)

    graph.context.state = 'suspended'
    graph.context.failResume = true
    expect(await graph.resume()).toBe(false)
    await graph.close()
    expect(graph.state).toBe('closed')
    // 关闭后的上下文不能再被拉起。
    expect(await graph.resume()).toBe(false)
  })

  it('建立左右 HRTF 虚拟声场，并可平滑开关与控制总音量', async () => {
    class FakeParam {
      constructor(value = 0) { this.value = value }
      setValueAtTime(value) { this.value = value }
      setTargetAtTime(value) { this.value = value }
    }
    class FakeNode {
      constructor() { this.connections = [] }
      connect(target, ...args) { this.connections.push({ target, args }) }
    }
    class FakeGain extends FakeNode {
      constructor() {
        super()
        this.gain = new FakeParam(1)
      }
    }
    class FakePanner extends FakeNode {
      constructor() {
        super()
        this.positionX = new FakeParam()
        this.positionY = new FakeParam()
        this.positionZ = new FakeParam()
      }
    }
    class FakeContext {
      constructor() {
        this.currentTime = 2
        this.state = 'running'
        this.destination = new FakeNode()
        this.gains = []
        this.panners = []
        this.mediaSource = null
      }
      createMediaElementSource(element) {
        this.mediaSource = new FakeNode()
        this.mediaSource.mediaElement = element
        return this.mediaSource
      }
      createChannelSplitter() { return new FakeNode() }
      createPanner() {
        const panner = new FakePanner()
        this.panners.push(panner)
        return panner
      }
      createGain() {
        const gain = new FakeGain()
        this.gains.push(gain)
        return gain
      }
      close() {
        this.state = 'closed'
        return Promise.resolve()
      }
    }

    const mediaElement = {}
    const graph = createSpatialAudioGraph(mediaElement, FakeContext)
    const [spatialBus, dryGain, wetGain, masterGain] = graph.context.gains

    expect(graph.context.mediaSource.mediaElement).toBe(mediaElement)
    expect(graph.context.panners).toHaveLength(2)
    expect(graph.context.panners.map((panner) => panner.panningModel)).toEqual(['HRTF', 'HRTF'])
    expect(graph.context.panners.map((panner) => panner.positionX.value)).toEqual([-0.42, 0.42])
    expect(spatialBus.connections).toHaveLength(1)

    graph.setEnabled(true)
    expect(dryGain.gain.value).toBeCloseTo(0.72)
    expect(wetGain.gain.value).toBeCloseTo(0.28)
    graph.setVolume(0.4)
    expect(masterGain.gain.value).toBeCloseTo(0.4)
    graph.setEnabled(false)
    expect(dryGain.gain.value).toBe(1)
    expect(wetGain.gain.value).toBe(0)

    await graph.close()
    expect(graph.context.state).toBe('closed')
  })
})
