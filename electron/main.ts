import { app, BrowserWindow, ipcMain, Menu, safeStorage, session } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isIP } from 'node:net'
import { readV2rayNodes, mergeV2rayFavorites } from './v2ray-sync.js'
import { updateStatus } from './update-center.js'
import { NativeBrowsers } from './native-browser.js'
import { assignProfileNumbers } from './profile-numbers.js'
import { lookupExitLocation, resolveIPEnvironment, type ExitLocation } from './ip-environment.js'
import { parseVlessUrl } from './vless.js'
import { killOrphanXray, startXray, stopAllXray, stopXray } from './xray.js'

// Avoid macOS Keychain prompts on unsigned/ad-hoc builds.
app.commandLine.appendSwitch('use-mock-keychain')
app.commandLine.appendSwitch('password-store', 'basic')

if (app.isPackaged) {
  const prismData = join(app.getPath('appData'), 'prism-fingerprint-browser')
  app.setPath('userData', prismData)
  app.setPath('sessionData', prismData)
}

const dirname = fileURLToPath(new URL('.', import.meta.url))
let mainWindow: BrowserWindow | null = null
let appIsQuitting = false
let appStateCache: any = null
let stateWriteQueue = Promise.resolve()
let nativeManager: NativeBrowsers | undefined
const nativeLaunchVersions = new Map<string, number>()
const profileSessionLocks = new Map<string, Promise<void>>()

// Cache exit IP & geo-location per proxy for 30 minutes so opening profiles on the same proxy launches in 0ms.
const PROXY_CACHE_TTL_MS = 30 * 60_000
const proxyLocationCache = new Map<string, { location: ExitLocation; at: number }>()

function proxyCacheKey(proxy: any): string {
  if (!proxy || proxy.kind === 'direct') return 'direct'
  if (proxy.kind === 'system') return 'system'
  if (proxy.kind === 'vless') return `vless:${proxy.shareUrl || proxy.id}`
  return JSON.stringify([proxy.kind,proxy.host,proxy.port,proxy.username || '',proxy.password || ''])
}

function getCachedProxyLocation(proxy: any): ExitLocation | undefined {
  const entry = proxyLocationCache.get(proxyCacheKey(proxy))
  if (!entry) return undefined
  if (Date.now() - entry.at > PROXY_CACHE_TTL_MS) {
    proxyLocationCache.delete(proxyCacheKey(proxy))
    return undefined
  }
  return entry.location
}

function setCachedProxyLocation(proxy: any, location: ExitLocation) {
  proxyLocationCache.set(proxyCacheKey(proxy), { location, at: Date.now() })
}

function nativeBrowsers() {
  return nativeManager ||= new NativeBrowsers(
    app.getPath('userData'),
    app.isPackaged ? process.resourcesPath : join(dirname, '../resources'),
    notifyProfileRuntime,
    id => stopXray(id)
  )
}

function runningIds() {
  return nativeManager?.ids || []
}

function notifyProfileRuntime() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('profile:runtime', runningIds())
  }
}

function isSafeProfileId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value)
}

async function withProfileSessionLock<T>(profileId: string, task: () => Promise<T>) {
  const previous = profileSessionLocks.get(profileId) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  const queued = previous.then(() => current)
  profileSessionLocks.set(profileId, queued)
  await previous
  try {
    return await task()
  } finally {
    release()
    if (profileSessionLocks.get(profileId) === queued) profileSessionLocks.delete(profileId)
  }
}

const defaultState = {
  presentationMode: 'windows',
  profiles: [],
  proxies: [
    { id: 'system', name: '跟随本机系统代理', kind: 'system' },
    { id: 'direct', name: '本机直连（不走代理）', kind: 'direct' },
  ],
  groups: [
    { id: 'group-daily', name: '日常在用', color: '#ef6a63' },
    { id: 'group-temporary', name: '临时使用', color: '#8d7cf6' },
  ],
  defaultProxyId: 'system',
}

function statePath() {
  return join(app.getPath('userData'), 'workspace.json')
}

