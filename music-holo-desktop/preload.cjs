const { contextBridge, ipcRenderer } = require('electron')
// No raw IPC, filesystem, Node, shell, or bridge in child frames / source workers.
if (process.isMainFrame) contextBridge.exposeInMainWorld('musicHoloDesktop', Object.freeze({
  version: '0.1.0',
  openSourceSession: (name) => ipcRenderer.invoke('source:open', name),
  closeSourceSession: (id) => ipcRenderer.invoke('source:close', id),
  request: (sessionId, requestId, url, options) => ipcRenderer.invoke('source:request', sessionId, requestId, url, options),
  cancel: (sessionId, requestId) => ipcRenderer.invoke('source:cancel', sessionId, requestId),
  media: (url) => ipcRenderer.invoke('source:media', url),
}))
