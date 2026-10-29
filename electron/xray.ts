import { parseVlessUrl } from './vless.js'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { createServer, isIP, Socket } from 'node:net'
import { join } from 'node:path'

// One Xray process per VLESS node, shared by every profile (and background task) that uses it.
// Profiles still have separate sessions/cookies; they only share the local SOCKS port.
// Previously each profile spawned its own Xray and waited for it on every open, and processes
// leaked when a profile was closed while its Xray was still starting.
type Instance = { key: string; child: ChildProcess; port: number; configPath: string; owners: Set<string>; idleTimer?: ReturnType<typeof setTimeout> }
const instances = new Map<string, Instance>()
const starting = new Map<string, Promise<Instance>>()
const ownerKeys = new Map<string, string>()
const IDLE_STOP_MS = 60_000

async function freePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function transportName(value: string | null) {
  const transport = (value || 'tcp').toLowerCase()
  if (transport === 'raw') return 'tcp'
  if (transport === 'websocket') return 'ws'
  return transport
}

function buildStreamSettings(url: URL) {
  const query = url.searchParams
  const network = transportName(query.get('type'))
  const security = query.get('security') || 'none'
  const settings: Record<string, unknown> = { network, security }
  const host = query.get('host') || undefined
  const path = query.get('path') || '/'

  if (network === 'ws') settings.wsSettings = { path, headers: host ? { Host: host } : {} }
  if (network === 'grpc') settings.grpcSettings = { serviceName: query.get('serviceName') || query.get('path') || '' }
  if (network === 'xhttp') settings.xhttpSettings = { path, host: host || undefined, mode: query.get('mode') || 'auto' }

  const serverName = query.get('sni') || query.get('serverName') || host || url.hostname
  const fingerprint = query.get('fp') || query.get('fingerprint') || 'chrome'
  const alpn = query.get('alpn')?.split(',').filter(Boolean)
  if (security === 'tls') settings.tlsSettings = { serverName, fingerprint, alpn, allowInsecure: query.get('allowInsecure') === '1' }
  if (security === 'reality') {
    settings.realitySettings = {
      serverName,
      fingerprint,
      publicKey: query.get('pbk') || query.get('publicKey') || '',
      shortId: query.get('sid') || query.get('shortId') || '',
      spiderX: query.get('spx') || query.get('spiderX') || '/',
    }
  }
  return settings
}

export function buildConfig(shareUrl: string, localPort: number, egressInterface?: string, resolvedAddress?: string) {
  parseVlessUrl(shareUrl)
  const url = new URL(shareUrl)
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  return {
    log: { loglevel: 'warning' },
    inbounds: [{
      tag: 'browser-in',
      listen: '127.0.0.1',
      port: localPort,
      protocol: 'socks',
      settings: { auth: 'noauth', udp: true, ip: '127.0.0.1' },
      sniffing: { enabled: true, destOverride: ['http', 'tls', 'quic'] },
    }],
    outbounds: [{
      tag: 'vless-out',
      protocol: 'vless',
      settings: {
        vnext: [{
          address: resolvedAddress || hostname,
          port: Number(url.port),
          users: [{
            id: decodeURIComponent(url.username),
            encryption: url.searchParams.get('encryption') || 'none',
            flow: url.searchParams.get('flow') || '',
          }],
        }],
      },
      streamSettings: { ...buildStreamSettings(url), ...(egressInterface ? { sockopt: { interface: egressInterface } } : {}) },
    }, { protocol: 'freedom', tag: 'direct' }],
    // Keep hostnames intact so the VLESS endpoint resolves them remotely. Local DNS can be
    // several seconds slower and compounds badly on Muse's many cross-origin resources.
    routing: { domainStrategy: 'AsIs', rules: [] },
  }
}

async function resolveDoH(hostname: string): Promise<string> {
  const host = hostname.replace(/^\[|\]$/g, '')
  if (!host || host === 'localhost' || isIP(host)) return host
  const endpoints = [
    `https://223.5.5.5/resolve?name=${encodeURIComponent(host)}&type=A`,
    `https://1.1.1.1/dns-query?name=${encodeURIComponent(host)}&type=A`,
  ]
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(2500) })
      if (!response.ok) continue
      const data: any = await response.json()
      const answer = (data?.Answer || []).find((item: any) => item?.type === 1 && typeof item?.data === 'string' && isIP(item.data) === 4)
      if (answer?.data) return answer.data
    } catch {}
  }
  return host
}

async function waitForPort(port: number, child: ChildProcess) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Xray 启动失败，请检查 VLESS 参数')
    const ready = await new Promise<boolean>((resolve) => {
      const socket = new Socket()
      socket.setTimeout(150)
      socket.once('connect', () => { socket.destroy(); resolve(true) })
      socket.once('error', () => resolve(false))
      socket.once('timeout', () => { socket.destroy(); resolve(false) })
      socket.connect(port, '127.0.0.1')
    })
    if (ready) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('Xray 启动超时')
}