async function loadState(allowBackup = true): Promise<any> {
  if (appStateCache) return structuredClone(appStateCache)
  try {
    const state = JSON.parse(await readFile(statePath(), 'utf8'))
    const beforeNumbers = JSON.stringify(state.profiles)
    assignProfileNumbers(state)
    let migrated = beforeNumbers !== JSON.stringify(state.profiles)
    if (!Array.isArray(state.groups) || state.groups.length === 0) state.groups = defaultState.groups
    if (!Array.isArray(state.proxies)) state.proxies = [...defaultState.proxies]
    if (!state.proxies.some((p: any) => p.id === 'system')) {
      state.proxies.unshift({ id: 'system', name: '跟随本机系统代理', kind: 'system' })
      migrated = true
    }
    if (!state.proxies.some((p: any) => p.id === 'direct')) {
      state.proxies.push({ id: 'direct', name: '本机直连（不走代理）', kind: 'direct' })
      migrated = true
    }
    if (!state.defaultProxyId || !(state.proxies ?? []).some((proxy: any) => proxy.id === state.defaultProxyId)) {
      state.defaultProxyId = 'system'
      migrated = true
    }
    const profileIds = new Set<string>()
    for (const profile of state.profiles ?? []) {
      if (!isSafeProfileId(profile.id) || profileIds.has(profile.id)) {
        profile.id = randomUUID()
        migrated = true
      }
      profileIds.add(profile.id)
      if (!profile.groupId) profile.groupId = state.groups[0].id
      delete profile.syncMuseUsage
      delete profile.syncMuseAvatar
      delete profile.usageDisplay
      delete profile.frozenAt
    }
    const hasLegacyEncrypted = (state.proxies ?? []).some((proxy: any) =>
      ['password', 'shareUrl'].some((key) => typeof proxy?.[key] === 'string' && proxy[key].startsWith('enc:v1:'))
    )
    if (hasLegacyEncrypted) {
      let v2rayBySource = new Map<string, any>()
      try {
        const { nodes } = await readV2rayNodes(app.getPath('appData'))
        v2rayBySource = new Map(nodes.map((node: any) => [String(node.sourceId), node]))
      } catch {}
      for (const proxy of state.proxies ?? []) {
        const matched = proxy.sourceId ? v2rayBySource.get(String(proxy.sourceId)) : undefined
        for (const key of ['password', 'shareUrl'] as const) {
          const value = proxy[key]
          if (typeof value === 'string' && value.startsWith('enc:v1:')) {
            if (matched && typeof matched[key] === 'string') {
              proxy[key] = matched[key]
              migrated = true
            } else {
              try {
                if (safeStorage.isEncryptionAvailable()) {
                  proxy[key] = safeStorage.decryptString(Buffer.from(value.slice(7), 'base64'))
                  migrated = true
                }
              } catch {
                delete proxy[key]
                migrated = true
              }
            }
          }
        }
      }
    }
    if (migrated) { saveState(state); await flushState() }
    appStateCache = state
    return state
  } catch (error) {
    if (allowBackup) {
      try {
        await copyFile(`${statePath()}.bak`, statePath())
        return loadState(false)
      } catch {}
    }
    appStateCache = defaultState
    return defaultState
  }
}

let pendingStateSnapshot: any = null
let stateWriteTimer: ReturnType<typeof setTimeout> | null = null
let lastStateBackupAt = 0

function saveState(state: unknown) {
  appStateCache = assignProfileNumbers(structuredClone(state), appStateCache)
  pendingStateSnapshot = appStateCache
  if (!stateWriteTimer) stateWriteTimer = setTimeout(() => { void flushState() }, 400)
  return Promise.resolve()
}

function flushState() {
  if (stateWriteTimer) { clearTimeout(stateWriteTimer); stateWriteTimer = null }
  if (!pendingStateSnapshot) return stateWriteQueue
  const snapshot = structuredClone(pendingStateSnapshot)
  pendingStateSnapshot = null
  stateWriteQueue = stateWriteQueue.then(async () => {
    await mkdir(app.getPath('userData'), { recursive: true })
    const target = statePath()
    const temporary = `${target}.tmp`
    const backup = `${target}.bak`
    if (Date.now() - lastStateBackupAt > 5 * 60_000) {
      await copyFile(target, backup).catch(() => undefined)
      lastStateBackupAt = Date.now()
    }
    await writeFile(temporary, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 })
    await rename(temporary, target)
  }).catch((error) => { console.error('Unable to save Prism state', error) })
  return stateWriteQueue
}

