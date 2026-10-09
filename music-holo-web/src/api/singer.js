import { api, rawPost } from './request'
import { downloadFile } from '@/utils/download'

/** 歌手相关接口 */
export const page = (params) => api({ url: '/singer/page', method: 'get', params })
export const detail = (id) => api({ url: `/singer/${id}`, method: 'get' })
export const songsOfSinger = (id) => api({ url: `/singer/${id}/songs`, method: 'get' })
export const save = (data) => api({ url: '/singer', method: data.id ? 'put' : 'post', data })
export const remove = (id) => api({ url: `/singer/${id}`, method: 'delete' })

/** 导出歌手 CSV */
export const exportCsv = () => downloadFile('/singer/export', {}, `singer_export_${Date.now()}.csv`)

/** 下载导入模板 */
export const downloadTemplate = () => downloadFile('/singer/template', {}, 'singer_import_template.csv')

/** 导入歌手 CSV（el-upload 的 http-request 可直接使用本函数返回的 Promise） */
export const importCsv = (file) => {
  const formData = new FormData()
  formData.append('file', file)
  return rawPost('/singer/import', formData)
}
