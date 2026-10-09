import { api } from '@/api/request'

/**
 * 下载文件（兼容真实后端的 blob 响应与 Mock 模式返回的 Blob）
 * @param {string} url 接口地址
 * @param {object} params 查询参数
 * @param {string} filename 保存的文件名
 */
export async function downloadFile(url, params, filename) {
  const res = await api({ url, method: 'get', params, responseType: 'blob' })
  let blob
  if (res instanceof Blob) {
    blob = res
  } else if (res?.data instanceof Blob) {
    blob = res.data
  } else {
    blob = new Blob([typeof res === 'string' ? res : JSON.stringify(res)], { type: 'text/plain' })
  }
  triggerDownload(blob, filename)
}

/** 触发浏览器下载 */
export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
