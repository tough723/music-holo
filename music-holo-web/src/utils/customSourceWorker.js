'use strict'

const nativeWorkerPostMessage = self.postMessage.bind(self)
const handlers = new Map()
const pendingRequests = new Map()
let requestSequence = 0
let sourceMetadata = {}
let desktopEnvironment = false

function sendParent(message) {
  nativeWorkerPostMessage(message)
}

function toBytes(value, encoding = 'utf8') {
  if (value instanceof Uint8Array) return new Uint8Array(value)
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0))
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength))
  const text = String(value ?? '')
  const normalized = String(encoding || 'utf8').toLowerCase()
  if (normalized === 'hex') {
    const clean = text.replace(/\s+/g, '')
    if (clean.length % 2 || !/^[0-9a-f]*$/i.test(clean)) throw new Error('无效的十六进制数据')
    const bytes = new Uint8Array(clean.length / 2)
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16)
    return bytes
  }
  if (normalized === 'base64' || normalized === 'base64url') {
    const base64 = normalized === 'base64url' ? text.replace(/-/g, '+').replace(/_/g, '/') : text
    const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
  }
  // 与 Node 一致：ascii 编码取代码单元低字节，解码时清高位。
  if (normalized === 'ascii') return Uint8Array.from(text, (character) => character.charCodeAt(0) & 0xff)
  if (normalized === 'latin1' || normalized === 'binary') return Uint8Array.from(text, (character) => character.charCodeAt(0) & 0xff)
  if (normalized === 'utf16le' || normalized === 'ucs2' || normalized === 'utf-16le') return toBytesUtf16(text)
  return new TextEncoder().encode(text)
}

function bytesToString(value, encoding = 'utf8') {
  const bytes = toBytes(value)
  const normalized = String(encoding || 'utf8').toLowerCase()
  if (normalized === 'hex') return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  if (normalized === 'base64' || normalized === 'base64url') {
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    const encoded = btoa(binary)
    return normalized === 'base64url' ? encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '') : encoded
  }
  if (normalized === 'latin1' || normalized === 'binary' || normalized === 'ascii') return Array.from(bytes, (byte) => String.fromCharCode(normalized === 'ascii' ? byte & 0x7f : byte)).join('')
  if (normalized === 'utf16le' || normalized === 'ucs2' || normalized === 'utf-16le') {
    // Node 的 utf16le 会正确拼接代理对，交给 TextDecoder 处理。
    return new TextDecoder('utf-16le').decode(bytes)
  }
  return new TextDecoder(normalized === 'utf8' ? 'utf-8' : normalized, { fatal: false }).decode(bytes)
}

function toBytesUtf16(value) {
  // Node Buffer.from(str, 'utf16le') 等价：UTF-16 代码单元按小端写入。
  const text = String(value ?? '')
  const bytes = new Uint8Array(text.length * 2)
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    bytes[index * 2] = code & 0xff
    bytes[index * 2 + 1] = (code >>> 8) & 0xff
  }
  return bytes
}

class SourceBuffer extends Uint8Array {
  toString(encoding = 'utf8') {
    return bytesToString(this, encoding)
  }

  static from(value, encoding = 'utf8') {
    return new SourceBuffer(toBytes(value, encoding))
  }
}

/* ---------------- 同步哈希 ----------------
 * RSA 的 OAEP/PKCS1 填充需要摘要。WebCrypto 的 digest 是异步的，而音源脚本按
 * Node 语义同步调用 rsaEncrypt，因此这里自带 SHA-1 / SHA-256 的同步实现。 */

function sha1Bytes(input) {
  const bitLength = input.length * 8
  const total = Math.ceil((input.length + 9) / 64) * 64
  const padded = new Uint8Array(total)
  padded.set(input)
  padded[input.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(total - 8, Math.floor(bitLength / 0x100000000))
  view.setUint32(total - 4, bitLength >>> 0)
  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0
  const words = new Uint32Array(80)
  for (let offset = 0; offset < total; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4)
    for (let index = 16; index < 80; index += 1) {
      const value = words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16]
      words[index] = (value << 1) | (value >>> 31)
    }
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    for (let index = 0; index < 80; index += 1) {
      let mix
      let constant
      if (index < 20) { mix = (b & c) | (~b & d); constant = 0x5a827999 } else if (index < 40) { mix = b ^ c ^ d; constant = 0x6ed9eba1 } else if (index < 60) { mix = (b & c) | (b & d) | (c & d); constant = 0x8f1bbcdc } else { mix = b ^ c ^ d; constant = 0xca62c1d6 }
      const temp = (((a << 5) | (a >>> 27)) + mix + e + constant + words[index]) >>> 0
      e = d
      d = c
      c = (b << 30) | (b >>> 2)
      b = a
      a = temp
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }
  const output = new Uint8Array(20)
  const outputView = new DataView(output.buffer)
  outputView.setUint32(0, h0)
  outputView.setUint32(4, h1)
  outputView.setUint32(8, h2)
  outputView.setUint32(12, h3)
  outputView.setUint32(16, h4)
  return output
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
])

