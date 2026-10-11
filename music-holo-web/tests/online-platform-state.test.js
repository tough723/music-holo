import { describe, expect, it } from 'vitest'
import { ONLINE_PLATFORMS, createOnlinePlatformResults, createOnlinePlatformStates } from '@/utils/onlinePlatformState'

describe('online platform search state', () => {
  it('declares the four realtime platform tabs in stable order', () => {
    expect(ONLINE_PLATFORMS.map(({ key }) => key)).toEqual(['wy', 'kw', 'kg', 'mg'])
  })

  it('creates isolated result and request state for every platform', () => {
    const results = createOnlinePlatformResults()
    const states = createOnlinePlatformStates()
    expect(Object.keys(results)).toEqual(['wy', 'kw', 'kg', 'mg'])
    expect(Object.values(results).every((value) => Array.isArray(value) && value.length === 0)).toBe(true)
    expect(states.wy).toEqual({ loading: false, loaded: false, error: '' })
    states.wy.loading = true
    expect(states.kw.loading).toBe(false)
  })
})
