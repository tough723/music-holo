import { api, rawPost } from './request'

/** 其他公共接口 */
export const dict = (dictType) => api({ url: `/common/dict/${dictType}`, method: 'get' })
export const dictAll = () => api({ url: '/common/dict/all', method: 'get' })
export const stats = () => api({ url: '/common/stats', method: 'get' })

/** 文件上传（头像 / 封面 / 音频等），返回 {url, name, size} */
export const upload = (file) => {
  const formData = new FormData()
  formData.append('file', file)
  return rawPost('/common/upload', formData)
}
