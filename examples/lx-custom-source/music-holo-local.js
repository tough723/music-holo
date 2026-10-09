/**
 * @name Music Holo 授权直链源
 * @description 解析自有音频直链、封面与 LRC 歌词
 * @version 1.0.0
 * @author Music Holo
 * @homepage https://github.com/tough723/music-holo
 */

// 普通脚本，不使用 import/require；在 LX 或 Music Holo 的隔离环境内运行。
// 可在此按 songmid 配置自己的曲目。不要把密码、Cookie 或长期令牌写入脚本。
// 示例（请替换地址后再取消注释）：
const TRACKS = {
  // 'my-track': {
  //   audioUrl: 'https://media.example.com/my-track.mp3',
  //   coverUrl: 'https://media.example.com/my-track.jpg',
  //   lyricUrl: 'https://media.example.com/my-track.lrc',
  //   tlyric: null, rlyric: null, lxlyric: null,
  // },
}

const { EVENT_NAMES, on, send, request } = globalThis.lx
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key)

function mediaUrl(value, label) {
  // 不依赖桌面沙箱未承诺提供的 URL 全局对象；仅允许无凭据的 HTTPS 地址。
  if (typeof value !== 'string' || value.length > 4096 ||
      !/^https:\/\/[^\s/@?#\\:]+(?::\d{1,5})?(?:[/?#][^\s\\]*)?$/i.test(value)) {
    throw new Error(`${label}必须是无用户名/密码的完整 HTTPS 地址`)
  }
  return value
}

function readLrc(url) {
  return new Promise((resolve, reject) => {
    request(mediaUrl(url, '歌词地址'), {
      method: 'GET', timeout: 10000,
      headers: { Accept: 'text/plain' },
    }, (error, response, body) => {
      if (error) return reject(new Error('歌词请求失败：网络、超时或 CORS 错误'))
      if (!response || response.statusCode < 200 || response.statusCode >= 300 ||
          !Number.isFinite(response.statusCode)) {
        return reject(new Error('歌词请求失败：HTTP 状态异常'))
      }
      const text = body === undefined ? response.body : body
      if (typeof text !== 'string' || text.length > 256 * 1024) {
        return reject(new Error('歌词必须为不超过 256K 字符的 UTF-8 文本'))
      }
      resolve(text.replace(/^\uFEFF/, ''))
    })
  })
}

function lyricText(value, field, fallback = null) {
  if (value == null) return fallback
  if (typeof value !== 'string' || value.length > 256 * 1024) {
    throw new Error(`${field}必须为不超过 256K 字符的歌词文本`)
  }
  return value
}

// async 确保包括参数错误在内的每条路径都返回 Promise。
on(EVENT_NAMES.request, async (payload) => {
  const { source, action, info } = payload || {}
  if (source !== 'local') throw new Error('此脚本仅支持 local 源')
  if (!['musicUrl', 'pic', 'lyric'].includes(action)) throw new Error('不支持的操作')
  const musicInfo = info && info.musicInfo
  if (!musicInfo || typeof musicInfo !== 'object' || Array.isArray(musicInfo)) {
    throw new Error('缺少有效的 musicInfo')
  }
  // songmid 是本示例约定的映射键，不假定 LX 一定提供该字段。
  const key = musicInfo.songmid
  const track = typeof key === 'string' && hasOwn(TRACKS, key) ? TRACKS[key] : musicInfo
  switch (action) {
    case 'musicUrl':
      return mediaUrl(track.audioUrl, '音频地址 audioUrl')
    case 'pic':
      return mediaUrl(track.coverUrl, '封面地址 coverUrl')
    case 'lyric':
      return {
        lyric: track.lyric != null
          ? lyricText(track.lyric, 'lyric', '')
          : track.lyricUrl ? await readLrc(track.lyricUrl) : '',
        tlyric: lyricText(track.tlyric, 'tlyric'),
        rlyric: lyricText(track.rlyric, 'rlyric'),
        lxlyric: lyricText(track.lxlyric, 'lxlyric'),
      }
  }
})

// 必须在处理器注册完成后发送；local 的 qualitys 固定为空数组。
send(EVENT_NAMES.inited, {
  openDevTools: false,
  sources: {
    local: {
      name: '授权直链', type: 'music',
      actions: ['musicUrl', 'lyric', 'pic'], qualitys: [],
    },
  },
})