export function selectEgressInterface(defaultRoute: string, targetRoute: string): string | undefined {
  const iface = (route: string) => route.match(/^\s*interface:\s*(\S+)\s*$/m)?.[1]
  const physical = iface(defaultRoute), target = iface(targetRoute)
  if (!target?.startsWith('utun') || !physical || /^(utun|lo)/.test(physical) || !/^[a-zA-Z][a-zA-Z0-9_.-]{0,20}$/.test(physical)) return undefined
  return physical
}

async function egressInterface(server: string) {
  if (server === 'localhost' || server === '[::1]' || server.startsWith('127.')) return undefined
  if (process.platform !== 'darwin') return undefined
  const read = (address: string) => new Promise<string>(resolve => execFile('/sbin/route', ['-n','get',address], { timeout: 2000 }, (error, stdout) => resolve(error ? '' : stdout)))
  const [normal, target] = await Promise.all([read('default'), read('1.1.1.1')])
  return selectEgressInterface(normal, target)
}

async function spawnInstance(key: string, shareUrl: string, userDataPath: string, binaryPath: string) {
  const port = await freePort()
  const configDir = join(userDataPath, 'xray')
  await mkdir(configDir, { recursive: true })
  const configPath = join(configDir, `shared-${key}.json`)
  const hostname = new URL(shareUrl).hostname
  const [egress, resolvedAddress] = await Promise.all([egressInterface(hostname), resolveDoH(hostname)])
  await writeFile(configPath, JSON.stringify(buildConfig(shareUrl, port, egress, resolvedAddress), null, 2), { mode: 0o600 })
  const child = spawn(binaryPath, ['run', '-c', configPath], { stdio: ['ignore', 'ignore', 'pipe'] })
  let spawnError: Error | undefined
  child.once('error', (error) => { spawnError = error })
  let errorOutput = ''
  child.stderr?.on('data', (chunk) => { errorOutput += String(chunk).slice(-4000) })
  const instance: Instance = { key, child, port, configPath, owners: new Set() }
  child.once('exit', () => {
    if (instances.get(key) === instance) instances.delete(key)
    void unlink(configPath).catch(() => undefined)
  })
  try {
    if (!child.pid) {
      await new Promise((resolve) => setImmediate(resolve))
      throw spawnError || new Error('无法启动 Xray，请检查安装包中的代理内核')
    }
    await waitForPort(port, child)
  } catch (error) {
    if (child.exitCode === null) child.kill('SIGTERM')
    await unlink(configPath).catch(() => undefined)
    if (spawnError) throw new Error('无法启动 Xray，请检查安装包中的代理内核')
    if (errorOutput.trim()) throw new Error(`Xray：${errorOutput.trim().split('\n').at(-1)}`)
    throw error
  }
  instances.set(key, instance)
  return instance
}

function scheduleIdleStop(instance: Instance) {
  if (instance.owners.size || instance.idleTimer) return
  instance.idleTimer = setTimeout(() => {
    instance.idleTimer = undefined
    if (instance.owners.size) return
    if (instances.get(instance.key) === instance) instances.delete(instance.key)
    if (instance.child.exitCode === null) instance.child.kill('SIGTERM')
  }, IDLE_STOP_MS)
}

/** Returns the local SOCKS port for this VLESS node, starting Xray only if no profile is using it yet. */
export async function startXray(ownerId: string, shareUrl: string, userDataPath: string, binaryPath: string) {
  stopXray(ownerId)
  const key = createHash('sha256').update(shareUrl).digest('hex').slice(0, 16)
  ownerKeys.set(ownerId, key)
  let instance = instances.get(key)
  if (!instance || instance.child.exitCode !== null) {
    let pending = starting.get(key)
    if (!pending) {
      pending = spawnInstance(key, shareUrl, userDataPath, binaryPath).finally(() => starting.delete(key))
      starting.set(key, pending)
    }
    try { instance = await pending }
    catch (error) {
      if (ownerKeys.get(ownerId) === key) ownerKeys.delete(ownerId)
      throw error
    }
  }
  if (ownerKeys.get(ownerId) !== key) {
    // The owner was released while Xray was starting; don't keep a process alive for it.
    scheduleIdleStop(instance)
    throw new Error('Profile 已关闭')
  }
  if (instance.idleTimer) { clearTimeout(instance.idleTimer); instance.idleTimer = undefined }
  instance.owners.add(ownerId)
  return instance.port
}

export function stopXray(ownerId: string) {
  const key = ownerKeys.get(ownerId)
  ownerKeys.delete(ownerId)
  const instance = key ? instances.get(key) : undefined
  if (!instance) return
  instance.owners.delete(ownerId)
  scheduleIdleStop(instance)
}

export function stopAllXray() {
  for (const instance of instances.values()) {
    if (instance.idleTimer) clearTimeout(instance.idleTimer)
    if (instance.child.exitCode === null) instance.child.kill('SIGTERM')
  }
  instances.clear()
  ownerKeys.clear()
}

/** Kill Xray processes left behind by a crashed or force-quit Orbit (only ones using our config dir). */
export async function killOrphanXray(userDataPath: string) {
  const pattern = `${join(userDataPath, 'xray')}/`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  await new Promise<void>((resolve) => execFile('/usr/bin/pkill', ['-f', pattern], () => resolve()))
}
