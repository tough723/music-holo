// 桌面系统集成（仅 Electron 桌面客户端可用）：
//   · 托盘与全局快捷键：只接收命令，播放动作在这里执行；
//   · 桌面歌词窗：把当前曲目与歌词推送过去（只推展示所需字段）；
//   · 本机开放 HTTP API：处理本机脚本/快捷键工具发来的命令；
//   · music-holo:// 启动参数：把链接翻译成站内导航意图。
//
// 所有能力默认关闭，需要用户在设置中心显式开启；本机 API 需要令牌，且只监听回环地址。

export function desktopIntegration() {
  const bridge = globalThis.musicHoloDesktop?.version ? globalThis.musicHoloDesktop : null
  return bridge?.integration || null
}

export function desktopLyricBridge() {
  const bridge = globalThis.musicHoloDesktop?.version ? globalThis.musicHoloDesktop : null
  return bridge?.lyric?.isWindow ? bridge.lyric : null
}

export const DESKTOP_COMMANDS = Object.freeze([
  'toggle', 'play', 'pause', 'next', 'prev', 'stop', 'volumeUp', 'volumeDown', 'show'
])

/**
 * 处理一个桌面命令（托盘/快捷键/歌词窗共用）。
 * @returns {boolean} 是否识别并执行了该命令
 */
export function runDesktopCommand(playerStore, command, payload = {}) {
  if (!playerStore) return false
  switch (command) {
    case 'toggle':
      if (playerStore.currentSong) playerStore.playing = !playerStore.playing
      return true
    case 'play':
      if (playerStore.currentSong) playerStore.playing = true
      return true
    case 'pause':
      playerStore.playing = false
      return true
    case 'next':
      playerStore.next()
      return true
    case 'prev':
      playerStore.prev()
      return true
    case 'stop':
      playerStore.playing = false
      return true
    case 'volumeUp':
      playerStore.setVolume(Math.min(1, (Number(playerStore.volume) || 0) + 0.05))
      return true
    case 'volumeDown':
      playerStore.setVolume(Math.max(0, (Number(playerStore.volume) || 0) - 0.05))
      return true
    default:
      return false
  }
}

/**
 * 过桥数据必须是可结构化克隆的纯数据。
 * Chromium（以及 Electron 的 contextBridge）会直接拒绝 Vue 的响应式 Proxy，
 * 抛 DataCloneError: An object could not be cloned，所以这里统一先转成纯 JSON。
 */
export function toBridgeData(value, fallback = null) {
  try {
    const plain = JSON.parse(JSON.stringify(value ?? null))
    return plain === null || plain === undefined ? fallback : plain
  } catch { return fallback }
}

/** 托盘显示与歌词窗所需的播放状态（不含任何凭据或后端数据，且保证可结构化克隆）。 */
export function collectDesktopState(playerStore) {
  const song = playerStore?.currentSong || null
  return {
    title: String(song?.title || ''),
    singer: String(song?.singerName || ''),
    album: String(song?.album || ''),
    cover: String(song?.cover || ''),
    playing: Boolean(playerStore?.playing),
    currentTime: Number(playerStore?.currentTime) || 0,
    duration: Number(playerStore?.duration) || 0,
    lyrics: toBridgeData(Array.isArray(playerStore?.lyrics) ? playerStore.lyrics : [], []),
    translations: toBridgeData(Array.isArray(playerStore?.lyricTranslations) ? playerStore.lyricTranslations : [], [])
  }
}

/**
 * 绑定桌面集成：托盘/快捷键命令、歌词状态推送、本机 API 请求、启动参数。
 * @returns {() => void} 解绑函数
 */
export function bindDesktopIntegration({ playerStore, router, integration = desktopIntegration() }) {
  if (!integration || !playerStore) return () => {}
  const unbinds = []

  unbinds.push(integration.onCommand(({ command } = {}) => {
    if (typeof command === 'string') runDesktopCommand(playerStore, command)
  }))

  let lastSignature = ''
  const pushState = () => {
    const state = collectDesktopState(playerStore)
    // 播放进度每 0.5 秒才算一次变化，避免高频 IPC。
    const signature = `${state.title}|${state.playing}|${Math.floor(state.currentTime * 2)}|${state.lyrics.length}`
    if (signature === lastSignature) return
    lastSignature = signature
    integration.pushLyricState(state).catch(() => {})
  }
  const timer = setInterval(pushState, 500)
  unbinds.push(() => clearInterval(timer))

  unbinds.push(integration.onApi(async ({ id, command, payload } = {}) => {
    try {
      const result = await runApiCommand(command, payload, { playerStore, router })
      integration.respondApi({ id, result: toBridgeData(result) })
    } catch (error) {
      integration.respondApi({ id, error: String(error?.message || error) })
    }
  }))

  if (router) {
    unbinds.push(integration.onDeepLink((link) => {
      const target = deepLinkToRoute(link)
      if (target) router.push(target).catch(() => {})
    }))
  }

  return () => {
    for (const unbind of unbinds) {
      try { unbind?.() } catch { /* 解绑失败不影响退出 */ }
    }
  }
}

