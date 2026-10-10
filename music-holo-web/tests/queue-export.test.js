import { describe, expect, it } from 'vitest'
import { formatQueueAsM3u, formatQueueAsText, queueExportFileName } from '../src/utils/queueExport.js'

const song = (id, title, extra = {}) => ({
  id,
  title,
  singerName: '演示歌手',
  duration: 240,
  audioUrl: `https://cdn.example.com/audio/${id}.mp3`,
  ...extra
})

describe('队列导出', () => {
  it('文本清单是「序号. 歌名 — 歌手」，缺歌手就只写歌名', () => {
    const text = formatQueueAsText([song(1, '霓虹海'), song(2, '云端信使')])
    expect(text).toBe('1. 霓虹海 — 演示歌手\n2. 云端信使 — 演示歌手')
    expect(formatQueueAsText([{ title: '无人声', name: '' }])).toBe('1. 无人声')
    expect(formatQueueAsText([{ name: '备用名' }])).toBe('1. 备用名')
    expect(formatQueueAsText([])).toBe('')
    expect(formatQueueAsText(null)).toBe('')
    expect(formatQueueAsText([null, { title: 'A' }])).toBe('1. A') // 空位跳过，序号连续
  })

  it('m3u8 只写能再次打开的网络地址，其余如实跳过', () => {
    const result = formatQueueAsM3u([
      song(1, '霓虹海'),
      { ...song(2, '本地文件'), audioUrl: 'blob:http://localhost/123', isLocal: true },
      { ...song(3, '自定义源'), isCustomSource: true },
      { ...song(4, '没有地址'), audioUrl: '' },
      song(5, '相对地址', { audioUrl: '/audio/5.mp3' }) // 同源相对地址也算能导出
    ])
    expect(result.exported).toBe(2)
    expect(result.skipped).toBe(3)
    expect(result.content.startsWith('#EXTM3U\n')).toBe(true)
    expect(result.content).toContain('#EXTINF:240,演示歌手 - 霓虹海')
    expect(result.content).toContain('https://cdn.example.com/audio/1.mp3')
    expect(result.content).toContain('/audio/5.mp3')
    expect(result.content).not.toContain('blob:')
    expect(formatQueueAsM3u([]).exported).toBe(0)
    expect(formatQueueAsM3u(null).content).toBe('#EXTM3U\n')
  })

  it('无时长时 EXTINF 记为 0，文件名带时间不互相覆盖', () => {
    const result = formatQueueAsM3u([{ title: 'A', audioUrl: 'https://x.test/a.mp3' }])
    expect(result.content).toContain('#EXTINF:0,A')
    expect(queueExportFileName(new Date(2026, 9, 10, 9, 5))).toBe('music-holo-队列-20261010-0905.m3u8')
    expect(queueExportFileName(new Date(2026, 9, 10, 21, 30))).not.toBe(queueExportFileName(new Date(2026, 9, 10, 9, 5)))
    expect(queueExportFileName('坏日期')).toMatch(/^music-holo-队列-\d{8}-\d{4}\.m3u8$/)
  })
})
