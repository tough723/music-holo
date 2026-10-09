import { describe, expect, it } from 'vitest'
import { supportsPersistentFileHandles } from '@/utils/localLibrary'
import { demoAudioPath, isOwnDemoAudioUrl } from '@/utils/demoAudioCache'

describe('本机句柄与演示音频缓存边界', () => {
  it('只在浏览器同时提供选择器和 IndexedDB 时声明可记住句柄', () => {
    expect(typeof supportsPersistentFileHandles()).toBe('boolean')
  })

  it('只接受同源 /audio 演示文件', () => {
    const base = 'https://music.example/'
    expect(isOwnDemoAudioUrl('/audio/song1.wav', base)).toBe(true)
    expect(demoAudioPath('https://music.example/audio/song1.wav', base)).toBe('/audio/song1.wav')
    expect(isOwnDemoAudioUrl('https://cdn.example/audio/song1.wav', base)).toBe(false)
    expect(isOwnDemoAudioUrl('blob:https://music.example/123', base)).toBe(false)
    expect(isOwnDemoAudioUrl('/profile/upload/song1.wav', base)).toBe(false)
    expect(isOwnDemoAudioUrl('/audio/../secret.wav', base)).toBe(false)
    expect(isOwnDemoAudioUrl('/audio/song1.txt', base)).toBe(false)
  })
})
