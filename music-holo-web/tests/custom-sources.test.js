import { describe, expect, it } from 'vitest'
import {
  CUSTOM_SOURCE_STORAGE_KEY,
  MAX_CUSTOM_SOURCE_BYTES,
  MAX_CUSTOM_SOURCES,
  formatSourceSize,
  parseCustomSourceFile,
  parseCustomSourceUrl,
  readCustomSources,
  sourceFileNameFromUrl,
  writeCustomSources
} from '@/utils/customSources'

class MemoryStorage {
  values = new Map()

  getItem(key) { return this.values.get(key) ?? null }
  setItem(key, value) { this.values.set(key, String(value)) }
}

const sampleScript = `/**
 * @name 野花测试源
 * @version 1.2.0
 * @description 本地导入测试
 * @author Music Holo QA
 * @homepage https://example.org/flower
 */
throw new Error('导入脚本不应执行')
`

describe('自定义音源安全导入与本地管理', () => {
  it('只读取脚本头部元数据，不执行源代码', () => {
    const source = parseCustomSourceFile('flower.js', sampleScript, '2026-10-09T00:00:00.000Z')
    expect(source).toMatchObject({
      name: '野花测试源',
      version: '1.2.0',
      description: '本地导入测试',
      author: 'Music Holo QA',
      homepage: 'https://example.org/flower',
      fileName: 'flower.js',
      importedAt: '2026-10-09T00:00:00.000Z'
    })
    expect(source.script).toContain("throw new Error('导入脚本不应执行')")
  })

  it('只把公网 HTTPS 源主页作为链接元数据保存', () => {
    const source = parseCustomSourceFile('unsafe.js', `/**\n * @name 未验证源\n * @homepage javascript:alert(1)\n */\nexport default {}`)
    expect(source.homepage).toBe('')
  })

  it('允许缺少头部标签并以文件名作为展示名', () => {
    const source = parseCustomSourceFile('/downloads/my-source.mjs', 'export default {}')
    expect(source.name).toBe('my-source')
    expect(source.version).toBe('未标注')
    expect(source.description).toBe('')
  })

  it('拒绝非脚本、空文件和超出 128 KB 的源文件', () => {
    expect(() => parseCustomSourceFile('source.json', '{}')).toThrow('仅支持导入')
    expect(() => parseCustomSourceFile('empty.js', '  \n')).toThrow('文件为空')
    expect(() => parseCustomSourceFile('large.js', 'x'.repeat(MAX_CUSTOM_SOURCE_BYTES + 1))).toThrow('不能超过 128 KB')
  })

  it('本机列表可以读写并保留用户排序', () => {
    const storage = new MemoryStorage()
    const first = parseCustomSourceFile('first.js', '// first')
    const second = parseCustomSourceFile('second.js', '// second')
    expect(writeCustomSources([second, first], storage, CUSTOM_SOURCE_STORAGE_KEY)).toBe(true)
    expect(readCustomSources(storage, CUSTOM_SOURCE_STORAGE_KEY).map((item) => item.name)).toEqual(['second', 'first'])
  })

  it('损坏的存储数据安全回退为空列表，写入超过上限会被拒绝', () => {
    const storage = new MemoryStorage()
    storage.setItem(CUSTOM_SOURCE_STORAGE_KEY, '{broken')
    expect(readCustomSources(storage)).toEqual([])
    const source = parseCustomSourceFile('only.js', '// source')
    expect(writeCustomSources(Array.from({ length: MAX_CUSTOM_SOURCES + 1 }, () => source), storage)).toBe(false)
  })

  it('对受损或超限的已存源执行过滤', () => {
    const storage = new MemoryStorage()
    storage.setItem(CUSTOM_SOURCE_STORAGE_KEY, JSON.stringify([
      { id: 'bad', name: 'bad', fileName: 'bad.js', script: 'x'.repeat(MAX_CUSTOM_SOURCE_BYTES + 1) },
      { id: 'good', name: 'good', fileName: 'good.js', script: '// ok' }
    ]))
    expect(readCustomSources(storage).map((item) => item.id)).toEqual(['good'])
  })

  it('读取本地存储时规范化元数据并移除不安全的源主页', () => {
    const storage = new MemoryStorage()
    const source = parseCustomSourceFile('saved.js', '// local')
    storage.setItem(CUSTOM_SOURCE_STORAGE_KEY, JSON.stringify([{ ...source, name: 'N'.repeat(120), homepage: 'https://127.0.0.1/admin' }]))
    const [restored] = readCustomSources(storage)
    expect(restored.name).toHaveLength(80)
    expect(restored.homepage).toBe('')
    expect(restored.sizeBytes).toBe(new TextEncoder().encode(source.script).byteLength)
  })

  it('远程导入只接受公网 HTTPS 地址并从路径生成脚本文件名', () => {
    const sourceUrl = parseCustomSourceUrl('https://cdn.example.org/music/flower%20source.js?version=1')
    expect(sourceUrl.hostname).toBe('cdn.example.org')
    expect(sourceFileNameFromUrl(sourceUrl)).toBe('flower source.js')
    expect(sourceFileNameFromUrl('https://cdn.example.org/latest')).toBe('latest.js')
    expect(() => parseCustomSourceUrl('http://cdn.example.org/source.js')).toThrow('HTTPS')
    expect(() => parseCustomSourceUrl('https://127.0.0.1/source.js')).toThrow('公网 HTTPS')
    expect(() => parseCustomSourceUrl('https://user:secret@cdn.example.org/source.js')).toThrow('公网 HTTPS')
    expect(() => parseCustomSourceUrl('https://music.local/source.js')).toThrow('公网 HTTPS')
  })

  it('格式化源文件大小', () => {
    expect(formatSourceSize(128)).toBe('128 B')
    expect(formatSourceSize(1536)).toBe('1.5 KB')
    expect(formatSourceSize(Number.NaN)).toBe('未知大小')
  })
})
