import { describe, expect, it } from 'vitest'
import { createOnlineQueueReference, isOnlineQueueReferenceExpired } from '@/utils/onlineQueue'

describe('online queue references', () => {
  it('keeps platform identity and short-lived resolved URL separately', () => {
    const ref = createOnlineQueueReference({ platform: 'wy', name: '甲乙丙丁', musicInfo: { id: '3399839173' } }, {
      sourceId: 'xinghai', audioUrl: 'https://cdn.test/temp', audioExpiresAt: 2000, resolvedAt: 1000
    })
    expect(ref).toMatchObject({ platform: 'wy', platformTrackId: '3399839173', sourceId: 'xinghai', audioExpiresAt: 2000 })
    expect(isOnlineQueueReferenceExpired(ref, 1999)).toBe(false)
    expect(isOnlineQueueReferenceExpired(ref, 2000)).toBe(true)
  })

  it('supports platform-specific IDs when id is absent', () => {
    expect(createOnlineQueueReference({ platform: 'kw', musicInfo: { songmid: 'abc' } }).platformTrackId).toBe('abc')
  })
})