function sha256Bytes(input) {
  const bitLength = input.length * 8
  const total = Math.ceil((input.length + 9) / 64) * 64
  const padded = new Uint8Array(total)
  padded.set(input)
  padded[input.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(total - 8, Math.floor(bitLength / 0x100000000))
  view.setUint32(total - 4, bitLength >>> 0)
  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ])
  const words = new Uint32Array(64)
  for (let offset = 0; offset < total; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4)
    for (let index = 16; index < 64; index += 1) {
      const previous = words[index - 15]
      const older = words[index - 2]
      const s0 = ((previous >>> 7) | (previous << 25)) ^ ((previous >>> 18) | (previous << 14)) ^ (previous >>> 3)
      const s1 = ((older >>> 17) | (older << 15)) ^ ((older >>> 19) | (older << 13)) ^ (older >>> 10)
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = state
    for (let index = 0; index < 64; index += 1) {
      const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
      const choose = (e & f) ^ (~e & g)
      const temp1 = (h + s1 + choose + SHA256_K[index] + words[index]) >>> 0
      const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (s0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    state[0] = (state[0] + a) >>> 0
    state[1] = (state[1] + b) >>> 0
    state[2] = (state[2] + c) >>> 0
    state[3] = (state[3] + d) >>> 0
    state[4] = (state[4] + e) >>> 0
    state[5] = (state[5] + f) >>> 0
    state[6] = (state[6] + g) >>> 0
    state[7] = (state[7] + h) >>> 0
  }
  const output = new Uint8Array(32)
  const outputView = new DataView(output.buffer)
  for (let index = 0; index < 8; index += 1) outputView.setUint32(index * 4, state[index])
  return output
}

const HASHES = {
  sha1: { digest: sha1Bytes, length: 20 },
  'sha-1': { digest: sha1Bytes, length: 20 },
  sha256: { digest: sha256Bytes, length: 32 },
  'sha-256': { digest: sha256Bytes, length: 32 }
}

/* ---------------- AES ----------------
 * WebCrypto 只有 CBC/CTR/GCM，且没有 ECB。音源脚本按 Node 的 createCipheriv 传模式名，
 * 因此这里自带分组实现，覆盖 ECB/CBC/CFB/OFB/CTR；GCM 仍走 WebCrypto（带认证标签）。 */

const AES_SBOX = (() => {
  const sbox = new Uint8Array(256)
  let p = 1
  let q = 1
  do {
    p = (p ^ ((p << 1) & 0xff) ^ ((p & 0x80) ? 0x1b : 0)) & 0xff
    q ^= (q << 1) & 0xff
    q ^= (q << 2) & 0xff
    q ^= (q << 4) & 0xff
    if (q & 0x80) q ^= 0x09
    q &= 0xff
    const rotated = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4))
    sbox[p] = (rotated ^ 0x63) & 0xff
  } while (p !== 1)
  sbox[0] = 0x63
  return sbox
})()

function xtime(value) {
  return ((value << 1) ^ ((value & 0x80) ? 0x1b : 0)) & 0xff
}

function gmul(left, right) {
  let result = 0
  let multiplier = left
  let factor = right
  while (factor) {
    if (factor & 1) result ^= multiplier
    multiplier = xtime(multiplier)
    factor >>= 1
  }
  return result & 0xff
}

