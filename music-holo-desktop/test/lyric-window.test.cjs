/**
 * 桌面歌词窗的状态白名单：只接收展示所需字段，
 * 且歌词显示偏好（译文/字号/时间校准）与主窗口保持一致、非法值一律回落默认。
 */
'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { LyricWindowController, sanitizeLyricView } = require('../lyric-window.cjs')

test('歌词显示偏好只接受白名单取值，越界值被夹回', () => {
  assert.deepEqual(sanitizeLyricView(null), { showTranslation: true, fontSize: 'medium', offsetMs: 0 })
  assert.deepEqual(sanitizeLyricView({ fontSize: 'huge', offsetMs: 99999, showTranslation: false }), {
    showTranslation: false,
    fontSize: 'medium',
    offsetMs: 5000
  })
  assert.deepEqual(sanitizeLyricView({ fontSize: 'small', offsetMs: -99999 }), {
    showTranslation: true,
    fontSize: 'small',
    offsetMs: -5000
  })
})

test('推送给歌词窗的状态只保留展示字段，并带上歌词显示偏好', () => {
  const controller = Object.create(LyricWindowController.prototype)
  const state = controller.sanitize({
    title: '霓虹海',
    singer: '演示歌手',
    cover: 'https://example.com/cover.jpg',
    playing: true,
    currentTime: 12.5,
    duration: 240,
    lyrics: [{ time: 1, text: '第一行' }],
    translations: [{ time: 1, text: 'line one' }],
    lyricView: { showTranslation: false, fontSize: 'large', offsetMs: 500 },
    // 下面这些绝不能进歌词窗
    audioUrl: 'https://example.com/secret.mp3',
    queue: [{ id: 1 }],
    token: 'secret'
  })
  assert.deepEqual(state, {
    title: '霓虹海',
    singer: '演示歌手',
    cover: 'https://example.com/cover.jpg',
    playing: true,
    currentTime: 12.5,
    duration: 240,
    lyrics: [{ time: 1, text: '第一行' }],
    translations: [{ time: 1, text: 'line one' }],
    lyricView: { showTranslation: false, fontSize: 'large', offsetMs: 500 }
  })
})

test('非 https 封面与非法的歌词数组都会被丢弃', () => {
  const controller = Object.create(LyricWindowController.prototype)
  const state = controller.sanitize({ cover: 'http://example.com/a.jpg', lyrics: 'not-an-array', translations: 'x' })
  assert.equal(state.cover, '')
  assert.deepEqual(state.lyrics, [])
  assert.deepEqual(state.translations, [])
})
