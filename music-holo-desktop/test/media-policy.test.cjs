const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mediaRange, mediaContentType } = require('../media-policy.cjs')
test('validates single normal, suffix and open-ended byte ranges', () => {
  assert.equal(mediaRange(null), undefined)
  for (const range of ['bytes=0-0', 'bytes=0-', 'bytes=-1024', 'bytes=2-9']) assert.equal(mediaRange(range), range)
  for (const range of ['bytes=-', 'bytes=-0', 'bytes=5-2', 'bytes=0-1,3-4', 'items=0-2', 'bytes=9007199254740992-', 'bytes=NaN-1', 'bytes=0-1\r\n']) assert.throws(() => mediaRange(range), undefined, range)
})
test('rejects active document MIME types on the application origin', () => {
  assert.equal(mediaContentType('Audio/MPEG; charset=binary'), 'audio/mpeg')
  assert.equal(mediaContentType('image/webp'), 'image/webp')
  assert.equal(mediaContentType(undefined), 'application/octet-stream')
  for (const type of ['image/svg+xml', 'text/html', 'application/xhtml+xml', 'text/javascript', 'application/json']) assert.throws(() => mediaContentType(type), undefined, type)
})
