import { afterEach, describe, expect, it, vi } from 'vitest'
import { desktopSourceBridge, parseSourceNetworkUrl, createDesktopSourceRequestBridge, desktopMediaUrl } from '../src/utils/desktopSource'

afterEach(() => { delete globalThis.musicHoloDesktop })
function install() {
  const bridge = { version: 'test', openSourceSession: vi.fn(async () => 'session'), closeSourceSession: vi.fn(async () => {}), request: vi.fn(async () => ({ body: 'ok' })), cancel: vi.fn(async () => {}), media: vi.fn(async () => 'app://music-holo/__source_media/ticket') }
  globalThis.musicHoloDesktop = bridge
  return bridge
}
describe('desktop source transport selection', () => {
  it('web remains HTTPS-only and never mints media tickets', async () => {
    expect(desktopSourceBridge()).toBeNull()
    expect(() => parseSourceNetworkUrl('http://media.example.com')).toThrow()
    expect(await desktopMediaUrl('https://media.example.com/a')).toBe('https://media.example.com/a')
  })
  it('desktop allows HTTP but still blocks credentials and local addresses', async () => {
    const native = install()
    expect(parseSourceNetworkUrl('http://media.example.com').protocol).toBe('http:')
    for (const url of ['http://localhost', 'http://127.0.0.1', 'file:///etc/passwd', 'https://u:p@media.example.com']) expect(() => parseSourceNetworkUrl(url)).toThrow()
    expect(await desktopMediaUrl('https://media.example.com/a')).toContain('__source_media')
    expect(native.media).toHaveBeenCalledOnce()
  })
  it('opens lazily and closes after disposal; no further requests', async () => {
    const native = install()
    const request = createDesktopSourceRequestBridge({ name: 'test' })
    expect(native.openSourceSession).not.toHaveBeenCalled()
    expect((await request('https://api.example.com', {})).body).toBe('ok')
    await request('https://api.example.com/2', {})
    expect(native.openSourceSession).toHaveBeenCalledTimes(1)
    request.dispose()
    await Promise.resolve()
    expect(native.closeSourceSession).toHaveBeenCalledWith('session')
    await expect(request('https://api.example.com', {})).rejects.toThrow('取消')
  })
  it('disposal while opening closes the eventual native session without requesting', async () => {
    const native = install()
    let resolve
    native.openSourceSession.mockImplementation(() => new Promise((done) => { resolve = done }))
    const request = createDesktopSourceRequestBridge({ name: 'test' })
    const result = request('https://example.com', {})
    request.dispose(); resolve('late-session')
    await expect(result).rejects.toThrow('取消')
    expect(native.closeSourceSession).toHaveBeenCalledWith('late-session')
    expect(native.request).not.toHaveBeenCalled()
  })
  it('abort signals cancel the corresponding native request', async () => {
    const native = install()
    let finish
    native.request.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const request = createDesktopSourceRequestBridge({ name: 'test' })
    const controller = new AbortController()
    const result = request('https://example.com', {}, controller.signal)
    await Promise.resolve()
    controller.abort(); finish({ body: 'too late' })
    await expect(result).rejects.toThrow('取消')
    expect(native.cancel).toHaveBeenCalledWith('session', expect.any(String))
    request.dispose()
  })
})