/** music-holo:// 意图 → 站内路由。无法识别返回 null。 */
export function deepLinkToRoute(link) {
  if (!link || typeof link !== 'object') return null
  const { action, params } = link
  if (action === 'search') return { path: '/search', query: { q: String(params?.q || '') } }
  if (action === 'import') return { path: '/import', query: { link: String(params?.url || params?.link || '') } }
  if (action === 'lyrics') return { path: '/lyrics' }
  if (action === 'open') {
    const path = String(params?.path || '')
    return /^\/[A-Za-z0-9/_-]*$/.test(path) ? { path } : null
  }
  if (action === 'play') {
    const id = String(params?.id || '')
    return id ? { path: '/songs', query: { play: id } } : null
  }
  return null
}

/**
 * 本机 HTTP API 的命令实现。只读命令返回状态，写命令执行播放动作。
 * 不会返回任何凭据、Cookie 或音源脚本内容。
 */
export async function runApiCommand(command, payload = {}, { playerStore, router, searchApi } = {}) {
  const song = playerStore?.currentSong || null
  switch (command) {
    case 'status':
      return {
        playing: Boolean(playerStore?.playing),
        volume: Number(playerStore?.volume) || 0,
        mode: playerStore?.mode || '',
        currentTime: Number(playerStore?.currentTime) || 0,
        duration: Number(playerStore?.duration) || 0,
        queueLength: playerStore?.queue?.length || 0,
        song: song ? {
          id: song.id, title: song.title, singerName: song.singerName, album: song.album,
          cover: song.cover, isCustomSource: Boolean(song.isCustomSource)
        } : null
      }
    case 'queue':
      return (playerStore?.queue || []).map((item, index) => ({
        index,
        id: item.id,
        title: item.title,
        singerName: item.singerName,
        current: index === playerStore?.currentIndex
      }))
    case 'toggle':
    case 'play':
    case 'pause':
    case 'next':
    case 'prev':
    case 'stop':
    case 'volumeUp':
    case 'volumeDown': {
      const ok = runDesktopCommand(playerStore, command)
      if (!ok) throw new Error(`未知命令：${command}`)
      return { command }
    }
    case 'volume': {
      const value = Number(payload?.value)
      if (!Number.isFinite(value)) throw new Error('volume 需要 0–1 之间的数值')
      playerStore.setVolume(Math.max(0, Math.min(1, value)))
      return { volume: playerStore.volume }
    }
    case 'seek': {
      const seconds = Number(payload?.seconds)
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error('seek 需要非负秒数')
      playerStore.currentTime = Math.min(seconds, Number(playerStore.duration) || seconds)
      return { currentTime: playerStore.currentTime }
    }
    case 'lyrics':
      return {
        lines: toBridgeData(playerStore?.lyrics || [], []),
        translations: toBridgeData(playerStore?.lyricTranslations || [], []),
        romaji: toBridgeData(playerStore?.lyricRomaji || [], [])
      }
    case 'search': {
      const keyword = String(payload?.keyword || payload?.q || '').trim().slice(0, 80)
      if (!keyword) throw new Error('search 需要 keyword')
      const api = searchApi || (await import('@/api/search')).default?.search || (await import('@/api/search')).search
      const data = await api(keyword, Math.max(1, Math.min(30, Number(payload?.limit) || 8)))
      return data?.data ?? data ?? null
    }
    case 'navigate': {
      if (!router) throw new Error('当前环境不支持导航')
      const target = deepLinkToRoute({ action: 'open', params: { path: String(payload?.path || '') } })
      if (!target) throw new Error('navigate 需要一个合法的站内路径')
      await router.push(target)
      return { path: target.path }
    }
    default:
      throw new Error(`未知命令：${command}`)
  }
}
