import { describe, expect, it } from 'vitest'
import { pageSelectionState, togglePageSelection, toggleSongSelection } from '@/utils/songSelection'

const song = (id, title) => ({ id, title })

describe('歌曲库跨页选择', () => {
  it('翻页后保留已选曲目，再选另一页不会清掉上一页', () => {
    const pageOne = [song(4, '极光列车'), song(1, '霓虹海')]
    const pageTwo = [song(5, '玻璃糖纸'), song(8, '幻境漫游')]
    let selected = toggleSongSelection([], pageOne[0])
    selected = toggleSongSelection(selected, pageTwo[0])

    expect(selected.map((item) => item.id)).toEqual([4, 5])
    expect(pageSelectionState(selected, pageTwo)).toEqual({ all: false, indeterminate: true })
    expect(pageSelectionState(selected, pageOne)).toEqual({ all: false, indeterminate: true })
  })

  it('取消本页只移除本页，字符串和数字 id 视为同一首歌', () => {
    const selected = [song(4, '极光列车'), song('5', '玻璃糖纸')]
    const next = togglePageSelection(selected, [song('4', '极光列车')])
    expect(next.map((item) => item.id)).toEqual(['5'])
  })

  it('本页未全选时补齐，空页不改动选择', () => {
    const selected = togglePageSelection([song(4, '极光列车')], [song(4, '极光列车'), song(1, '霓虹海')])
    expect(selected.map((item) => item.id)).toEqual([4, 1])
    expect(togglePageSelection(selected, [])).toEqual(selected)
    expect(pageSelectionState(selected, [song(4, '极光列车'), song(1, '霓虹海')]).all).toBe(true)
  })
})
