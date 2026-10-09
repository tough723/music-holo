// A cancelled permission prompt or DNS lookup must release its request slot even
// when the underlying operation cannot be interrupted immediately.
function untilAborted(operation, signal) {
  if (!signal) return Promise.resolve(operation)
  if (signal.aborted) {
    Promise.resolve(operation).catch(() => {})
    return Promise.reject(new Error('音源请求已取消或超时'))
  }
  let abort
  return Promise.race([
    operation,
    new Promise((_, reject) => {
      abort = () => reject(new Error('音源请求已取消或超时'))
      signal.addEventListener('abort', abort, { once: true })
    }),
  ]).finally(() => signal.removeEventListener('abort', abort))
}
module.exports = { untilAborted }
