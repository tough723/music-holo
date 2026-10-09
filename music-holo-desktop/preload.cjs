const { contextBridge, ipcRenderer } = require('electron')
// No raw IPC, filesystem, Node, shell, or bridge in child frames / source workers.
if (process.isMainFrame) contextBridge.exposeInMainWorld('musicHoloDesktop', Object.freeze({
  version: '0.1.0',
  openSourceSession: (name) => ipcRenderer.invoke('source:open', name),
  closeSourceSession: (id) => ipcRenderer.invoke('source:close', id),
  request: (sessionId, requestId, url, options) => ipcRenderer.invoke('source:request', sessionId, requestId, url, options),
  cancel: (sessionId, requestId) => ipcRenderer.invoke('source:cancel', sessionId, requestId),
  media: (url) => ipcRenderer.invoke('source:media', url),
  download: Object.freeze({
    pickDirectory: () => ipcRenderer.invoke('download:pickDirectory'),
    pickPath: (fileName) => ipcRenderer.invoke('download:pickPath', fileName),
    start: (job) => ipcRenderer.invoke('download:start', job),
    cancel: (id) => ipcRenderer.invoke('download:cancel', id),
    show: (target) => ipcRenderer.invoke('download:show', target),
    openPath: (target) => ipcRenderer.invoke('download:openPath', target),
    // 下载进度由主进程推送，渲染进程只读，不能反过来驱动网络层。
    onEvent: (listener) => {
      const wrapped = (_event, payload) => listener(payload)
      ipcRenderer.on('download:event', wrapped)
      return () => ipcRenderer.removeListener('download:event', wrapped)
    }
  }),
}))