function xrayBinaryPath() {
  return app.isPackaged
    ? join(process.resourcesPath, 'bin/xray')
    : join(dirname, '../resources/bin/xray')
}

const sessionProxyRules = new WeakMap<Electron.Session, string>()

async function configureProxy(ownerId: string, ses: Electron.Session, proxy: any): Promise<string> {
  stopXray(ownerId)
  if (!proxy) throw new Error('Profile 引用的代理不存在；已阻止本机直连')
  try {
    let rules: string
    if (proxy.kind === 'direct') rules = 'direct'
    else if (proxy.kind === 'system') rules = 'system'
    else if (proxy.kind === 'socks5') rules = `socks5://${proxy.host}:${proxy.port}`
    else if (proxy.kind === 'vless') {
      if (!proxy.shareUrl) throw new Error('VLESS 节点缺少分享链接')
      const port = await startXray(ownerId, proxy.shareUrl, app.getPath('userData'), xrayBinaryPath())
      rules = `socks5://127.0.0.1:${port}`
    } else {
      throw new Error(`不支持的代理类型：${String(proxy.kind)}`)
    }
    const previous = sessionProxyRules.get(ses)
    if (previous !== rules) {
      await (rules === 'direct'
        ? ses.setProxy({ mode: 'direct' })
        : rules === 'system'
          ? ses.setProxy({ mode: 'system' })
          : ses.setProxy({ proxyRules: rules, proxyBypassRules: '<-loopback>' }))
      sessionProxyRules.set(ses, rules)
      if (previous !== undefined) {
        void ses.closeAllConnections().catch(() => undefined)
        void ses.clearHostResolverCache().catch(() => undefined)
      }
    }
    return rules
  } catch (error) {
    stopXray(ownerId)
    throw error
  }
}

// The shared probe Session has mutable proxy settings. Hold this lock for the
// complete configure + fetch transaction, including errors, across all callers.
let probeQueue: Promise<unknown> = Promise.resolve()
function withProbeLock<T>(task: () => Promise<T>): Promise<T> {
  const next = probeQueue.then(task, task)
  probeQueue = next.then(() => undefined, () => undefined)
  return next
}

// Single reusable non-persistent session for exit-IP probing (avoids leaking partition contexts).
function sharedProbeSession() {
  return session.fromPartition('prism-net-probe', { cache: false })
}