function expandAesKey(key) {
  const columns = key.length / 4
  if (![4, 6, 8].includes(columns)) throw new Error('AES 密钥长度必须是 16、24 或 32 字节')
  const rounds = columns + 6
  const totalWords = 4 * (rounds + 1)
  const schedule = new Uint8Array(totalWords * 4)
  schedule.set(key)
  let rcon = 1
  for (let index = columns; index < totalWords; index += 1) {
    const previous = (index - 1) * 4
    let t0 = schedule[previous]
    let t1 = schedule[previous + 1]
    let t2 = schedule[previous + 2]
    let t3 = schedule[previous + 3]
    if (index % columns === 0) {
      const carry = t0
      t0 = AES_SBOX[t1] ^ rcon
      t1 = AES_SBOX[t2]
      t2 = AES_SBOX[t3]
      t3 = AES_SBOX[carry]
      rcon = ((rcon << 1) ^ ((rcon & 0x80) ? 0x1b : 0)) & 0xff
    } else if (columns > 6 && index % columns === 4) {
      t0 = AES_SBOX[t0]
      t1 = AES_SBOX[t1]
      t2 = AES_SBOX[t2]
      t3 = AES_SBOX[t3]
    }
    const back = (index - columns) * 4
    schedule[index * 4] = schedule[back] ^ t0
    schedule[index * 4 + 1] = schedule[back + 1] ^ t1
    schedule[index * 4 + 2] = schedule[back + 2] ^ t2
    schedule[index * 4 + 3] = schedule[back + 3] ^ t3
  }
  return { schedule, rounds }
}

function encryptAesBlock(input, offset, output, { schedule, rounds }) {
  const state = new Uint8Array(16)
  for (let index = 0; index < 16; index += 1) state[index] = input[offset + index] ^ schedule[index]
  for (let round = 1; round <= rounds; round += 1) {
    for (let index = 0; index < 16; index += 1) state[index] = AES_SBOX[state[index]]
    const shifted = new Uint8Array(16)
    for (let index = 0; index < 16; index += 1) {
      const row = index % 4
      const column = (index - row) / 4
      shifted[index] = state[4 * ((column + row) % 4) + row]
    }
    if (round !== rounds) {
      for (let column = 0; column < 4; column += 1) {
        const base = column * 4
        const a0 = shifted[base]
        const a1 = shifted[base + 1]
        const a2 = shifted[base + 2]
        const a3 = shifted[base + 3]
        state[base] = gmul(a0, 2) ^ gmul(a1, 3) ^ a2 ^ a3
        state[base + 1] = a0 ^ gmul(a1, 2) ^ gmul(a2, 3) ^ a3
        state[base + 2] = a0 ^ a1 ^ gmul(a2, 2) ^ gmul(a3, 3)
        state[base + 3] = gmul(a0, 3) ^ a1 ^ a2 ^ gmul(a3, 2)
      }
    } else {
      state.set(shifted)
    }
    for (let index = 0; index < 16; index += 1) state[index] ^= schedule[round * 16 + index]
  }
  output.set(state, 0)
  return output
}

function xorInto(target, source) {
  for (let index = 0; index < target.length; index += 1) target[index] ^= source[index % source.length]
}

function pkcs7Pad(bytes, blockSize) {
  const padding = blockSize - (bytes.length % blockSize)
  const padded = new Uint8Array(bytes.length + padding)
  padded.set(bytes)
  padded.fill(padding, bytes.length)
  return padded
}

function parseAesMode(mode, keyBytes) {
  const raw = String(mode || 'AES-CBC').trim().toLowerCase().replace(/_/g, '-')
  let name = 'CBC'
  if (raw.includes('ecb')) name = 'ECB'
  else if (raw.includes('cbc')) name = 'CBC'
  else if (raw.includes('cfb')) name = 'CFB'
  else if (raw.includes('ofb')) name = 'OFB'
  else if (raw.includes('ctr')) name = 'CTR'
  else if (raw.includes('gcm')) name = 'GCM'
  const declared = raw.match(/(?:^|-)(128|192|256)(?:-|$)/)
  const bits = declared ? Number(declared[1]) : keyBytes.length * 8
  if (![128, 192, 256].includes(bits)) throw new Error('AES 密钥长度无效（支持 128/192/256 位）')
  if (keyBytes.length !== bits / 8) {
    throw new Error(`AES 模式要求 ${bits} 位密钥，但收到 ${keyBytes.length * 8} 位`)
  }
  return { name, bits }
}

