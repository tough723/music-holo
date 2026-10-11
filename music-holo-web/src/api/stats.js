import { api } from './request'

/**
 * 收听统计上报（P2-8）。事件按 eventId 幂等：重复上报计入 duplicates，不重复入库。
 * 隐私口径：只上报歌曲 id、事件类型与秒数，标题/艺人/来源留在本地账本，不出机器。
 */

/** 批量上报事件（服务端单批 ≤200 条）；data 返回 {accepted, duplicates}。 */
export const reportStatEvents = (events) => api({ url: '/stat/batch', method: 'post', data: events })

/** 最近 N 天收听汇总（默认 7 天，服务端收敛到 1..90）。 */
export const fetchStatSummary = (days = 7) => api({ url: '/stat/summary', method: 'get', params: { days } })
