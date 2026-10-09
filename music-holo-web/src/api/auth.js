import { api } from './request'

/** 认证相关接口 */
export const login = (data) => api({ url: '/auth/login', method: 'post', data })
export const register = (data) => api({ url: '/auth/register', method: 'post', data })
export const logout = () => api({ url: '/auth/logout', method: 'post' })
export const info = () => api({ url: '/auth/info', method: 'get' })
