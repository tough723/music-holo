// 桌面歌词窗：独立、无边框、置顶、可穿透点击的歌词窗口。
// 它不直接访问播放器状态——主窗口把当前曲目与歌词通过主进程转发的 JSON 推过来，
// 歌词窗里的按钮也只回传命令，由主窗口执行。窗口内不加载任何第三方内容。
const path = require('node:path')

const DEFAULT_SIZE = { width: 900, height: 220 }

function defaultPosition(size, screen) {
  const area = screen.getPrimaryDisplay().workArea
  return {
    x: Math.round(area.x + (area.width - size.width) / 2),
    y: Math.round(area.y + area.height - size.height - 24)
  }
}

class LyricWindowController {
  constructor({ electron, onCommand, appUrl }) {
    this.electron = electron || require('electron')
    this.onCommand = onCommand || (() => {})
    this.appUrl = appUrl
    this.window = null
    this.state = null
    this.opacity = 1
    this.clickThrough = false
  }

  get isOpen() {
    return Boolean(this.window && !this.window.isDestroyed())
  }

  get screen() {
    return this.electron.screen
  }

  open() {
    if (this.isOpen) {
      this.window.focus()
      return true
    }
    if (typeof this.electron.BrowserWindow !== 'function') return false
    const size = DEFAULT_SIZE
    const position = this.defaultPosition(size)
    this.window = new this.electron.BrowserWindow({
      ...position,
      ...size,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      resizable: true,
      skipTaskbar: true,
      focusable: true,
      fullscreenable: false,
      minimizable: false,
      maximizable: false,
      title: 'Music Holo 桌面歌词',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        // 歌词窗只有自己的会话，与主窗口共享同一份持久化策略（不共享登录态）。
        partition: 'persist:music-holo-lyrics'
      }
    })
    this.window.setAlwaysOnTop(true, 'screen-saver')
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    this.window.on('closed', () => {
      this.window = null
      this.state = null
    })
    this.window.loadURL(`${this.appUrl}#/lyrics`)
    this.applyOptions()
    if (this.state) this.push(this.state)
    return true
  }

  close() {
    if (!this.isOpen) return
    this.window.destroy()
    this.window = null
  }

  /** 歌词窗只接收这些字段，避免把整个应用状态广播给另一个窗口。 */
  sanitize(state) {
    const source = state && typeof state === 'object' ? state : {}
    const lines = Array.isArray(source.lyrics) ? source.lyrics.slice(0, 400) : []
    return {
      title: String(source.title || '').slice(0, 120),
      singer: String(source.singer || '').slice(0, 120),
      cover: /^https:\/\//i.test(String(source.cover || '')) ? String(source.cover).slice(0, 600) : '',
      playing: Boolean(source.playing),
      currentTime: Number(source.currentTime) || 0,
      duration: Number(source.duration) || 0,
      lyrics: lines.map((line) => ({ time: Number(line?.time) || 0, text: String(line?.text || '').slice(0, 200) })),
      translations: Array.isArray(source.translations) ? source.translations.map((line) => ({ time: Number(line?.time) || 0, text: String(line?.text || '').slice(0, 200) })).slice(0, 400) : []
    }
  }

  push(rawState) {
    this.state = this.sanitize(rawState)
    if (!this.isOpen) return false
    this.window.webContents.send('lyric:state', this.state)
    return true
  }

  setOptions({ opacity, clickThrough } = {}) {
    if (opacity != null) {
      const value = Number(opacity)
      if (Number.isFinite(value)) this.opacity = Math.max(0.3, Math.min(1, value))
    }
    if (clickThrough != null) this.clickThrough = Boolean(clickThrough)
    this.applyOptions()
    return { opacity: this.opacity, clickThrough: this.clickThrough }
  }

  defaultPosition(size) {
    return defaultPosition(size, this.screen)
  }

  applyOptions() {
    if (!this.isOpen) return
    this.window.setOpacity(this.opacity)
    this.window.setIgnoreMouseEvents(this.clickThrough, { forward: true })
    this.window.setContentProtection(false)
  }
}

module.exports = { LyricWindowController, DEFAULT_SIZE }