function aesEncryptPure(value, mode, key, iv) {
  const data = toBytes(value)
  const keyBytes = toBytes(key)
  const { name } = parseAesMode(mode, keyBytes)
  const needsIv = name !== 'ECB'
  const ivBytes = toBytes(iv)
  if (needsIv && ivBytes.length !== 16) throw new Error('AES 初始化向量必须是 16 字节')
  const schedule = expandAesKey(keyBytes)
  const block = new Uint8Array(16)
  const encryptBlock = (input, output) => encryptAesBlock(input, 0, output, schedule)

  if (name === 'ECB' || name === 'CBC') {
    const padded = pkcs7Pad(data, 16)
    const result = new Uint8Array(padded.length)
    let previous = new Uint8Array(16)
    if (name === 'CBC') previous = ivBytes
    for (let offset = 0; offset < padded.length; offset += 16) {
      const chunk = padded.subarray(offset, offset + 16)
      const mixed = new Uint8Array(16)
      mixed.set(chunk)
      if (name === 'CBC') xorInto(mixed, previous)
      encryptBlock(mixed, block)
      result.set(block, offset)
      previous = block.slice()
    }
    return result
  }
  if (name === 'CTR') {
    const result = new Uint8Array(data.length)
    const counter = ivBytes.slice()
    const keystream = new Uint8Array(16)
    for (let offset = 0; offset < data.length; offset += 16) {
      encryptBlock(counter, keystream)
      const length = Math.min(16, data.length - offset)
      for (let index = 0; index < length; index += 1) result[offset + index] = data[offset + index] ^ keystream[index]
      for (let index = 15; index >= 0; index -= 1) {
        counter[index] = (counter[index] + 1) & 0xff
        if (counter[index] !== 0) break
      }
    }
    return result
  }
  if (name === 'CFB' || name === 'OFB') {
    const result = new Uint8Array(data.length)
    let feedback = ivBytes.slice()
    const output = new Uint8Array(16)
    for (let offset = 0; offset < data.length; offset += 16) {
      encryptBlock(feedback, output)
      const length = Math.min(16, data.length - offset)
      for (let index = 0; index < length; index += 1) result[offset + index] = data[offset + index] ^ output[index]
      if (name === 'OFB') {
        feedback = output.slice()
      } else {
        // CFB128：下一块的输入是本次密文；最后一块不足 16 字节时右侧补零。
        feedback = new Uint8Array(16)
        feedback.set(result.subarray(offset, offset + length))
      }
    }
    return result
  }
  throw new Error(`不支持的 AES 模式：${mode}`)
}

/* ---------------- RSA：仅公钥加密 ----------------
 * 与 Node crypto.publicEncrypt 对齐：默认 OAEP + SHA-1，可选 PKCS#1 v1.5。
 * 只接受公钥：出现私钥 PEM 直接拒绝，绝不执行解密或签名。 */

function derReadNode(view, offset) {
  const tag = view[offset]
  let position = offset + 1
  let length = view[position]
  position += 1
  if (length & 0x80) {
    const count = length & 0x7f
    length = 0
    for (let index = 0; index < count; index += 1) length = length * 256 + view[position++]
  }
  const start = position
  const end = position + length
  const children = []
  if ((tag & 0x20) === 0x20) {
    let cursor = start
    while (cursor < end) {
      const node = derReadNode(view, cursor)
      if (node.end <= cursor) break
      children.push(node)
      cursor = node.end
    }
  }
  return { tag, start, end, children }
}

function derInteger(view, node) {
  let value = 0n
  for (let index = node.start; index < node.end; index += 1) value = (value << 8n) | BigInt(view[index])
  return value
}