async function openProfileOnce(profile: any, proxy: any) {
  if (!isSafeProfileId(profile?.id)) return { ok: false, error: 'Profile ID 无效' }
  const launchVersion = nativeLaunchVersions.get(profile.id) || 0
  return withProfileSessionLock(profile.id, async () => {
    try {
      if (nativeBrowsers().has(profile.id)) {
        if (process.env.ORBIT_BACKGROUND_TEST !== '1') await nativeBrowsers().focus(profile.id)
        return { ok: true }
      }
      const state = assignProfileNumbers(appStateCache || await loadState())
      const stored = state.profiles.find((p: any) => p.id === profile.id)
      if (!stored) throw new Error('请先保存 Profile')
      await saveState(state)

      const { proxyRules, location, resolved } = await withProbeLock(async () => {
        const ses = sharedProbeSession()
        const proxyRules = await configureProxy(profile.id, ses, proxy)

        // Fast path: reuse cached exit IP / timezone / locale if already probed for this proxy!
        let location = getCachedProxyLocation(proxy)
        let resolved: any
        if (location) {
          const wantsTimezone = !profile.timezone || profile.timezone === 'auto'
          const wantsLocale = profile.locale === 'auto'
          const wantsGeo = profile.fingerprint?.geolocationMode === 'ip'
          resolved = {
            ...profile,
            timezone: wantsTimezone ? location.timezone : profile.timezone,
            locale: wantsLocale ? location.locale : profile.locale,
            fingerprint: wantsGeo ? {
              ...(profile.fingerprint || {}),
              geolocation: { latitude: location.latitude, longitude: location.longitude, accuracy: 2000 },
            } : profile.fingerprint,
            exitLocation: location,
          }
        } else {
          resolved = await resolveIPEnvironment(profile, ses)
          location = resolved.exitLocation || await lookupExitLocation(ses).catch(() => undefined)
          if (location) setCachedProxyLocation(proxy, location)
        }

        return { proxyRules, location, resolved }
      })

      if (appIsQuitting || (nativeLaunchVersions.get(profile.id) || 0) !== launchVersion) throw new Error('启动已取消')
      await nativeBrowsers().open(resolved, stored.number, proxyRules, proxy, location, process.env.ORBIT_BACKGROUND_TEST === '1')
      if (appIsQuitting || (nativeLaunchVersions.get(profile.id) || 0) !== launchVersion) {
        await nativeBrowsers().close(profile.id)
        throw new Error('启动已取消')
      }
      return { ok: true }
    } catch (error) {
      stopXray(profile.id)
      return { ok: false, error: error instanceof Error ? error.message : '原生浏览器启动失败' }
    }
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'DLB Browser 指纹浏览器',
    width: 1440,
    height: 900,
    minWidth: 1060,
    minHeight: 680,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: '#f4f6f8',
    show: false,
    webPreferences: {
      preload: join(dirname, '../electron/preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,
    },
  })
  mainWindow.on('close', (event) => {
    if (!appIsQuitting) { event.preventDefault(); app.quit() }
  })
  mainWindow.on('closed', () => { mainWindow = null })
  mainWindow.once('ready-to-show', () => { if (process.env.ORBIT_BACKGROUND_TEST !== '1') mainWindow?.show() })
  if (process.env.VITE_DEV_SERVER_URL) void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  else void mainWindow.loadFile(join(dirname, '../dist/index.html'))
}

function installMenu() {
  const send = (channel: string, ...args: unknown[]) => mainWindow?.webContents.send(channel, ...args)
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'DLB Browser', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: '文件', submenu: [
      { label: '新建 Profile', accelerator: 'CommandOrControl+T', click: () => send('shortcut:new-tab') },
      { type: 'separator' }, { role: 'close' },
    ] },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '显示', submenu: [
      { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' },
    ] },
    { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }] },
  ]))
}

if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', (_event, argv) => {
  void openProfileArgument(argv)
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.whenReady().then(async () => {
  await killOrphanXray(app.getPath('userData'))
  createWindow()
  installMenu()
  void openProfileArgument(process.argv)
  app.on('activate', () => { if (!mainWindow) createWindow(); else { mainWindow.show(); mainWindow.focus() } })
})

async function openProfileArgument(argv: string[]) {
  const id = argv.find(arg => arg.startsWith('--prism-open='))?.slice('--prism-open='.length)
  if (!id || !isSafeProfileId(id)) return
  const state = await loadState()
  const profile = state.profiles.find((p: any) => p.id === id)
  if (!profile) return
  await openProfileOnce(profile, state.proxies.find((p: any) => p.id === profile.proxyId))
}

app.on('window-all-closed', () => app.quit())
let quitting = false
let shutdownComplete = false
app.on('before-quit', (event) => {
  if (shutdownComplete) return
  appIsQuitting = true
  if (quitting) { event.preventDefault(); return }
  event.preventDefault()
  quitting = true
  void (async () => {
    await Promise.allSettled([...profileSessionLocks.values()])
    await nativeManager?.closeAll()
    stopAllXray()
    await flushState()
    shutdownComplete = true
    app.quit()
  })().catch(() => { quitting = false; appIsQuitting = false })
})

