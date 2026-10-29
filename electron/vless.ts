import { randomUUID } from 'node:crypto'

export interface ParsedVlessNode {
  id: string
  name: string
  kind: 'vless'
  host: string
  port: number
  username: string
  shareUrl: string
  transport: string
  security: string
  flow?: string
  sni?: string
  fingerprint?: string
  publicKey?: string
  shortId?: string
}

function first(params: URLSearchParams, ...keys: string[]) {
  for (const key of keys) {
    const value = params.get(key)
    if (value) return value
  }
  return undefined
}

export function parseVlessUrl(input: string): ParsedVlessNode {
  const value = input.trim()
  if (!value.toLowerCase().startsWith('vless://')) {
    throw new Error('链接必须以 vless:// 开头')
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('VLESS 链接格式不正确')
  }

  const uuid = decodeURIComponent(url.username)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
    throw new Error('UUID 缺失或格式不正确')
  }

  const port = Number(url.port)
  if (!url.hostname || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('服务器地址或端口不正确')
  }

  const rawTransport = (first(url.searchParams, 'type') ?? 'tcp').toLowerCase()
  const transport = rawTransport === 'raw' ? 'tcp' : rawTransport === 'websocket' ? 'ws' : rawTransport
  const security = first(url.searchParams, 'security') ?? 'none'
  if (!['tcp', 'ws', 'grpc', 'xhttp'].includes(transport)) throw new Error('暂不支持此 VLESS 传输方式')
  if (!['none', 'tls', 'reality'].includes(security)) throw new Error('不支持此 VLESS 安全类型')
  if (security === 'reality' && !first(url.searchParams, 'pbk', 'publicKey')) throw new Error('REALITY 缺少公钥')
  const name = decodeURIComponent(url.hash.slice(1)) || `${url.hostname}:${port}`

  return {
    id: randomUUID(),
    name,
    kind: 'vless',
    host: url.hostname,
    port,
    username: uuid,
    shareUrl: value,
    transport,
    security,
    flow: first(url.searchParams, 'flow'),
    sni: first(url.searchParams, 'sni', 'serverName'),
    fingerprint: first(url.searchParams, 'fp', 'fingerprint'),
    publicKey: first(url.searchParams, 'pbk', 'publicKey'),
    shortId: first(url.searchParams, 'sid', 'shortId'),
  }
}
