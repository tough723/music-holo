const { test } = require('node:test')
const assert = require('node:assert/strict')
const { sourceUrl, isPublicAddress, resolvePublic, requestOptions } = require('../policy.cjs')

test('public HTTP and HTTPS; reject credentials, private/IP URLs, ports and backend', () => {
  assert.equal(sourceUrl('http://media.example.com/a#secret').href, 'http://media.example.com/a')
  assert.equal(sourceUrl('https://media.example.com/a').protocol, 'https:')
  for (const url of ['file:///etc/passwd', 'app://music-holo/api/me', 'https://u:p@example.com', 'http://127.1', 'http://2130706433', 'http://[::1]', 'http://localhost', 'http://a.local', 'http://127.0.0.1.nip.io', 'https://example.com:8080', 'https://backend.example.com']) {
    assert.throws(() => sourceUrl(url, ['backend.example.com']), undefined, url)
  }
})
test('DNS blocks all non-unicast, mixed answers, IPv6; validates a public IPv4', async () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.0.1', '172.16.0.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '192.0.2.1', '255.255.255.255', '::ffff:127.0.0.1', '2001:4860:4860::8888']) assert.equal(isPublicAddress(address), false, address)
  assert.equal(isPublicAddress('8.8.8.8'), true)
  const url = sourceUrl('https://example.com')
  await assert.rejects(resolvePublic(url, async () => [{ address: '8.8.8.8' }, { address: '127.0.0.1' }]), /DNS/)
  await assert.rejects(resolvePublic(url, async () => []), /DNS/)
  assert.equal(await resolvePublic(url, async () => [{ address: '8.8.8.8' }]), '8.8.8.8')
})
test('filters secrets/hop headers, serializes forms and bounds input', () => {
  const options = requestOptions({ method: 'post', headers: {
    Cookie: 'private', Authorization: 'private', 'music-holo-token': 'private', Origin: 'app://music-holo', Host: 'localhost',
    'User-Agent': 'custom-source', 'X-Client': 'public',
  }, form: { songmid: 'a b' } })
  assert.equal(options.body.toString(), 'songmid=a+b')
  for (const secret of ['cookie', 'authorization', 'music-holo-token', 'origin', 'host']) assert.equal(options.headers[secret], undefined)
  assert.equal(options.headers['user-agent'], 'custom-source')
  assert.equal(options.headers['accept-encoding'], 'identity')
  assert.throws(() => requestOptions({ method: 'CONNECT' }))
  assert.throws(() => requestOptions({ headers: { test: 'a\r\nb' } }))
  assert.throws(() => requestOptions({ method: 'POST', body: 'a'.repeat(65537) }), /64 KB/)
})

test('builds multipart formData without header injection', () => {
  const options = requestOptions({ method: 'POST', formData: { songmid: 'a b', quality: '320k' } })
  assert.match(options.headers['content-type'], /^multipart\/form-data; boundary=----MusicHoloFormBoundary[0-9a-f]{32}$/)
  const text = options.body.toString('utf8')
  assert.match(text, /name="songmid"\r\n\r\na b\r\n/)
  assert.match(text, /name="quality"\r\n\r\n320k\r\n/)
  assert.match(text, /--MusicHoloFormBoundary[0-9a-f]{32}--\r\n$/)
  assert.throws(() => requestOptions({ method: 'POST', formData: { 'bad\r\nX-Injected: 1': 'v' } }), /字段名无效/)
  assert.throws(() => requestOptions({ method: 'POST', formData: 'not-an-object' }), /格式无效/)
})
