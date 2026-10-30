import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { access, mkdir, readFile, writeFile, rename, rm, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ChromePipe } from './chrome-pipe.js'
import { fingerprintSource } from './fingerprint.js'
import { nativeHome } from './native-home.js'
const exec = promisify(execFile)
const safeId = (id: string) => /^[a-zA-Z0-9_-]{1,100}$/.test(id)
function numericSeed(profile: any): number {
  const raw = String(profile.fingerprint?.seed || profile.id || 'prism')
  if (/^\d+$/.test(raw)) {
    const parsed = (Number(raw) & 0x7fffffff) >>> 0
    if (parsed > 0) return parsed
  }
  let h = 2166136261
  for (const ch of raw) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  return ((h & 0x7fffffff) >>> 0) || 1
}
const PROFILE_PALETTE = [
  { name: 'Sky Blue', color: 0xFF0284C7 | 0, hex: '#0284C7' },
  { name: 'Indigo',   color: 0xFF4F46E5 | 0, hex: '#4F46E5' },
  { name: 'Emerald',  color: 0xFF059669 | 0, hex: '#059669' },
  { name: 'Amber',    color: 0xFFD97706 | 0, hex: '#D97706' },
  { name: 'Purple',   color: 0xFF7C3AED | 0, hex: '#7C3AED' },
  { name: 'Ocean',    color: 0xFF0284C7 | 0, hex: '#0284C7' },
  { name: 'Green',    color: 0xFF16A34A | 0, hex: '#16A34A' },
  { name: 'Orange',   color: 0xFFEA580C | 0, hex: '#EA580C' },
  { name: 'Rose',     color: 0xFFE11D48 | 0, hex: '#E11D48' },
  { name: 'Teal',     color: 0xFF0D9488 | 0, hex: '#0D9488' },
]

// Generated files are stable between launches; avoid disk writes/extension reloads
// when the Profile configuration has not changed.
async function writeGenerated(path: string, content: string) {
  if (await readFile(path, 'utf8').catch(() => undefined) === content) return
  await writeFile(path, content, { mode: 0o600 })
}

const BADGE_EXTENSION_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAp6LSRGsAsShxqw6a88PoEca6UQCRRG3Y/39WG6joN+A/jTD1P1bxmNd1Xk8JedBxT0Bof/P8NrxLrwUrXs0A52rATovBcC261W8V7XzwtLOXngAKpR+BrY5AfOdpTOMfzIh1spt4HUdXsZGBTa3ZoLf3mY93sTt3xhyVxdFoUB7R4DzP7/ecTSX3z+XcqJ7rKQbaLnXnfW/JkQIpiiiv856+9TfOAS3nHvqMDIhgPpA6hgKhftDWSPECHxLShVlqwAvQpR19HTy1KzagMOpYM4UImfopFW/1O1OF1avfxFOAKlKphZdnWhrvl7fp8k++mdbNFppY7Ei93ANEHKqioQIDAQAB'
const BADGE_EXTENSION_ID = 'jmfmedbigjdliajdcninidnbeidgbcoi'

