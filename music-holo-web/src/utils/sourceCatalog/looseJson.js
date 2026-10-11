// 部分公开接口（如酷我 search.kuwo.cn/r.s）返回单引号 Python/JS 字面量而不是
// 严格 JSON。这里用一个小解析器读取，不使用 eval/Function，避免执行远端文本。

function parseString(input, start, quote) {
  let index = start + 1
  let value = ''
  while (index < input.length) {
    const char = input[index]
    if (char === '\\') {
      const next = input[index + 1]
      if (next === undefined) break
      if (next === quote || next === '\\') {
        value += next
        index += 2
        continue
      }
      // 保留 \uXXXX 等转义序列，交给 JSON.parse 处理。
      value += char + next
      index += 2
      continue
    }
    if (char === quote) return { value: decodeEscapes(value), next: index + 1 }
    value += char
    index += 1
  }
  throw new Error('松散 JSON 字符串未闭合')
}

function decodeEscapes(value) {
  if (!value.includes('\\u')) return value
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`)
  } catch {
    return value.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
  }
}

function parseBare(input, start) {
  let index = start
  while (index < input.length && !',:}]'.includes(input[index])) index += 1
  return { value: input.slice(start, index).trim(), next: index }
}

function parseValue(input, start) {
  let index = start
  while (index < input.length && /\s/.test(input[index])) index += 1
  const char = input[index]
  if (char === '{') return parseObject(input, index)
  if (char === '[') return parseArray(input, index)
  if (char === "'" || char === '"') return parseString(input, index, char)
  return parseBare(input, index)
}

function parseObject(input, start) {
  const result = {}
  let index = start + 1
  for (;;) {
    while (index < input.length && /[\s,]/.test(input[index])) index += 1
    if (input[index] === '}') return { value: result, next: index + 1 }
    if (index >= input.length) throw new Error('松散 JSON 对象未闭合')
    const key = parseValue(input, index)
    index = key.next
    while (index < input.length && /\s/.test(input[index])) index += 1
    if (input[index] !== ':') throw new Error('松散 JSON 缺少冒号')
    const entry = parseValue(input, index + 1)
    result[String(key.value)] = entry.value
    index = entry.next
  }
}

function parseArray(input, start) {
  const result = []
  let index = start + 1
  for (;;) {
    while (index < input.length && /[\s,]/.test(input[index])) index += 1
    if (input[index] === ']') return { value: result, next: index + 1 }
    if (index >= input.length) throw new Error('松散 JSON 数组未闭合')
    const entry = parseValue(input, index)
    result.push(entry.value)
    index = entry.next
  }
}

export function parseLooseJson(text) {
  const input = String(text ?? '').trim()
  if (!input) throw new Error('接口返回了空响应')
  try {
    return JSON.parse(input)
  } catch {
    // 继续尝试宽松解析。
  }
  const parsed = parseValue(input, 0)
  return parsed.value
}
