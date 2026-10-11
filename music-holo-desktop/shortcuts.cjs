// 全局快捷键：只注册媒体键与用户显式配置的组合键，默认不抢占用其它软件的快捷键。
// 快捷键同样只发出意图命令，播放动作由渲染进程执行。

const MEDIA_KEYS = Object.freeze({
  MediaPlayPause: 'toggle',
  MediaNextTrack: 'next',
  MediaPreviousTrack: 'prev',
  MediaStop: 'stop'
})

const COMMANDS = Object.freeze(['toggle', 'next', 'prev', 'stop', 'volumeUp', 'volumeDown', 'show'])

/** 校验 Electron 加速器字符串，避免把任意字符串注册成快捷键。 */
function isValidAccelerator(value) {
  const text = String(value || '').trim()
  if (!text || text.length > 64) return false
  const parts = text.split('+').map((part) => part.trim())
  if (parts.length > 4) return false
  const last = parts.at(-1)
  return /^(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|Space|Up|Down|Left|Right|Home|End|PageUp|PageDown|Plus|Minus|VolumeUp|VolumeDown|VolumeMute|MediaPlayPause|MediaNextTrack|MediaPreviousTrack|MediaStop|Escape|Enter|Tab|Backspace|Delete|Insert|Num\d)$/i.test(last)
}

class ShortcutController {
  /**
   * @param {object} options
   * @param {(command, accelerator) => void} options.onCommand
   * @param {object} [options.globalShortcut] 可注入的实现（ Electron 在测试环境不可用时用桩替代）
   */
  constructor({ onCommand, globalShortcut: shortcutApi }) {
    this.onCommand = onCommand || (() => {})
    // 延迟获取 Electron 的 globalShortcut，便于在纯 Node 下用注入的桩做单元测试。
    this.globalShortcut = shortcutApi || require('electron').globalShortcut
    this.registered = new Map()
  }

  /** 媒体键默认开启；自定义组合键只在用户配置后启用。 */
  apply({ mediaKeys = true, custom = {} } = {}) {
    this.unregisterAll()
    if (mediaKeys) {
      for (const [accelerator, command] of Object.entries(MEDIA_KEYS)) {
        this.register(accelerator, command)
      }
    }
    for (const [command, accelerator] of Object.entries(custom || {})) {
      if (!COMMANDS.includes(command) || !isValidAccelerator(accelerator)) continue
      this.register(String(accelerator).trim(), command)
    }
    return this.list()
  }

  register(accelerator, command) {
    if (this.registered.has(accelerator)) return false
    const ok = this.globalShortcut.register(accelerator, () => this.onCommand(command, accelerator))
    if (ok) this.registered.set(accelerator, command)
    return ok
  }

  list() {
    return [...this.registered.entries()].map(([accelerator, command]) => ({ accelerator, command }))
  }

  unregisterAll() {
    for (const accelerator of this.registered.keys()) this.globalShortcut.unregister(accelerator)
    this.registered.clear()
  }
}

module.exports = { ShortcutController, MEDIA_KEYS, isValidAccelerator, SHORTCUT_COMMANDS: COMMANDS }