function parseRsaPublicKey(key) {
  if (key && typeof key === 'object' && !(key instanceof Uint8Array)) {
    // JWK：{ kty: 'RSA', n, e }
    const n = key.n
    const e = key.e
    if (typeof n === 'string' && typeof e === 'string') {
      const modulusBytes = toBytes(n, 'base64url')
      const exponentBytes = toBytes(e, 'base64url')
      let exponent = 0n
      for (const byte of exponentBytes) exponent = (exponent << 8n) | BigInt(byte)
      return { modulus: BigInt(`0x${Array.from(modulusBytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`), exponent, modulusLength: modulusBytes.length }
    }
    if (key.modulus && key.publicExponent) return parseRsaPublicKey({ n: key.modulus, e: key.publicExponent })
    throw new Error('RSA 公钥对象必须是 JWK（n/e）格式')
  }

  let text = key instanceof Uint8Array ? bytesToString(key, 'latin1') : String(key ?? '')
  if (/private key/i.test(text)) throw new Error('RSA 加密只接受公钥，已拒绝私钥材料')
  if (text.includes('-----BEGIN')) {
    text = text.replace(/-----BEGIN[^-]*-----/g, '').replace(/-----END[^-]*-----/g, '').replace(/\s+/g, '')
  }
  text = text.replace(/\s+/g, '')
  const der = /^[0-9a-f]+$/i.test(text) && text.length % 2 === 0 ? toBytes(text, 'hex') : toBytes(text, 'base64')
  const view = new Uint8Array(der)
  if (view.length < 16 || view[0] !== 0x30) throw new Error('RSA 公钥不是有效的 DER/SPKI/PKCS#1 结构')

  const root = derReadNode(view, 0)
  let keyNode = root
  if (root.children.length === 2 && root.children[0].children.length >= 1 && root.children[1].tag === 0x03) {
    // SubjectPublicKeyInfo：AlgorithmIdentifier + BIT STRING(RSAPublicKey)
    keyNode = derReadNode(view, root.children[1].start + 1)
  }
  let integers = keyNode.children.filter((node) => node.tag === 0x02)
  if (integers.length < 2) {
    const fallback = root.children.filter((node) => node.tag === 0x02)
    if (fallback.length < 2) throw new Error('RSA 公钥缺少模数与公钥指数')
    integers = fallback
  }
  const modulus = derInteger(view, integers[0])
  const exponent = derInteger(view, integers[1])
  let modulusLength = (integers[0].end - integers[0].start) - (view[integers[0].start] === 0x00 ? 1 : 0)
  if (modulusLength < 64 || modulusLength > 1024) throw new Error('RSA 模数长度必须在 512–8192 位之间')
  if (exponent <= 1n || exponent >= 2n ** 64n) throw new Error('RSA 公钥指数无效')
  return { modulus, exponent, modulusLength }
}

function mgf1(seed, length, digest) {
  const output = new Uint8Array(length)
  let offset = 0
  let counter = 0
  while (offset < length) {
    const block = digest(new Uint8Array([...seed, (counter >>> 24) & 0xff, (counter >>> 16) & 0xff, (counter >>> 8) & 0xff, counter & 0xff]))
    const take = Math.min(block.length, length - offset)
    output.set(block.subarray(0, take), offset)
    offset += take
    counter += 1
  }
  return output
}

function modPow(base, exponent, modulus) {
  let result = 1n
  let factor = base % modulus
  let power = exponent
  while (power > 0n) {
    if (power & 1n) result = (result * factor) % modulus
    factor = (factor * factor) % modulus
    power >>= 1n
  }
  return result
}

function rsaRawEncrypt(em, { modulus, exponent, modulusLength }) {
  let value = 0n
  for (const byte of em) value = (value << 8n) | BigInt(byte)
  if (value >= modulus) throw new Error('RSA 待加密数据超出模数长度')
  const encrypted = modPow(value, exponent, modulus)
  const output = new Uint8Array(modulusLength)
  let remaining = encrypted
  for (let index = modulusLength - 1; index >= 0; index -= 1) {
    output[index] = Number(remaining & 0xffn)
    remaining >>= 8n
  }
  return output
}

