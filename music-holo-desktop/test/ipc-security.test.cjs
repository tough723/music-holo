const { test } = require('node:test')
const assert = require('node:assert/strict')
const { isAppDocument, assertTrustedSender } = require('../ipc-security.cjs')
test('only the packaged app document is trusted, never media endpoints or remote origins', () => {
  assert.equal(isAppDocument('app://music-holo/#/settings'), true)
  for (const url of ['https://music-holo/', 'app://other/', 'app://music-holo/__source_media/token', 'app://user@music-holo/', 'app://music-holo:123/', 'about:srcdoc', 'file:///index.html', undefined]) assert.equal(isAppDocument(url), false, url)
})
test('IPC rejects child frames, other windows and destroyed windows', () => {
  const mainFrame = { url: 'app://music-holo/#/settings' }
  const contents = { mainFrame }
  const window = { webContents: contents, isDestroyed: () => false }
  const event = { sender: contents, senderFrame: mainFrame }
  assert.doesNotThrow(() => assertTrustedSender(event, window))
  assert.throws(() => assertTrustedSender({ ...event, sender: {} }, window))
  assert.throws(() => assertTrustedSender({ ...event, senderFrame: { url: mainFrame.url } }, window))
  assert.throws(() => assertTrustedSender({ sender: contents }, window))
  assert.throws(() => assertTrustedSender(event, { ...window, isDestroyed: () => true }))
  mainFrame.url = 'https://evil.example.com'
  assert.throws(() => assertTrustedSender(event, window))
})
