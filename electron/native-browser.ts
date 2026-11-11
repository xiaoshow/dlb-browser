import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { access, mkdir, readFile, writeFile, rename, rm, chmod, copyFile } from 'node:fs/promises'
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
  // 注入官方 Google 默认搜索引擎，确保在原生 Chromium 地址栏打字直接回车调用 Google 搜索
  prefs.default_search_provider_data = {
    template_url_data: {
      short_name: 'Google',
      keyword: 'google.com',
      url: 'https://www.google.com/search?q={searchTerms}',
      suggestions_url: 'https://www.google.com/complete/search?client=chrome&q={searchTerms}',
      favicon_url: 'https://www.google.com/favicon.ico',
      safe_for_autoreplace: true,
      is_active: 1,
      date_created: '0',
      last_modified: '0',
      synced_guid: 'google_search_provider_default',
    },
  }
  prefs.countryid_at_install = 224
  prefs.extensions = {
    ...(prefs.extensions || {}),
    pinned_extensions: Array.from(new Set([
      ...(prefs.extensions?.pinned_extensions || []),
      BADGE_EXTENSION_ID,
    ])),
  }
  const downloadsPath = join(homedir(), 'Downloads')
  prefs.download = {
    ...(prefs.download || {}),
    default_directory: downloadsPath,
    directory_upgrade: true,
    prompt_for_download: false,
    extensions_to_open: '',
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
    password_manager_enabled: true,
    // Do not synthesize legacy avatar resource IDs from the Profile number.
    // Chromium 148 aborts for the previously generated avatar 26.
    avatar_index: 0,
  }
  // 显式开启原生 Chromium 密码管理器与自动填充服务（保障登录时弹出保存密码提示与自动填充）
  prefs.credentials_enable_service = true
  prefs.credentials_enable_autosignin = true
  prefs.autofill = {
    ...(prefs.autofill || {}),
    profile_enabled: true,
    credit_card_enabled: true,
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

  // 1. 读取全局公用书签池（左列），保障所有环境同步拥有一致的公共收藏
  const sharedPath = join(directory, '../../workspace-shared-bookmarks.json')
  let sharedItems: Array<{ id: string; name: string; url: string; hideTitle?: boolean }> = []
  try {
    const raw = await readFile(sharedPath, 'utf8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) sharedItems = parsed
  } catch {}

  // 兜底保障：公用区默认必须拥有 Google、Gmail 与 ip.ping0.cc
  const isGoogleSearch = (url: string) => {
    try {
      const u = new URL(url)
      return (u.hostname === 'www.google.com' || u.hostname === 'google.com') && (u.pathname === '/' || u.pathname === '')
    } catch {
      return false
    }
  }
  const isGmail = (url: string) => {
    try {
      const u = new URL(url)
      return u.hostname === 'mail.google.com' || u.hostname === 'gmail.com'
    } catch {
      return false
    }
  }

  if (!sharedItems.some(b => isGoogleSearch(b.url))) {
    sharedItems.unshift({ id: 'default-google', name: 'Google', url: 'https://www.google.com/' })
  }
  if (!sharedItems.some(b => isGmail(b.url))) {
    sharedItems.splice(1, 0, { id: 'default-gmail', name: 'Gmail', url: 'https://mail.google.com/' })
  }
  if (!sharedItems.some(b => String(b.url).includes('ping0.cc'))) {
    sharedItems.push({ id: '90002', name: 'ip.ping0.cc', url: 'https://ip.ping0.cc/' })
  }

  // 组装左列：公用书签节点
  const sharedUrls = new Set<string>()
  const sharedNodes = sharedItems.map((item, idx) => {
    sharedUrls.add(item.url)
    const cleanName = item.name.replace(/^[🌐\s]+/, '').trim() || item.name
    return {
      date_added: nowChrome,
      date_last_used: '0',
      guid: `00000000-0000-4000-8000-${String(idx + 10).padStart(12, '0')}`,
      id: String(90010 + idx),
      name: item.hideTitle ? '' : cleanName,
      type: 'url',
      url: item.url,
      ...(item.hideTitle ? { hideTitle: true } : {}),
    }
  })

  // 2. 中间分列指示线（左侧公用与右侧专属的分界标记）
  const dividerGuid = '00000000-0000-4000-8000-000000000099'
  const dividerNode = {
    date_added: nowChrome,
    date_last_used: '0',
    guid: dividerGuid,
    id: '90099',
    name: '★ | 👤 专属书签 ➔',
    type: 'url',
    url: 'chrome://bookmarks/',
  }

  // 3. 提取右列：本号专属书签（用户在本环境内自行收藏的网页），过滤掉公用书签与历史旧标记
  const rawChildren = Array.isArray(bm?.roots?.bookmark_bar?.children) ? bm.roots.bookmark_bar.children : []
  const profileNodes = rawChildren.filter((c: any) => {
    if (!c || c.type !== 'url' || !c.url) return false
    if (c.guid === '00000000-0000-4000-8000-000000000001' || c.url === homepageUrl) return false
    if (c.guid === dividerGuid || String(c.name || '').includes('专属书签')) return false
    if (sharedUrls.has(c.url)) return false
    return true
  }).map((c: any) => {
    if (c.hideTitle) {
      return { ...c, name: '' }
    }
    return c
  })

  // 完美两列布局：[...公用书签, 分隔带, ...本号专属书签]，与合并视图完全对齐
  bm = {
    version: 1,
    roots: {
      bookmark_bar: {
        children: [...sharedNodes, dividerNode, ...profileNodes],
        date_added: nowChrome,
        date_modified: nowChrome,
        guid: '0bc5d13f-2cba-5d74-951f-3f233fe6c908',
        id: '1',
        name: 'Bookmarks bar',
        type: 'folder',
      },
      other: bm?.roots?.other || { children: [], date_added: nowChrome, date_modified: '0', guid: '82b081ec-3dd3-529c-8475-ab6c344590dd', id: '2', name: 'Other bookmarks', type: 'folder' },
      synced: bm?.roots?.synced || { children: [], date_added: nowChrome, date_modified: '0', guid: '4cf2e351-0e85-532b-bb37-df045d8f8d0f', id: '3', name: 'Mobile bookmarks', type: 'folder' },
    },
  }
  await writeFile(bookmarksPath, JSON.stringify(bm, null, 2), { mode: 0o600 })
}

async function ensureProfileFavicons(defaultDir: string, resourcesPath: string, rootDir: string): Promise<void> {
  const targetDb = join(defaultDir, 'Favicons')

  // 查找母体图标库 (按资源目录、根目录、用户应用支持目录顺序回退)
  const candidates = [
    join(resourcesPath, 'native/master-favicons.sqlite'),
    join(resourcesPath, 'master-favicons.sqlite'),
    join(rootDir, 'master-favicons.sqlite'),
    join(homedir(), 'Library/Application Support/prism-fingerprint-browser/master-favicons.sqlite'),
  ]
  let masterDb = ''
  for (const c of candidates) {
    try {
      await access(c)
      masterDb = c
      break
    } catch {}
  }
  if (!masterDb) return

  // 1. 如果该环境尚未生成 Favicons 数据库，直接安全拷贝母体库
  const exists = await access(targetDb).then(() => true).catch(() => false)
  if (!exists) {
    try {
      await copyFile(masterDb, targetDb)
    } catch (e) {
      console.warn('[Prism] Failed to initialize profile favicons:', e)
    }
    return
  }

  // 2. 如果已经存在 Favicons 数据库，执行基于 SQLite 的幂等增量合并：
  // 严格保留该环境已有的历史图标与浏览信息，仅增量补齐未包含的常用/公共站点 Favicon 实体缓存与 URL 映射
  const mergeSql = `
ATTACH DATABASE "${masterDb}" AS master;

CREATE TEMP TABLE id_map AS
SELECT m.id AS master_icon_id, t.id AS target_icon_id, m.url, m.icon_type
FROM master.favicons m
LEFT JOIN favicons t ON t.url = m.url;

INSERT INTO favicons (url, icon_type)
SELECT url, icon_type FROM id_map WHERE target_icon_id IS NULL;

UPDATE id_map
SET target_icon_id = (SELECT t.id FROM favicons t WHERE t.url = id_map.url)
WHERE target_icon_id IS NULL;

INSERT INTO favicon_bitmaps (icon_id, last_updated, image_data, width, height, last_requested)
SELECT m_map.target_icon_id, b.last_updated, b.image_data, b.width, b.height, b.last_requested
FROM master.favicon_bitmaps b
JOIN id_map m_map ON m_map.master_icon_id = b.icon_id
WHERE NOT EXISTS (
    SELECT 1 FROM favicon_bitmaps tb WHERE tb.icon_id = m_map.target_icon_id
);

INSERT INTO icon_mapping (page_url, icon_id, page_url_type)
SELECT m_im.page_url, m_map.target_icon_id, m_im.page_url_type
FROM master.icon_mapping m_im
JOIN id_map m_map ON m_map.master_icon_id = m_im.icon_id
WHERE NOT EXISTS (
    SELECT 1 FROM icon_mapping tim WHERE tim.page_url = m_im.page_url
);

INSERT OR IGNORE INTO meta (key, value) SELECT key, value FROM master.meta;
`

  await new Promise<void>((resolve) => {
    const proc = spawn('/usr/bin/sqlite3', [targetDb], { stdio: ['pipe', 'ignore', 'ignore'] })
    proc.stdin.write(mergeSql)
    proc.stdin.end()
    proc.on('close', () => resolve())
    proc.on('error', () => resolve())
  })
}
type Running = {
  child: ChildProcess;
  pipe: ChromePipe;
  number: number;
  directory: string;
  dockImage?: string;
  setDock?: () => Promise<void>;
  dockTimer?: ReturnType<typeof setInterval>;
  lastPageTimer?: ReturnType<typeof setTimeout>;
}
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
    await ensureProfileFavicons(join(directory, 'Default'), this.resources, this.root)
    const args = [
      `--user-data-dir=${directory}`,
      '--remote-debugging-pipe',
      '--disable-blink-features=AutomationControlled',
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
      if (profile.fingerprint?.canvas !== 'noise') disabled.push('canvas')
      if (profile.fingerprint?.audio !== 'noise') disabled.push('audio')
      if (profile.fingerprint?.webGL !== 'noise') disabled.push('gpu')
      if (disabled.length) args.push(`--disable-spoofing=${disabled.join(',')}`)
    }
    if (profile.locale) args.push(`--lang=${profile.locale}`, `--accept-lang=${profile.locale}`)
    if (headless) args.push('--headless=new', '--enable-unsafe-extension-debugging', '--disable-notifications')
    if (proxyRules === 'direct') args.push('--no-proxy-server')
    else if (proxyRules !== 'system') {
      // Keep loopback proxied by default, except BrowserSkill's local control port.
      // Chromium evaluates subtractive rules left-to-right: exceptions go last.
      args.push(`--proxy-server=${proxyRules}`, '--proxy-bypass-list=<-loopback>;127.0.0.1:52800;localhost:52800;[::1]:52800', '--disable-quic')
    }
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
    const cleanup = () => {
      const running = this.running.get(id)
      if (running?.child === child) {
        clearTimeout(running.lastPageTimer)
        if (running.dockTimer) clearInterval(running.dockTimer)
        this.running.delete(id)
        this.changed()
        this.closed(id)
      }
    }
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
      const setDock = async () => {
        if (dockImage && !child.killed && child.exitCode === null) {
          await pipe.send('Browser.setDockTile', { badgeLabel: '', image: dockImage }).catch(() => undefined)
        }
      }
      const runningItem = this.running.get(id)
      if (runningItem) {
        runningItem.dockImage = dockImage
        runningItem.setDock = setDock
        if (process.platform === 'darwin' && dockImage) {
          // 定时心跳自愈：每 30 秒重新补发，防御 macOS 睡眠唤醒/切换屏幕/Dock重载后恢复默认蓝标
          runningItem.dockTimer = setInterval(() => { void setDock() }, 30_000)
        }
      }
      await setDock()
      const pages = new Set<string>()
      let hadPage = false
      const addPage = (info: any) => {
        if (info.type !== 'page') return
        hadPage = true
        pages.add(info.targetId)
        clearTimeout(this.running.get(id)?.lastPageTimer)
        void setDock()
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
      // 下载行为严格回归原生 Chromium 默认机制：由 Preferences 控制保存至 Downloads 目录，绝不用 CDP allowAndName 强制覆盖为无后缀 GUID
      await pipe.send('Browser.setDownloadBehavior', { behavior: 'default' }).catch(() => undefined)

      const initialized = new Set<string>()
      pipe.on('Target.targetDestroyed', ({ targetId }) => initialized.delete(targetId))
      const setup = async (event: any) => {
        const sid = event.sessionId
        try {
          if (initialized.has(event.targetInfo.targetId)) {
            await pipe.send('Runtime.runIfWaitingForDebugger', {}, sid).catch(() => undefined)
            return
          }
          initialized.add(event.targetInfo.targetId)
          const type = event.targetInfo.type
          // Native worker identity comes from process switches; resume immediately.
          if (isFingerprintKernel && ['worker', 'shared_worker', 'service_worker'].includes(type)) {
            await pipe.send('Runtime.runIfWaitingForDebugger', {}, sid).catch(() => undefined)
            return
          }
          const url = event.targetInfo.url || ''

          if (type === 'page' && !/^chrome-extension:/.test(url)) {
            const command = (method: string, params: object) => pipe.send(method, params, sid).catch(() => undefined)
            if (!isFingerprintKernel) {
              if (profile.timezone && profile.timezone !== 'local') await command('Emulation.setTimezoneOverride', { timezoneId: profile.timezone })
              if (profile.locale) await command('Emulation.setLocaleOverride', { locale: profile.locale })
              if (profile.userAgentMode === 'custom') await command('Emulation.setUserAgentOverride', { userAgent: profile.userAgent, ...(profile.locale ? { acceptLanguage: profile.locale } : {}) })
              await command('Emulation.setHardwareConcurrencyOverride', { hardwareConcurrency: effectiveHC })
              if (profile.fingerprint?.geolocation) await command('Emulation.setGeolocationOverride', profile.fingerprint.geolocation)
              if (profile.resolution) await command('Emulation.setDeviceMetricsOverride', { ...profile.resolution, screenWidth: profile.resolution.width, screenHeight: profile.resolution.height, deviceScaleFactor: profile.fingerprint?.pixelRatio || 1, mobile: false })
              const fp = profile.fingerprint || {}
              const features = []
              if (fp.colorScheme) features.push({ name: 'prefers-color-scheme', value: fp.colorScheme })
              if (fp.reducedMotion) features.push({ name: 'prefers-reduced-motion', value: fp.reducedMotion })
              if (features.length) await command('Emulation.setEmulatedMedia', { features })

              await command('Page.enable', {})
              await command('Page.addScriptToEvaluateOnNewDocument', { source: `if (!/^(chrome|chrome-extension):$/.test(location.protocol)) { ${fingerprintSource(profile)} }` })
            } else {
              // C++ 指纹内核模式：基础指纹全部在 C++ Blink 进程层完成，绝不通过 CDP 重复注入 Emulation，彻底消除 BotGuard / reCAPTCHA 探测痕迹
              if (profile.userAgentMode === 'custom') await command('Emulation.setUserAgentOverride', { userAgent: profile.userAgent, ...(profile.locale ? { acceptLanguage: profile.locale } : {}) })
              if (profile.fingerprint?.geolocation) await command('Emulation.setGeolocationOverride', profile.fingerprint.geolocation)
            }
            // 回归原生铁律：仅自动挂载新开页面（page），绝不渗透/调试任何子 iframe（如 reCAPTCHA/Turnstile 验证码）
            await command('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true, filter: [{ type: 'page' }] })
          } else if (!isFingerprintKernel && ['worker', 'shared_worker', 'service_worker'].includes(type) && !/^chrome-extension:/.test(url)) {
            const command = (method: string, params: object) => pipe.send(method, params, sid).catch(() => undefined)
            if (profile.timezone && profile.timezone !== 'local') await command('Emulation.setTimezoneOverride', { timezoneId: profile.timezone })
            if (profile.locale) await command('Emulation.setLocaleOverride', { locale: profile.locale })
            if (profile.userAgentMode === 'custom') await command('Emulation.setUserAgentOverride', { userAgent: profile.userAgent, ...(profile.locale ? { acceptLanguage: profile.locale } : {}) })
            await command('Emulation.setHardwareConcurrencyOverride', { hardwareConcurrency: effectiveHC })
          }
          await pipe.send('Runtime.runIfWaitingForDebugger', {}, sid).catch(() => undefined)
        } catch (error) {
          if (child.exitCode !== null || this.closing.has(id) || !pipe.sessions.has(event.targetInfo.targetId)) return
          // 关键修复：绝不误杀用户的 Google 登录弹窗或新标签页！如果只是调试器命令在瞬态目标上遇到异常，继续放行让页面原生渲染！
          await pipe.send('Runtime.runIfWaitingForDebugger', {}, sid).catch(() => undefined)
        }
      }
      pipe.on('Target.attachedToTarget', event => { void setup(event) })
      // 回归原生铁律：全局 autoAttach 设为 waitForDebuggerOnStart: false，所有新窗口和弹窗毫秒级原生直出
      await pipe.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true, filter: [{ type: 'tab', exclude: true }, { type: 'browser', exclude: true }, {}] })
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
    // 点击“显示”时立即重新激活并下发 Dock 图标，自愈任何被系统意外还原的默认图标
    await item.setDock?.().catch(() => undefined)
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