function rsaEncryptBytes(value, key, options = {}) {
  const publicKey = parseRsaPublicKey(key)
  const data = toBytes(value)
  const { modulusLength } = publicKey
  const hashName = String(options.hash || options.oaepHash || 'sha1').toLowerCase()
  const useOaep = String(options.padding || 'oaep').toLowerCase() !== 'pkcs1'
  if (useOaep) {
    const hash = HASHES[hashName] || HASHES[`sha-${hashName.replace(/^sha-?/, '')}`] || HASHES.sha1
    const hashLength = hash.length
    if (modulusLength < data.length + 2 * hashLength + 2) {
      throw new Error('RSA-OAEP 待加密数据过长，请换用更大的公钥')
    }
    const digest = hash.digest
    const seed = new Uint8Array(hashLength)
    self.crypto.getRandomValues(seed)
    const dataBlock = new Uint8Array(modulusLength - hashLength - 1)
    // OAEP 的空标签摘要（lHash）固定为 SHA(‘’)，随后是 PS(0x00…01) 与消息。
    dataBlock.set(digest(new Uint8Array(0)), 0)
    // 消息放在数据块末尾，前面是 lHash 与 0x00…01 分隔符。
    dataBlock[dataBlock.length - data.length - 1] = 0x01
    dataBlock.set(data, dataBlock.length - data.length)
    const dbMask = mgf1(seed, dataBlock.length, digest)
    for (let index = 0; index < dataBlock.length; index += 1) dataBlock[index] ^= dbMask[index]
    const seedMask = mgf1(dataBlock, hashLength, digest)
    for (let index = 0; index < seed.length; index += 1) seed[index] ^= seedMask[index]
    const em = new Uint8Array(modulusLength)
    em.set(seed, 1)
    em.set(dataBlock, 1 + hashLength)
    return rsaRawEncrypt(em, publicKey)
  }
  if (modulusLength < data.length + 11) throw new Error('RSA-PKCS1 待加密数据过长，请换用更大的公钥')
  const em = new Uint8Array(modulusLength)
  em[0] = 0x00
  em[1] = 0x02
  const paddingLength = modulusLength - data.length - 3
  const padding = new Uint8Array(paddingLength)
  const random = new Uint8Array(paddingLength * 2)
  self.crypto.getRandomValues(random)
  let filled = 0
  for (let index = 0; index < random.length && filled < paddingLength; index += 1) {
    if (random[index] === 0) continue
    padding[filled++] = random[index]
  }
  em.set(padding, 2)
  em[2 + paddingLength] = 0x00
  em.set(data, 3 + paddingLength)
  return rsaRawEncrypt(em, publicKey)
}

function md5(value) {
  const input = toBytes(value)
  const totalLength = Math.ceil((input.length + 9) / 64) * 64
  const padded = new Uint8Array(totalLength)
  padded.set(input)
  padded[input.length] = 0x80
  const bitLength = input.length * 8
  const lowBits = bitLength >>> 0
  const highBits = Math.floor(bitLength / 0x100000000) >>> 0
  const lengthOffset = totalLength - 8
  for (let byte = 0; byte < 4; byte += 1) {
    padded[lengthOffset + byte] = (lowBits >>> (byte * 8)) & 0xff
    padded[lengthOffset + 4 + byte] = (highBits >>> (byte * 8)) & 0xff
  }

  const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
  const constants = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0)
  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  for (let block = 0; block < padded.length; block += 64) {
    const words = new Uint32Array(16)
    for (let word = 0; word < 16; word += 1) {
      const offset = block + word * 4
      words[word] = (padded[offset] | (padded[offset + 1] << 8) | (padded[offset + 2] << 16) | (padded[offset + 3] << 24)) >>> 0
    }
    let a = a0
    let b = b0
    let c = c0
    let d = d0
    for (let index = 0; index < 64; index += 1) {
      let f
      let wordIndex
      let shift
      if (index < 16) {
        f = (b & c) | (~b & d)
        wordIndex = index
        shift = shifts[index % 4]
      } else if (index < 32) {
        f = (d & b) | (~d & c)
        wordIndex = (5 * index + 1) % 16
        shift = shifts[4 + (index % 4)]
      } else if (index < 48) {
        f = b ^ c ^ d
        wordIndex = (3 * index + 5) % 16
        shift = shifts[8 + (index % 4)]
      } else {
        f = c ^ (b | ~d)
        wordIndex = (7 * index) % 16
        shift = shifts[12 + (index % 4)]
      }
      const sum = (a + f + constants[index] + words[wordIndex]) >>> 0
      const rotated = ((sum << shift) | (sum >>> (32 - shift))) >>> 0
      const nextB = (b + rotated) >>> 0
      a = d
      d = c
      c = b
      b = nextB
    }
    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }

  return [a0, b0, c0, d0].map((word) => [0, 8, 16, 24]
    .map((shift) => ((word >>> shift) & 0xff).toString(16).padStart(2, '0')).join('')).join('')
}

