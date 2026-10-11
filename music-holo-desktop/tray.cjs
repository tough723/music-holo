// 系统托盘：只用文字/菜单控制播放，不读取任何媒体内容，也不常驻后台下载。
// 托盘只发出意图（播放/暂停/上下首/显示/退出），真正的播放状态由渲染进程回传。
const path = require('node:path')
const fs = require('node:fs')

const COMMANDS = ['toggle', 'next', 'prev', 'show', 'quit']

/** 图标缺失时不能让客户端崩溃，回退到空图标（系统托盘仍可用）。 */
function resolveIcon(app) {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'icon.png')]
    : [path.resolve(__dirname, '../assets/tray.png'), path.resolve(__dirname, '../build/icon.png')]
  for (const file of candidates) {
    try {
      if (fs.statSync(file).isFile()) return file
    } catch { /* 继续尝试下一个候选 */ }
  }
  return null
}

class TrayController {
  /** @param {object} options.electron 注入的 Electron 接口，便于在纯 Node 下用桩测试。 */
  constructor({ electron, onCommand }) {
    this.electron = electron || require('electron')
    this.onCommand = onCommand || (() => {})
    this.tray = null
    this.state = { title: '未在播放', playing: false }
  }

  get enabled() {
    return Boolean(this.tray)
  }

  enable() {
    if (this.tray) return true
    const { Tray, nativeImage } = this.electron
    if (typeof Tray !== 'function') return false
    const icon = resolveIcon(this.electron.app)
    try {
      // 图标缺失时用系统默认的空图像，而不是随便找一个文件充当图标。
      this.tray = icon ? new Tray(icon) : new Tray(nativeImage.createEmpty())
    } catch {
      return false
    }
    this.tray.setToolTip('Music Holo')
    this.refresh()
    return true
  }

  disable() {
    if (!this.tray) return
    this.tray.destroy()
    this.tray = null
  }

  update(state = {}) {
    this.state = { ...this.state, ...state }
    this.refresh()
  }

  refresh() {
    if (!this.tray) return
    const { title, singer, playing } = this.state
    const label = title && title !== '未在播放' ? `${title}${singer ? ` · ${singer}` : ''}` : '未在播放'
    this.tray.setToolTip(`Music Holo · ${label}`.slice(0, 120))
    const send = (command) => () => this.onCommand(command, this.state)
    const menu = this.electron.Menu.buildFromTemplate([
      { label, enabled: false },
      { type: 'separator' },
      { label: playing ? '暂停' : '播放', click: send('toggle') },
      { label: '上一首', click: send('prev') },
      { label: '下一首', click: send('next') },
      { type: 'separator' },
      { label: '显示主窗口', click: send('show') },
      { label: '退出', click: send('quit') }
    ])
    this.tray.setContextMenu(menu)
  }
}

module.exports = { TrayController, TRAY_COMMANDS: COMMANDS }
