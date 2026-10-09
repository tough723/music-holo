import { describe, expect, it } from 'vitest'
import { createSpatialAudioGraph, isSpatialAudioUrl } from '../src/utils/spatialAudio.js'

describe('空间音效工具', () => {
  it('只允许同源和本地 Blob 音频接入 Web Audio', () => {
    const origin = 'https://music-holo.example/home'
    expect(isSpatialAudioUrl('/audio/song1.wav', origin)).toBe(true)
    expect(isSpatialAudioUrl('blob:https://music-holo.example/track-1', origin)).toBe(true)
    expect(isSpatialAudioUrl('https://cdn.example/song.wav', origin)).toBe(false)
    expect(isSpatialAudioUrl('data:audio/wav;base64,AAAA', origin)).toBe(false)
    expect(isSpatialAudioUrl('', origin)).toBe(false)
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
