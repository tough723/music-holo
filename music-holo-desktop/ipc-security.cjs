function isAppDocument(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'app:' && url.host === 'music-holo' && !url.username && !url.password && url.pathname === '/'
  } catch { return false }
}
function assertTrustedSender(event, window) {
  if (!window || window.isDestroyed() || event.sender !== window.webContents ||
      !event.senderFrame || event.senderFrame !== window.webContents.mainFrame || !isAppDocument(event.senderFrame.url)) {
    throw new Error('拒绝非应用主页面的桌面桥调用')
  }
}
module.exports = { isAppDocument, assertTrustedSender }
