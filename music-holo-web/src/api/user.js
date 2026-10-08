import { api } from './request'

/** 用户相关接口 */
export const getProfile = () => api({ url: '/user/profile', method: 'get' })
export const updateProfile = (data) => api({ url: '/user/profile', method: 'put', data })
export const changePassword = (data) => api({ url: '/user/password', method: 'put', data })