async function ensureProfileBadgeExtension(directory: string, number: number, profile: any, proxy?: any, themeHex?: string) {
  const extDir = join(directory, 'prism-badge-extension')
  await mkdir(extDir, { recursive: true, mode: 0o700 })
  const tags = [...new Set((profile.alias || profile.notes || '').split(/[,，]/).map((t: string) => t.trim()).filter(Boolean))]
  const tagsStr = tags.length ? tags.join(' · ') : ''
  const proxyPart = proxy?.name && proxy.kind !== 'direct' ? ` · ⚡️${proxy.name}` : ''
  const badgeTitle = `#${number} ${profile.name || 'Profile'}${proxyPart}`
  const color = themeHex || '#EA580C'

  const manifest = {
    manifest_version: 3,
    name: `Prism #${number} · ${profile.name || 'Profile'}`,
    version: '1.0.0',
    description: 'Prism Profile Environment Badge',
    key: BADGE_EXTENSION_KEY,
    action: {
      default_title: badgeTitle,
      default_popup: 'popup.html'
    },
    background: {
      service_worker: 'background.js'
    }
  }
  await writeGenerated(join(extDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

  const bg = `
const BADGE_TEXT = '#${number}';
const BADGE_COLOR = '${color}';
const BADGE_TITLE = ${JSON.stringify(badgeTitle)};

function applyBadge() {
  try {
    chrome.action.setBadgeText({ text: BADGE_TEXT });
    chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
    chrome.action.setTitle({ title: BADGE_TITLE });
  } catch (e) {}
}

chrome.runtime.onInstalled.addListener(applyBadge);
chrome.runtime.onStartup.addListener(applyBadge);
applyBadge();
`
  await writeGenerated(join(extDir, 'background.js'), bg)

  const popupHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      margin: 0;
      padding: 14px 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      color: #1e293b;
      background: #f8fafc;
      width: 250px;
      user-select: none;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid #e2e8f0;
    }
    .pill {
      background: ${color};
      color: #fff;
      font-weight: 700;
      font-size: 13px;
      padding: 3px 8px;
      border-radius: 6px;
    }
    .name {
      font-weight: 600;
      font-size: 13px;
      color: #0f172a;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .row {
      display: flex;
      justify-content: space-between;
      margin-top: 7px;
      font-size: 11px;
    }
    .label { color: #64748b; }
    .val { font-weight: 500; color: #334155; }
  </style>
</head>
<body>
  <div class="header">
    <span class="pill">#${number}</span>
    <span class="name">${profile.name || 'Profile'}</span>
  </div>
  ${tagsStr ? `<div class="row"><span class="label">别名</span><span class="val">${tagsStr}</span></div>` : ''}
  <div class="row"><span class="label">代理节点</span><span class="val">${proxy?.name || '本机直连'}</span></div>
  <div class="row"><span class="label">环境时区</span><span class="val">${profile.timezone || '跟随系统'}</span></div>
  <div class="row"><span class="label">指纹内核</span><span class="val">Chromium 148</span></div>
</body>
</html>`
  await writeGenerated(join(extDir, 'popup.html'), popupHtml)

  return extDir
}

async function ensureProfilePreferences(directory: string, profile: any, number: number, homepageUrl: string, proxy?: any) {
  const defaultDir = join(directory, 'Default')
  await mkdir(defaultDir, { recursive: true, mode: 0o700 })
  const prefPath = join(defaultDir, 'Preferences')
  let prefs: any = {}
  try { prefs = JSON.parse(await readFile(prefPath, 'utf8')) } catch {}
  prefs.bookmark_bar = {
    ...(prefs.bookmark_bar || {}),
    show_on_all_tabs: true,
    show_apps_shortcut: false,
    show_managed_bookmarks: false,
  }
  prefs.omnibox = {
    ...(prefs.omnibox || {}),
    prevent_url_elisions: true,
    show_google_lens_shortcut: false,
    show_ai_mode_omnibox_button: false,
    show_search_tools: false,
  }
  prefs.extensions = {
    ...(prefs.extensions || {}),
    pinned_extensions: Array.from(new Set([
      ...(prefs.extensions?.pinned_extensions || []),
      BADGE_EXTENSION_ID,
    ])),
  }
  const tags = [...new Set((profile.alias || profile.notes || '').split(/[,，]/).map((t: string) => t.trim()).filter(Boolean))]
  const tagsStr = tags.length ? tags.join(' · ') : ''
  const proxyPart = proxy?.name && proxy.kind !== 'direct' ? ` · ⚡️${proxy.name}` : ''
  const badgeTitle = tagsStr
    ? `🔴 #${number} [${tagsStr}]${proxyPart}`
    : `🔴 #${number}${proxyPart}`

  const theme = PROFILE_PALETTE[number % PROFILE_PALETTE.length]
  const profileDisplayName = tagsStr ? `#${number} [${tagsStr}]` : `#${number} · ${profile.name || 'Chromium'}`

  prefs.autogenerated_theme = {
    color: theme.color,
  }
  prefs.browser = {
    ...(prefs.browser || {}),
    theme: {
      color_scheme: 1,
      user_color: theme.color,
    },
  }
  prefs.profile = {
    ...(prefs.profile || {}),
    name: profileDisplayName,
    // Do not synthesize legacy avatar resource IDs from the Profile number.
    // Chromium 148 aborts for the previously generated avatar 26.
    avatar_index: 0,
  }
  await writeFile(prefPath, JSON.stringify(prefs), { mode: 0o600 })

  const localStatePath = join(directory, 'Local State')
  let localState: any = {}
  try { localState = JSON.parse(await readFile(localStatePath, 'utf8')) } catch {}
  if (!localState.profile) localState.profile = {}
  if (!localState.profile.info_cache) localState.profile.info_cache = {}
  if (!localState.profile.info_cache.Default) localState.profile.info_cache.Default = {}
  localState.profile.info_cache.Default.name = profileDisplayName
  localState.profile.info_cache.Default.is_using_default_name = false
  localState.profile.info_cache.Default.profile_color_seed = theme.color
  localState.profile.info_cache.Default.profile_highlight_color = theme.color
  localState.profile.info_cache.Default.avatar_icon = 'chrome://theme/IDR_PROFILE_AVATAR_0'
  await writeFile(localStatePath, JSON.stringify(localState, null, 2), { mode: 0o600 })

  const bookmarksPath = join(defaultDir, 'Bookmarks')
  let bm: any = null
  try { bm = JSON.parse(await readFile(bookmarksPath, 'utf8')) } catch {}
  const nowChrome = String((BigInt(Date.now()) + 11644473600000n) * 1000n)
  const badgeNode = {
    date_added: nowChrome,
    date_last_used: '0',
    guid: '00000000-0000-4000-8000-000000000001',
    id: '90001',
    name: badgeTitle,
    type: 'url',
    url: homepageUrl,
  }
  const ping0Node = {
    date_added: nowChrome,
    date_last_used: '0',
    guid: '00000000-0000-4000-8000-000000000002',
    id: '90002',
    name: '🌐 ip.ping0.cc',
    type: 'url',
    url: 'https://ip.ping0.cc/',
  }
  if (!bm || !bm.roots?.bookmark_bar) {
    bm = {
      version: 1,
      roots: {
        bookmark_bar: {
          children: [ping0Node],
          date_added: nowChrome,
          date_modified: nowChrome,
          guid: '0bc5d13f-2cba-5d74-951f-3f233fe6c908',
          id: '1',
          name: 'Bookmarks bar',
          type: 'folder',
        },
        other: { children: [], date_added: nowChrome, date_modified: '0', guid: '82b081ec-3dd3-529c-8475-ab6c344590dd', id: '2', name: 'Other bookmarks', type: 'folder' },
        synced: { children: [], date_added: nowChrome, date_modified: '0', guid: '4cf2e351-0e85-532b-bb37-df045d8f8d0f', id: '3', name: 'Mobile bookmarks', type: 'folder' },
      },
    }
  } else if (Array.isArray(bm.roots.bookmark_bar.children)) {
    const children = bm.roots.bookmark_bar.children.filter((c: any) => c?.guid !== badgeNode.guid && c?.url !== homepageUrl)
    const hasPing0 = children.some((c: any) => c?.guid === ping0Node.guid || String(c?.url || '').includes('ping0.cc'))
    // Remove only our generated profile-home bookmark, preserving user bookmarks.
    bm.roots.bookmark_bar.children = hasPing0 ? children : [ping0Node, ...children]
  }
  await writeFile(bookmarksPath, JSON.stringify(bm, null, 2), { mode: 0o600 })
}
type Running = { child: ChildProcess; pipe: ChromePipe; number: number; directory: string; lastPageTimer?: ReturnType<typeof setTimeout> }
export class NativeBrowsers {
  private running = new Map<string, Running>()
  private closing = new Map<string, Promise<void>>()
  private opening = new Map<string, Promise<void>>()
  constructor(private root: string, private resources: string, private changed: () => void, private closed: (id: string) => void) {}
  get ids() { return [...this.running.keys()] }
  get size() { return this.running.size }
  has(id: string) { return this.running.has(id) }
  private async bundle(_id: string, _number: number) {
    // All Profiles share this intact kernel. Data stays per Profile.
    const appSupportDestination = join(this.root, 'native/Chromium.app')
    let destination = appSupportDestination
    const hasAppSupport = await access(join(destination, 'Contents/Info.plist')).then(() => true).catch(() => false)
    if (!hasAppSupport) {
      try {
        const config = JSON.parse(await readFile(join(this.resources, 'native/engine.json'), 'utf8'))
        destination = config.installRelativePath ? join(homedir(), 'Library/Application Support', config.installRelativePath) : config.bundlePath || join(this.resources, 'native/Chromium.app')
      } catch {
        destination = join(this.resources, 'native/Chromium.app')
      }
    }
    const config = JSON.parse(await readFile(join(this.resources, 'native/engine.json'), 'utf8'))
    const plist = join(destination, 'Contents/Info.plist')
    await access(plist).catch(() => { throw new Error('浏览器内核未安装') })
    const executable = (await exec('/usr/libexec/PlistBuddy', ['-c', 'Print CFBundleExecutable', plist])).stdout.trim()
    if (!['Google Chrome', 'Chromium'].includes(executable)) throw new Error('不支持的浏览器内核可执行文件')
    const binary = join(destination, 'Contents/MacOS', executable)
    let isFingerprintKernel = false
    if (config.engine === 'Fingerprint Chromium') {
      if (!/^[a-f0-9]{64}$/.test(config.sha256 || '')) throw new Error('指纹内核缺少完整性记录，请重新安装已验证内核')
      const hash = createHash('sha256')
      for await (const chunk of createReadStream(binary)) hash.update(chunk)
      const version = (await exec('/usr/libexec/PlistBuddy', ['-c', 'Print CFBundleShortVersionString', plist])).stdout.trim()
      if (hash.digest('hex') !== config.sha256 || version !== config.version || executable !== 'Chromium') throw new Error('指纹内核版本或完整性不匹配，已停止启动')
      isFingerprintKernel = true
    }
    return { destination, binary, isFingerprintKernel }
  }
  async open(profile: any, number: number, proxyRules: string, proxy: any, location?: any, headless = false) {
    const id = profile.id
    if (!safeId(id)) throw new Error('Profile ID 无效')
    if (this.has(id)) { if (!headless) await this.focus(id); return }
    const pending = this.opening.get(id); if (pending) return pending
    const work = this.launch(profile, number, proxyRules, proxy, location, headless)
    this.opening.set(id, work)
    try { await work } finally { this.opening.delete(id) }
  }
  private async launch(profile: any, number: number, proxyRules: string, proxy: any, location: any, headless: boolean) {
    const id = profile.id
    const { destination, binary, isFingerprintKernel } = await this.bundle(id, number)
    if (isFingerprintKernel) {
      const fp = profile.fingerprint || {}
      const unsupported = ['deviceMemory', 'maxTouchPoints', 'webGLVendor', 'webGLRenderer'].filter(key => fp[key] !== undefined)
      for (const key of ['webRTC', 'mediaDevices', 'speech', 'fonts', 'webGPU', 'battery', 'connection', 'plugins', 'doNotTrack']) {
        if (fp[key] !== undefined && fp[key] !== 'real') unsupported.push(key)
      }
      if (unsupported.length) throw new Error(`当前原生内核尚未接入这些自定义项：${unsupported.join('、')}。请在设置中重置此区域后重试。`)
    }
    const directory = join(this.root, 'native-profiles', id)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const homepage = join(directory, 'prism-start.html')
    const homepageUrl = pathToFileURL(homepage).href
    await ensureProfilePreferences(directory, profile, number, homepageUrl, proxy)
    const args = [
      `--user-data-dir=${directory}`,
      '--remote-debugging-pipe',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-startup-window',
      '--disable-background-mode',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-domain-reliability',
      '--disable-sync',
      '--media-router=0',
      '--disk-cache-size=104857600',
      '--use-mock-keychain',
      '--password-store=basic',
    ]
    const seedVal = numericSeed(profile)
    const effectiveHC = profile.hardwareConcurrency || [8, 10, 12, 14, 16][seedVal % 5]
    if (isFingerprintKernel) {
      args.push(
        `--fingerprint=${seedVal}`,
        '--fingerprint-platform=macos',
        '--fingerprint-brand=Chrome',
        `--fingerprint-hardware-concurrency=${effectiveHC}`
      )
      if (profile.timezone && profile.timezone !== 'local') args.push(`--timezone=${profile.timezone}`)
      if (profile.resolution) {
        args.push(`--fingerprint-screen-width=${profile.resolution.width}`, `--fingerprint-screen-height=${profile.resolution.height}`)
      }
      if (profile.fingerprint?.pixelRatio) args.push(`--fingerprint-device-scale-factor=${profile.fingerprint.pixelRatio}`)
      const disabled: string[] = []
      if (profile.fingerprint?.canvas === 'real') disabled.push('canvas')
      if (profile.fingerprint?.audio === 'real') disabled.push('audio')
      if (profile.fingerprint?.webGL === 'real') disabled.push('gpu')
      if (disabled.length) args.push(`--disable-spoofing=${disabled.join(',')}`)
    }
    if (profile.locale) args.push(`--lang=${profile.locale}`, `--accept-lang=${profile.locale}`)
    if (headless) args.push('--headless=new', '--enable-unsafe-extension-debugging', '--disable-notifications')
    if (proxyRules === 'direct') args.push('--no-proxy-server')
    else if (proxyRules !== 'system') args.push(`--proxy-server=${proxyRules}`, '--proxy-bypass-list=<-loopback>', '--disable-quic')
    if (profile.webRTCPolicy === 'proxy-only') args.push('--force-webrtc-ip-handling-policy=disable_non_proxied_udp')
    const theme = PROFILE_PALETTE[number % PROFILE_PALETTE.length]
    const extDir = await ensureProfileBadgeExtension(directory, number, profile, proxy, theme.hex)
    args.push(`--load-extension=${extDir}`)
    const child = spawn(binary, args, { stdio: ['ignore','ignore','pipe','pipe','pipe'], env: { ...process.env, ...(profile.timezone && profile.timezone !== 'local' ? { TZ: profile.timezone } : {}) } })
    // Drain stderr without recording visited URLs, proxy credentials or personal information.
    if (headless && process.env.PRISM_NATIVE_DEBUG === '1') child.stderr?.on('data', chunk => console.error(String(chunk)))
    else child.stderr?.resume()
    const pipe = new ChromePipe(child)
    let failed = false
    const cleanup = () => { if (this.running.get(id)?.child === child) { clearTimeout(this.running.get(id)?.lastPageTimer); this.running.delete(id); this.changed(); this.closed(id) } }
    child.once('exit', (code, signal) => { if (process.env.PRISM_NATIVE_DEBUG === '1') console.error('Native exit', code, signal); cleanup() })
    child.once('error', cleanup)
    this.running.set(id, { child, pipe, number, directory })
    try {
      const version = await pipe.send('Browser.getVersion')
      let dockImage: string | undefined
      if (process.platform === 'darwin') {
        const baseIcon = join(this.resources, 'native/prism-dock.png')
        const badgedIcon = join(directory, `dock-mascot-v2-${number}.png`)
        try {
          await access(badgedIcon)
          dockImage = (await readFile(badgedIcon)).toString('base64')
        } catch {
          const appSupportIcon = join(this.root, 'native/prism-icon')
          const bundledIcon = join(this.resources, 'native/prism-icon')
          const iconBin = (await access(appSupportIcon).then(() => true).catch(() => false)) ? appSupportIcon : bundledIcon
          try {
            await exec(iconBin, [baseIcon, String(number), badgedIcon])
            dockImage = (await readFile(badgedIcon)).toString('base64')
          } catch {
            dockImage = (await readFile(baseIcon)).toString('base64')
          }
        }
      }
      const setDock = async () => { if (dockImage) await pipe.send('Browser.setDockTile', { badgeLabel: '', image: dockImage }) }
      await setDock()
      const pages = new Set<string>()
      let hadPage = false
      const addPage = (info: any) => {
        if (info.type !== 'page') return
        hadPage = true
        pages.add(info.targetId)
        clearTimeout(this.running.get(id)?.lastPageTimer)
      }
      pipe.on('Target.targetCreated', ({ targetInfo }) => addPage(targetInfo))
      pipe.on('Target.targetInfoChanged', ({ targetInfo }) => addPage(targetInfo))
      pipe.on('Target.targetDestroyed', ({ targetId }) => {
        pages.delete(targetId)
        const running = this.running.get(id)
        if (!running || !hadPage || pages.size || this.closing.has(id)) return
        clearTimeout(running.lastPageTimer)
        running.lastPageTimer = setTimeout(() => { if (this.has(id) && pages.size === 0) void this.close(id).catch(() => undefined) }, 350)
      })
      await pipe.send('Target.setDiscoverTargets', { discover: true })
      const initialized = new Set<string>()
      pipe.on('Target.targetDestroyed', ({ targetId }) => initialized.delete(targetId))
      const setup = async (event: any) => {
        const sid = event.sessionId
        try {
          if (initialized.has(event.targetInfo.targetId)) { await pipe.send('Runtime.runIfWaitingForDebugger', {}, sid).catch(() => undefined); return }
          initialized.add(event.targetInfo.targetId)
          const type = event.targetInfo.type
          // Native worker identity comes from process switches; resume immediately.
          if (isFingerprintKernel && ['worker', 'shared_worker', 'service_worker'].includes(type)) {
            await pipe.send('Runtime.runIfWaitingForDebugger', {}, sid)
            return
          }
          const url = event.targetInfo.url || ''

          if (['page','iframe'].includes(type) && !/^chrome-extension:/.test(url)) {
            const command = (method: string, params: object) => pipe.send(method, params, sid)
            if (profile.timezone && profile.timezone !== 'local') await command('Emulation.setTimezoneOverride', { timezoneId: profile.timezone })
            if (profile.locale) await command('Emulation.setLocaleOverride', { locale: profile.locale }).catch(error => { if (!String(error).includes('Another locale override is already in effect')) throw error })
            if (profile.userAgentMode === 'custom') await command('Emulation.setUserAgentOverride', { userAgent: profile.userAgent, ...(profile.locale ? { acceptLanguage: profile.locale } : {}) }).catch(() => undefined)
            await command('Emulation.setHardwareConcurrencyOverride', { hardwareConcurrency: effectiveHC })
            if (profile.fingerprint?.geolocation) await command('Emulation.setGeolocationOverride', profile.fingerprint.geolocation)
            if (profile.resolution) await command('Emulation.setDeviceMetricsOverride', { ...profile.resolution, screenWidth: profile.resolution.width, screenHeight: profile.resolution.height, deviceScaleFactor: profile.fingerprint?.pixelRatio || 1, mobile: false })
            const fp = profile.fingerprint || {}
            const features = []
            if (fp.colorScheme) features.push({ name: 'prefers-color-scheme', value: fp.colorScheme })
            if (fp.reducedMotion) features.push({ name: 'prefers-reduced-motion', value: fp.reducedMotion })
            if (features.length) await command('Emulation.setEmulatedMedia', { features })

            // If using native C++ fingerprint kernel, Blink handles fingerprinting cleanly at the C++ layer.
            // Do NOT inject observable JS Proxies (e.g. Function.prototype.toString hooks) that trigger Cloudflare Turnstile / Botguard.
            if (!isFingerprintKernel) {
              await command('Page.enable', {}).catch(() => undefined)
              await command('Page.addScriptToEvaluateOnNewDocument', { source: `if (!/^(chrome|chrome-extension):$/.test(location.protocol)) { ${fingerprintSource(profile)} }` }).catch(() => undefined)
            }
            await command('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: [{ type: 'tab', exclude: true }, { type: 'browser', exclude: true }, {}] }).catch(() => undefined)
          } else if (['worker', 'shared_worker', 'service_worker'].includes(type) && !/^chrome-extension:/.test(url)) {
            const command = (method: string, params: object) => pipe.send(method, params, sid).catch(() => undefined)
            if (profile.timezone && profile.timezone !== 'local') await command('Emulation.setTimezoneOverride', { timezoneId: profile.timezone })
            if (profile.locale) await command('Emulation.setLocaleOverride', { locale: profile.locale })
            if (profile.userAgentMode === 'custom') await command('Emulation.setUserAgentOverride', { userAgent: profile.userAgent, ...(profile.locale ? { acceptLanguage: profile.locale } : {}) })
            await command('Emulation.setHardwareConcurrencyOverride', { hardwareConcurrency: effectiveHC })
          }
          await pipe.send('Runtime.runIfWaitingForDebugger', {}, sid).catch(() => undefined)
        } catch (error) {
          if (child.exitCode !== null || this.closing.has(id) || !pipe.sessions.has(event.targetInfo.targetId)) return
          if (headless) console.error('Native target initialization:', event.targetInfo.type, error)
          failed = true
          // Never silently open a page after environment initialization failed.
          await pipe.send('Target.closeTarget', { targetId: event.targetInfo.targetId }).catch(() => undefined)
        }
      }
      pipe.on('Target.attachedToTarget', event => { void setup(event) })
      await pipe.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: [{ type: 'tab', exclude: true }, { type: 'browser', exclude: true }, {}] })
      const homepage = join(directory, 'prism-start.html')
      await writeFile(homepage, nativeHome(profile, number, proxy, location, version.product), { mode: 0o600 })
      const { targetId } = await pipe.send('Target.createTarget', { url: pathToFileURL(homepage).href })
      // Wait for initialization/navigation before reporting launch success.
      for (let i = 0; i < 100; i++) {
        if (failed) throw new Error('原生窗口环境初始化失败，已关闭页面')
        const { targetInfo } = await pipe.send('Target.getTargetInfo', { targetId })
        if (targetInfo.url === pathToFileURL(homepage).href) break
        await new Promise(resolve => setTimeout(resolve, 30))
      }
      if (failed) throw new Error('原生窗口环境初始化失败')
      await setDock()
      if (!headless) await pipe.send('Target.activateTarget', { targetId })
      this.changed()
    } catch (error) { child.kill('SIGTERM'); cleanup(); throw error }
  }
  async focus(id: string) {
    const item = this.running.get(id); if (!item) return
    const { targetInfos } = await item.pipe.send('Target.getTargets')
    const page = targetInfos.find((t: any) => t.type === 'page')
    if (page) await item.pipe.send('Target.activateTarget', { targetId: page.targetId })

  }
  connection(id: string) { return this.running.get(id)?.pipe }
  async close(id: string) {
    const pendingClose = this.closing.get(id)
    if (pendingClose) return pendingClose
    const task = this.closeProcess(id)
    this.closing.set(id, task)
    try { await task } finally { this.closing.delete(id) }
  }
  private async closeProcess(id: string) {
    const pending = this.opening.get(id); if (pending) await pending.catch(() => undefined)
    const item = this.running.get(id); if (!item) return
    clearTimeout(item.lastPageTimer)
    const ended = () => item.child.exitCode !== null || item.child.signalCode !== null
    const wait = (ms: number) => new Promise<void>(resolve => {
      if (ended()) return resolve()
      const done = () => { clearTimeout(timer); item.child.off('exit', done); resolve() }
      const timer = setTimeout(done, ms); item.child.once('exit', done)
    })
    // Request a normal Chrome shutdown first so bookmarks, cookies and extension data flush.
    void item.pipe.send('Browser.close').catch(() => undefined)
    await wait(3000)
    if (!ended()) { item.child.kill('SIGTERM'); await wait(2000) }
    if (!ended()) { item.child.kill('SIGKILL'); await wait(1000) }
    if (!ended()) throw new Error('此 Profile 进程未能退出，请重试停止')
  }
  async closeAll() { await Promise.all([...new Set([...this.ids, ...this.opening.keys()])].map(id => this.close(id))) }
  async withCookiePipe<T>(id: string, task: (pipe: ChromePipe, sessionId?: string) => Promise<T>): Promise<T> {
    if (!safeId(id)) throw new Error('Profile ID 无效')
    const live = this.running.get(id)
    if (live) return await task(live.pipe)
    const { binary } = await this.bundle(id, 0)
    const directory = join(this.root, 'native-profiles', id)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const args = [`--user-data-dir=${directory}`, '--remote-debugging-pipe', '--headless=new', '--no-first-run', '--no-default-browser-check', '--no-startup-window', '--disable-background-mode', '--use-mock-keychain', '--password-store=basic', '--no-proxy-server', '--disable-notifications']
    const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] })
    child.stderr?.resume()
    const pipe = new ChromePipe(child)
    try {
      await pipe.send('Browser.getVersion')
      return await task(pipe)
    } finally {
      await pipe.send('Browser.close').catch(() => undefined)
      await new Promise<void>(resolve => {
        if (child.exitCode !== null || child.signalCode !== null) return resolve()
        const timer = setTimeout(() => { child.kill('SIGKILL'); resolve() }, 2000)
        child.once('exit', () => { clearTimeout(timer); resolve() })
      })
    }
  }
  async exportCookies(id: string): Promise<any[]> {
    return await this.withCookiePipe(id, async (pipe, sid) => {
      const { cookies } = await (sid ? pipe.send('Network.getAllCookies', {}, sid) : pipe.send('Storage.getCookies'))
      return Array.isArray(cookies) ? cookies : []
    })
  }
  async importCookies(id: string, rawCookies: any[]): Promise<number> {
    if (!Array.isArray(rawCookies)) throw new Error('Cookie 格式应为 JSON 数组')
    const normalized = rawCookies
      .filter(c => c && typeof c === 'object' && typeof c.name === 'string' && typeof c.value === 'string' && (typeof c.domain === 'string' || typeof c.url === 'string'))
      .map(c => {
        const expires = typeof c.expires === 'number' ? c.expires : typeof c.expirationDate === 'number' ? c.expirationDate : undefined
        const sameSiteRaw = String(c.sameSite ?? '').toLowerCase()
        const sameSite = sameSiteRaw === 'no_restriction' || sameSiteRaw === 'none' ? 'None' : sameSiteRaw === 'strict' ? 'Strict' : sameSiteRaw === 'lax' ? 'Lax' : undefined
        const cleanDomain = typeof c.domain === 'string' ? c.domain.trim() : undefined
        const url = typeof c.url === 'string' ? c.url : cleanDomain ? `http${c.secure ? 's' : ''}://${cleanDomain.replace(/^\./, '')}${typeof c.path === 'string' ? c.path : '/'}` : undefined
        return {
          name: c.name,
          value: c.value,
          ...(cleanDomain ? { domain: cleanDomain } : {}),
          ...(url ? { url } : {}),
          path: typeof c.path === 'string' ? c.path : '/',
          secure: Boolean(c.secure),
          httpOnly: Boolean(c.httpOnly),
          ...(sameSite ? { sameSite } : {}),
          ...(expires && expires > 0 ? { expires } : {}),
        }
      })
    if (!normalized.length) throw new Error('没有识别到有效的 Cookie 条目（需包含 name、value、domain）')
    await this.withCookiePipe(id, async (pipe, sid) => {
      if (sid) await pipe.send('Network.setCookies', { cookies: normalized }, sid)
      else await pipe.send('Storage.setCookies', { cookies: normalized })
      // Give SQLite cookie store 150ms to flush before shutdown
      await new Promise(resolve => setTimeout(resolve, 150))
    })
    return normalized.length
  }
  async removeProfileData(id: string) {
    if (!safeId(id)) throw new Error('Profile ID 无效')
    await this.close(id)
    const directory = join(this.root, 'native-profiles', id)
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  }
}
