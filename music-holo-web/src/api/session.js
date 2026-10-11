import { api } from './request'

/**
 * 播放会话快照（服务端 Redis，版本 1，TTL 7 天）。
 * 服务端接口见 music-holo-server 的 PlaySessionController；本地快照先行保存在
 * player store（saveSessionSnapshot），这里负责跨设备同步，失败由调用方静默兜底。
 */

/** 保存整份会话；data 返回 {version, savedAt, expiresAt}（epoch 毫秒）。 */
export const saveSession = (data) => api({ url: '/session', method: 'put', data })

/** 读取服务端快照；没有快照时返回 null。 */
export const fetchSession = () => api({ url: '/session', method: 'get' })

/** 清除服务端快照。 */
export const clearSession = () => api({ url: '/session', method: 'delete' })
