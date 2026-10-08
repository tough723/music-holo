import { api } from './request'

/** 歌曲与歌单短评、点赞、举报和审核 */
export const page = (params) => api({ url: '/review/page', method: 'get', params })
export const create = (data) => api({ url: '/review', method: 'post', data })
export const remove = (id) => api({ url: `/review/${id}`, method: 'delete' })
export const setLiked = (id, liked) => api({ url: `/review/${id}/like`, method: 'put', data: { liked } })
export const report = (id, data) => api({ url: `/review/${id}/report`, method: 'post', data })

export const adminPage = (params) => api({ url: '/review/admin/page', method: 'get', params })
export const adminReportsPage = (params) => api({ url: '/review/admin/reports/page', method: 'get', params })
export const setVisibility = (id, hidden, note = '') => api({
  url: `/review/admin/${id}/visibility`,
  method: 'put',
  data: { hidden, note }
})
export const handleReport = (id, data) => api({ url: `/review/admin/reports/${id}`, method: 'put', data })
