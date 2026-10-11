export const ONLINE_PLATFORMS = [
  { key: 'wy', name: '网易云音乐' },
  { key: 'kw', name: '酷我音乐' },
  { key: 'kg', name: '酷狗音乐' },
  { key: 'mg', name: '咪咕音乐' }
]

export function createOnlinePlatformResults() {
  return Object.fromEntries(ONLINE_PLATFORMS.map(({ key }) => [key, []]))
}

export function createOnlinePlatformStates() {
  return Object.fromEntries(ONLINE_PLATFORMS.map(({ key }) => [key, {
    loading: false,
    loaded: false,
    error: ''
  }]))
}
