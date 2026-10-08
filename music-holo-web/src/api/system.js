import { api } from './request'

/** 系统设置相关接口 */
export const getTheme = () => api({ url: '/system/theme', method: 'get' })
export const setTheme = (data) => api({ url: '/system/theme', method: 'put', data })
export const getConfig = (key) => api({ url: `/system/config/${key}`, method: 'get' })