async function transformZlib(value, operation) {
  const Stream = operation === 'inflate' ? self.DecompressionStream : self.CompressionStream
  if (typeof Stream !== 'function') throw new Error(`${operation} 在此浏览器中不可用`)
  const stream = new Blob([toBytes(value)]).stream().pipeThrough(new Stream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

const eventNames = Object.freeze({ inited: 'inited', request: 'request', updateAlert: 'updateAlert' })
const utils = Object.freeze({
  buffer: Object.freeze({ from: (value, encoding) => SourceBuffer.from(value, encoding), bufToString: bytesToString }),
  crypto: Object.freeze({
    md5,
    randomBytes: (size) => {
      const length = Math.max(0, Math.min(4096, Number(size) || 0))
      const bytes = new Uint8Array(length)
      self.crypto.getRandomValues(bytes)
      return new SourceBuffer(bytes)
    },
    aesEncrypt: async (value, mode, key, iv) => {
      const declared = String(mode || 'AES-CBC').toUpperCase()
      if (declared.includes('GCM')) {
        const keyBytes = toBytes(key)
        const importedKey = await self.crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt'])
        const algorithm = { name: 'AES-GCM', iv: toBytes(iv) }
        return new SourceBuffer(await self.crypto.subtle.encrypt(algorithm, importedKey, toBytes(value)))
      }
      // ECB/CBC/CFB/OFB/CTR 走自带实现：WebCrypto 没有 ECB，且需要 PKCS#7 填充与 Node 一致。
      return new SourceBuffer(aesEncryptPure(value, mode, key, iv))
    },
    // 与 Node crypto.publicEncrypt 语义一致：仅公钥、默认 OAEP+SHA-1，可选 { padding: 'pkcs1' }。
    // 私钥材料会被直接拒绝，沙箱内不提供解密或签名能力。
    rsaEncrypt: (value, key, options) => new SourceBuffer(rsaEncryptBytes(value, key, options))
  }),
  zlib: Object.freeze({ inflate: (value) => transformZlib(value, 'inflate'), deflate: (value) => transformZlib(value, 'deflate') })
})

async function on(eventName, handler) {
  if (eventName !== eventNames.request || typeof handler !== 'function') throw new Error('无效的音源事件处理器')
  const list = handlers.get(eventName) || []
  list.push(handler)
  handlers.set(eventName, list)
}

async function send(eventName, data) {
  if (!Object.values(eventNames).includes(eventName)) return
  let normalizedData
  try {
    const serialized = JSON.stringify(data ?? null)
    if (new TextEncoder().encode(serialized).byteLength > 64 * 1024) throw new Error('音源初始化声明超过 64 KB')
    normalizedData = JSON.parse(serialized)
  } catch (error) {
    sendParent({ type: 'source-error', error: String(error?.message || '音源初始化声明无法序列化') })
    return
  }
  sendParent({ type: 'source-event', eventName, data: normalizedData })
}

function request(url, options, callback) {
  const requestId = `request-${++requestSequence}`
  const failRequest = (message) => {
    if (typeof callback === 'function') queueMicrotask(() => callback(new Error(message)))
    return () => {}
  }
  if (String(url || '').length > 4096) return failRequest('音源请求 URL 超过 4096 个字符')
  const normalizedOptions = {}
  if (options && typeof options === 'object') {
    if (options.method) normalizedOptions.method = String(options.method).toUpperCase()
    if (options.headers && typeof options.headers === 'object') {
      const headerEntries = Object.entries(options.headers).filter(([, value]) => value != null)
      if (headerEntries.length > 32 || headerEntries.some(([key, value]) => String(key).length > 128 || String(value).length > 2048)) {
        return failRequest('音源请求头超出数量或长度上限')
      }
      normalizedOptions.headers = Object.fromEntries(headerEntries.map(([key, value]) => [String(key), String(value)]))
    }
    if (typeof options.timeout === 'number') normalizedOptions.timeout = Math.max(500, Math.min(15000, options.timeout))
    if (typeof options.body === 'string' || options.body instanceof ArrayBuffer || ArrayBuffer.isView(options.body)) {
      normalizedOptions.body = options.body
    } else if (options.formData && typeof options.formData === 'object') {
      normalizedOptions.formData = Object.fromEntries(Object.entries(options.formData).map(([key, value]) => [key, String(value)]))
    } else if (options.form && typeof options.form === 'object') {
      normalizedOptions.form = Object.fromEntries(Object.entries(options.form).map(([key, value]) => [key, String(value)]))
    } else if (options.body != null) {
      normalizedOptions.body = JSON.stringify(options.body)
      normalizedOptions.headers = { ...(normalizedOptions.headers || {}), 'content-type': 'application/json' }
    }
  }
  const requestBody = normalizedOptions.body
  const bodyBytes = typeof requestBody === 'string'
    ? new TextEncoder().encode(requestBody).byteLength
    : requestBody instanceof ArrayBuffer
      ? requestBody.byteLength
      : ArrayBuffer.isView(requestBody)
        ? requestBody.byteLength
        : normalizedOptions.formData || normalizedOptions.form
          ? new TextEncoder().encode(JSON.stringify(normalizedOptions.formData || normalizedOptions.form)).byteLength
          : 0
  if (bodyBytes > 64 * 1024) return failRequest('音源请求体超过 64 KB')
  pendingRequests.set(requestId, typeof callback === 'function' ? callback : () => {})
  sendParent({ type: 'source-request', requestId, url: String(url || ''), options: normalizedOptions })
  return () => {
    pendingRequests.delete(requestId)
    sendParent({ type: 'source-cancel', requestId })
  }
}

function dispatch(eventName, data, requestId) {
  const listeners = handlers.get(eventName) || []
  if (listeners.length === 0) {
    sendParent({ type: 'source-response', requestId, ok: false, error: `未注册 ${eventName} 处理器` })
    return
  }
  Promise.resolve().then(async () => {
    const results = await Promise.all(listeners.map((listener) => listener(data)))
    const serialized = JSON.stringify(results[0] ?? null)
    if (new TextEncoder().encode(serialized).byteLength > 64 * 1024) throw new Error('音源操作返回值超过 64 KB')
    sendParent({ type: 'source-response', requestId, ok: true, value: JSON.parse(serialized) })
  }).catch((error) => {
    sendParent({ type: 'source-response', requestId, ok: false, error: String(error?.message || error) })
  })
}

function disableDirectCapabilities() {
  const unavailable = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'Worker', 'SharedWorker', 'BroadcastChannel', 'indexedDB', 'caches', 'navigator', 'postMessage']
  for (const name of unavailable) {
    try { Object.defineProperty(globalThis, name, { configurable: false, enumerable: false, writable: false, value: undefined }) } catch {
      try { globalThis[name] = undefined } catch { /* The sandbox CSP remains the network boundary. */ }
    }
  }
}

self.addEventListener('message', (event) => {
  const message = event.data
  if (!message || typeof message !== 'object') return
  if (message.type === 'initialize') {
    desktopEnvironment = message.env === 'desktop'
    sourceMetadata = message.metadata && typeof message.metadata === 'object' ? message.metadata : {}
    disableDirectCapabilities()
    const lx = Object.freeze({
      EVENT_NAMES: eventNames,
      request,
      on,
      send,
      env: message.env === 'desktop' ? 'desktop' : 'web-sandbox',
      version: '1.0.0',
      currentScriptInfo: Object.freeze({
        name: String(sourceMetadata.name || ''),
        description: String(sourceMetadata.description || ''),
        version: String(sourceMetadata.version || ''),
        author: String(sourceMetadata.author || ''),
        homepage: String(sourceMetadata.homepage || ''),
        rawScript: String(message.script || '')
      }),
      utils
    })
    Object.defineProperty(globalThis, 'lx', { configurable: false, enumerable: true, writable: false, value: lx })
    try {
      // Custom source code runs only in this disposable worker, never in the application page.
      new Function(String(message.script || ''))()
      sendParent({ type: 'source-loaded' })
    } catch (error) {
      sendParent({ type: 'source-error', error: String(error?.message || error) })
    }
    return
  }
  if (message.type === 'request-result') {
    const callback = pendingRequests.get(message.requestId)
    if (!callback) return
    pendingRequests.delete(message.requestId)
    if (message.ok) {
      const response = message.response
      // 部分 LX 脚本读取 resp.status；保持与 statusCode 同步且不可枚举，避免影响序列化。
      if (response && typeof response === 'object' && !('status' in response)) {
        Object.defineProperty(response, 'status', { enumerable: false, configurable: true, get: () => response.statusCode })
      }
      if (desktopEnvironment && typeof response?.body === 'string') {
        // LX desktop attempts JSON parsing regardless of Content-Type, falling
        // back to the original string for LRC, JavaScript and non-JSON responses.
        try { response.body = JSON.parse(response.body) } catch { /* Preserve text. */ }
      }
      callback(null, response, response?.body)
    } else callback(new Error(String(message.error || '网络请求失败')))
    return
  }
  if (message.type === 'dispatch') dispatch(message.eventName, message.data, message.requestId)
})

self.addEventListener('unhandledrejection', (event) => {
  sendParent({ type: 'source-error', error: String(event.reason?.message || event.reason || '脚本异步错误') })
})