ipcMain.handle('v2ray:scan', () => readV2rayNodes(app.getPath('appData')))
ipcMain.handle('v2ray:sync', async (_event, selected) => {
  const available = await readV2rayNodes(app.getPath('appData'))
  const state = await loadState()
  const result = mergeV2rayFavorites(state.proxies, available.nodes, selected)
  const next = { ...state, proxies: result.proxies }
  await saveState(next)
  await flushState()
  return { state: next, added: result.added, updated: result.updated }
})
ipcMain.handle('updates:status', (_event, check) => updateStatus(app.isPackaged ? process.resourcesPath : join(dirname, '../resources'), app.getVersion(), check === true))
ipcMain.handle('state:load', async () => {
  const state = await loadState()
  state.presentationMode = 'windows'
  return state
})
ipcMain.handle('state:save', (_event, state) => saveState(state))
ipcMain.handle('profile:runtime', () => runningIds())
ipcMain.handle('workspace:mode', async () => ({ ok: true }))

ipcMain.handle('proxy:parse-vless', (_event, url: string) => {
  try { return { ok: true, node: parseVlessUrl(url) } }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : '无法解析 VLESS 链接' } }
})

ipcMain.handle('proxy:test', async (_event, proxy: any) => withProbeLock(async () => {
  const testId = `proxy-test-${randomUUID()}`
  const ses = sharedProbeSession()
  const started = Date.now()
  try {
    await configureProxy(testId, ses, proxy)
    const endpoints = ['https://api64.ipify.org', 'https://icanhazip.com', 'https://ifconfig.me/ip']
    let lastError = '无法连接出口 IP 检测服务'
    for (const endpoint of endpoints) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)
      try {
        const response = await ses.fetch(endpoint, { signal: controller.signal, headers: { accept: 'text/plain' } })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const ip = (await response.text()).trim()
        if (!isIP(ip)) throw new Error('检测服务未返回有效 IP')
        const latency = Date.now() - started
        try {
          const location = await lookupExitLocation(ses)
          setCachedProxyLocation(proxy, location)
          if (location.ip !== ip) return { ok: true, latency, ip, locationWarning: '两次查询出口不一致，节点可能轮换 IP' }
          return { ok: true, latency, ip, location }
        } catch {
          return { ok: true, latency, ip, locationWarning: '出口可用，但地理查询失败或受限' }
        }
      } catch {
        lastError = controller.signal.aborted ? '出口 IP 检测超时，请检查节点连接后重试' : '无法通过当前节点连接 IP 检测服务，请检查节点或网络'
      } finally {
        clearTimeout(timer)
      }
    }
    throw new Error(lastError)
  } catch (error) {
    return { ok: false, latency: Date.now() - started, error: error instanceof Error ? error.message : '代理连接失败' }
  } finally {
    stopXray(testId)
  }
}))

ipcMain.handle('profile:open', (_event, profile, proxy) => openProfileOnce(profile, proxy))

ipcMain.handle('profile:close', async (_event, profileId: string) => {
  nativeLaunchVersions.set(profileId, (nativeLaunchVersions.get(profileId) || 0) + 1)
  await nativeManager?.close(profileId)
  stopXray(profileId)
})

ipcMain.handle('profile:delete', async (_event, profileIds: string[]) => {
  const ids = Array.isArray(profileIds) ? profileIds.filter(isSafeProfileId) : []
  for (const id of ids) {
    nativeLaunchVersions.set(id, (nativeLaunchVersions.get(id) || 0) + 1)
    await nativeBrowsers().removeProfileData(id).catch(() => undefined)
    stopXray(id)
  }
  const state = await loadState()
  const next = { ...state, profiles: (state.profiles ?? []).filter((p: any) => !ids.includes(p.id)) }
  await saveState(next)
  await flushState()
  return { ok: true, state: next }
})

ipcMain.handle('profile:cookies-export', async (_event, profileId: string) => {
  if (!isSafeProfileId(profileId)) return { ok: false, error: 'Profile ID 无效' }
  try {
    const cookies = await nativeBrowsers().exportCookies(profileId)
    return { ok: true, cookies }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '导出 Cookie 失败' }
  }
})

ipcMain.handle('profile:cookies-import', async (_event, profileId: string, rawCookies: any[]) => {
  if (!isSafeProfileId(profileId)) return { ok: false, error: 'Profile ID 无效' }
  try {
    const count = await nativeBrowsers().importCookies(profileId, rawCookies)
    return { ok: true, count }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '导入 Cookie 失败' }
  }
})
