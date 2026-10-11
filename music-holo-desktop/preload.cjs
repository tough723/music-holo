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
  // ---- 桌面系统集成：托盘 / 全局快捷键 / 桌面歌词窗 / 本机 API / 启动参数 ----
  // 全部只在主窗口生效；歌词窗通过 lyric.isWindow 判断自身身份。
  integration: Object.freeze({
    get: () => ipcRenderer.invoke('integration:get'),
    configure: (patch) => ipcRenderer.invoke('integration:configure', patch),
    regenerateToken: () => ipcRenderer.invoke('integration:regenerateToken'),
    pushLyricState: (state) => ipcRenderer.invoke('integration:lyricState', state),
    setLyricOptions: (options) => ipcRenderer.invoke('integration:lyricOptions', options),
    respondApi: (message) => ipcRenderer.invoke('integration:apiRespond', message),
    probeShortcut: (accelerator) => ipcRenderer.invoke('integration:shortcutProbe', accelerator),
    onCommand: (listener) => {
      const wrapped = (_event, message) => listener(message || {})
      ipcRenderer.on('desktop:command', wrapped)
      return () => ipcRenderer.removeListener('desktop:command', wrapped)
    },
    onApi: (listener) => {
      const wrapped = (_event, message) => listener(message || {})
      ipcRenderer.on('desktop:api', wrapped)
      return () => ipcRenderer.removeListener('desktop:api', wrapped)
    },
    onDeepLink: (listener) => {
      const wrapped = (_event, link) => listener(link)
      ipcRenderer.on('desktop:deep-link', wrapped)
      return () => ipcRenderer.removeListener('desktop:deep-link', wrapped)
    }
  }),
  lyric: Object.freeze({
    isWindow: !process.isMainFrame,
    onState: (listener) => {
      const wrapped = (_event, state) => listener(state || {})
      ipcRenderer.on('lyric:state', wrapped)
      return () => ipcRenderer.removeListener('lyric:state', wrapped)
    },
    sendCommand: (command, payload) => ipcRenderer.send('lyric:command', { command, payload })
  }),
}))
