const TIMEOUT = Symbol('optional-request-timeout')

/**
 * Bound a non-critical enrichment request so it cannot hold up a usable result.
 * The caller owns cancellation of the underlying operation through onTimeout.
 */
export async function settleOptionalRequest(promise, { timeoutMs = 8_000, onTimeout } = {}) {
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), Math.max(0, Number(timeoutMs) || 0))
  })
  try {
    const value = await Promise.race([Promise.resolve(promise), timeout])
    if (value === TIMEOUT) {
      try { onTimeout?.() } catch { /* optional cancellation must not replace the result */ }
      return { timedOut: true, value: undefined }
    }
    return { timedOut: false, value }
  } catch (error) {
    return { timedOut: false, value: undefined, error }
  } finally {
    clearTimeout(timer)
  }
}
