import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { access, mkdir, readFile, writeFile, rename, rm, chmod, copyFile, stat, readdir, symlink, unlink } from 'node:fs/promises'
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
const BROWSER_SKILL_EXTENSION_ID = 'kmdmgcehgmnhnnonjlbdcglgpggdhcll'
const BROWSER_SKILL_EXTENSION_DIR = join(homedir(), 'workdir/browser-skill-extension')

export interface SharedBookmarkNode {
  id: string
  name: string
  type?: 'url' | 'folder'
  url: string
  hideTitle?: boolean
  favicon?: string
  children?: SharedBookmarkNode[]
}

function isProfileLabelNode(c: any): boolean {
  if (!c) return false
  const title = String(c.name || c.title || '')
  return (
    c.url === 'chrome://newtab/' ||
    c.url === 'chrome://version/' ||
    c.guid === '00000000-0000-4000-8000-000000000098' ||
    title.endsWith(' ｜') ||
    title.endsWith(' |')
  )
}

function buildProfileLabelTitle(number?: number, profile?: any): string {
  const rawName = String(profile?.name || 'Profile').trim()
  const shortName = rawName.replace(/@gmail\.c(om|n)$/i, '').replace(/@googlemail\.com$/i, '').trim() || rawName
  const prefix = typeof number === 'number' && number > 0 ? `#${number} ` : (profile?.sequenceNumber || profile?.number ? `#${profile.sequenceNumber || profile.number} ` : '')
  return `${prefix}${shortName} ｜`
}

function isDividerNode(c: any): boolean {
  if (!c) return false
  const title = String(c.name || c.title || '')
  return (
    c.url === 'chrome://bookmarks/' ||
    c.guid === '00000000-0000-4000-8000-000000000099' ||
    title.includes('专属') ||
    title.includes('公用') ||
    title.includes('共享') ||
    title.includes('📌') ||
    title.startsWith('｜') ||
    /^🟢\s*#\d+/.test(title)
  )
}

function buildDividerTitle(_number?: number, _profile?: any): string {
  return '｜ 个人'
}

function parseRawBookmarkNodeToShared(node: any, idx: number, prevByKey: Map<string, SharedBookmarkNode>): SharedBookmarkNode | null {
  if (!node) return null
  const rawName = String(node.name ?? node.title ?? '')
  if (node.type === 'folder' || Array.isArray(node.children)) {
    const folderName = rawName.trim() || '文件夹'
    const key = `folder:${folderName}`
    const prev = prevByKey.get(key)
    const prevChildMap = new Map<string, SharedBookmarkNode>()
    for (const ch of prev?.children || []) {
      prevChildMap.set(ch.type === 'folder' ? `folder:${ch.name}` : `url:${ch.url}`, ch)
    }
    const children: SharedBookmarkNode[] = []
    for (let i = 0; i < (node.children || []).length; i++) {
      const parsed = parseRawBookmarkNodeToShared(node.children[i], i, prevChildMap)
      if (parsed) children.push(parsed)
    }
    return {
      id: prev?.id || node.guid || `folder-${Date.now()}-${idx}`,
      name: folderName,
      type: 'folder',
      url: '',
      children,
    }
  }
  const url = String(node.url || '')
  if (!url || url.startsWith('chrome://') || url.startsWith('file://')) return null
  const key = `url:${url}`
  const prev = prevByKey.get(key)
  const hideTitle = Boolean(node.hideTitle) || rawName === ''
  const cleanName = hideTitle
    ? (prev?.name || url)
    : (rawName.replace(/^[🌐\s]+/, '').trim() || prev?.name || url)
  return {
    id: prev?.id || node.guid || `shared-${Date.now()}-${idx}`,
    name: cleanName,
    type: 'url',
    url,
    ...(prev?.favicon || node.favicon ? { favicon: prev?.favicon || node.favicon } : {}),
    ...(hideTitle ? { hideTitle: true } : {}),
  }
}

export function extractSharedFromBookmarksJson(bm: any, existingShared: SharedBookmarkNode[] = []): SharedBookmarkNode[] | null {
  const barChildren = bm?.roots?.bookmark_bar?.children
  if (!Array.isArray(barChildren)) return null
  const prevByKey = new Map<string, SharedBookmarkNode>()
  for (const item of existingShared) {
    prevByKey.set(item.type === 'folder' ? `folder:${item.name}` : `url:${item.url}`, item)
  }
  const seenKeys = new Set<string>()
  const extracted: SharedBookmarkNode[] = []
  // 左边共享：跳过最左边的 Profile 名字标识，扫描并在遇到分界符 ｜ 个人 之前的书签作为全局公用区
  for (let i = 0; i < barChildren.length; i++) {
    const rawNode = barChildren[i]
    if (!rawNode) continue
    if (isProfileLabelNode(rawNode)) continue
    if (isDividerNode(rawNode)) break
    const parsed = parseRawBookmarkNodeToShared(rawNode, i, prevByKey)
    if (!parsed) continue
    const k = parsed.type === 'folder' ? `folder:${parsed.name}` : `url:${parsed.url}`
    if (seenKeys.has(k)) continue
    seenKeys.add(k)
    extracted.push(parsed)
  }
  return extracted.length ? extracted : null
}

function collectSharedKeys(items: SharedBookmarkNode[], urlsOut: Set<string>, foldersOut: Set<string>) {
  for (const item of items) {
    if (item.type === 'folder' || Array.isArray(item.children)) {
      foldersOut.add(item.name)
      if (item.children) collectSharedKeys(item.children, urlsOut, foldersOut)
    } else if (item.url) {
      urlsOut.add(item.url)
    }
  }
}

function buildChromeSharedNodes(items: SharedBookmarkNode[], nowChrome: string, idPrefix = 90010): any[] {
  return items.map((item, idx) => {
    const nodeId = idPrefix + idx
    const guid = `00000000-0000-4000-8000-${String(nodeId).padStart(12, '0')}`
    if (item.type === 'folder' || Array.isArray(item.children)) {
      return {
        children: buildChromeSharedNodes(item.children || [], nowChrome, nodeId * 100),
        date_added: nowChrome,
        date_last_used: '0',
        date_modified: nowChrome,
        guid,
        id: String(nodeId),
        name: item.name || '文件夹',
        type: 'folder',
      }
    }
    const cleanName = (item.name || '').replace(/^[🌐\s]+/, '').trim() || item.name || item.url
    return {
      date_added: nowChrome,
      date_last_used: '0',
      guid,
      id: String(nodeId),
      name: item.hideTitle ? '' : cleanName,
      type: 'url',
      url: item.url,
      ...(item.hideTitle ? { hideTitle: true } : {}),
    }
  })
}

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
    version: '1.1.0',
    description: 'Prism Profile Environment Badge',
    key: BADGE_EXTENSION_KEY,
    permissions: ['bookmarks'],
    action: {
      default_title: badgeTitle,
      default_popup: 'popup.html'
    },
    background: {
      service_worker: 'background.js'
    }
  }
  await writeGenerated(join(extDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

  const dividerTitle = buildDividerTitle(number, profile)
  const profileLabelTitle = buildProfileLabelTitle(number, profile)
  const bg = `
const BADGE_TEXT = '#${number}';
const BADGE_COLOR = '${color}';
const BADGE_TITLE = ${JSON.stringify(badgeTitle)};
const PROFILE_LABEL_TITLE = ${JSON.stringify(profileLabelTitle)};
const PROFILE_LABEL_URL = 'chrome://newtab/';
const DIVIDER_TITLE = ${JSON.stringify(dividerTitle)};
const DIVIDER_URL = 'chrome://bookmarks/';
let __prismSyncing = false;

function isProfileLabel(c) {
  if (!c) return false;
  const t = String(c.title || '');
  return c.url === 'chrome://newtab/' || c.url === 'chrome://version/' || t.endsWith(' ｜') || t.endsWith(' |');
}

function isDivider(c) {
  if (!c) return false;
  const t = String(c.title || '');
  return c.url === DIVIDER_URL || t.includes('专属') || t.includes('公用') || t.includes('共享') || t.includes('📌') || t.startsWith('｜') || /^🟢\\s*#\\d+/.test(t);
}

function applyBadge() {
  try {
    chrome.action.setBadgeText({ text: BADGE_TEXT });
    chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
    chrome.action.setTitle({ title: BADGE_TITLE });
  } catch (e) {}
}

async function syncFolderChildren(parentId, desiredItems) {
  const existing = await chrome.bookmarks.getChildren(parentId);
  const desiredUrls = new Set(desiredItems.filter(s => s.type !== 'folder' && !Array.isArray(s.children)).map(s => s.url));
  const desiredFolders = new Set(desiredItems.filter(s => s.type === 'folder' || Array.isArray(s.children)).map(s => s.name));
  for (const node of existing) {
    if (node.url) {
      if (!desiredUrls.has(node.url)) await chrome.bookmarks.remove(node.id).catch(() => {});
    } else {
      if (!desiredFolders.has(node.title)) await chrome.bookmarks.removeTree(node.id).catch(() => {});
    }
  }
  for (let i = 0; i < desiredItems.length; i++) {
    const item = desiredItems[i];
    const isFolder = item.type === 'folder' || Array.isArray(item.children);
    const curChildren = await chrome.bookmarks.getChildren(parentId);
    if (isFolder) {
      const folderTitle = String(item.name || '文件夹').trim();
      let folderNode = curChildren.find(c => !c.url && c.title === folderTitle);
      if (!folderNode) {
        folderNode = await chrome.bookmarks.create({ parentId, index: i, title: folderTitle }).catch(() => null);
      } else if (folderNode.index !== i) {
        await chrome.bookmarks.move(folderNode.id, { parentId, index: i }).catch(() => {});
      }
      if (folderNode) {
        await syncFolderChildren(folderNode.id, item.children || []);
      }
    } else {
      const desiredTitle = item.hideTitle ? '' : String(item.name || '').replace(/^[🌐\\s]+/, '').trim();
      const found = curChildren.find(c => c.url === item.url);
      if (found) {
        if (found.title !== desiredTitle) {
          await chrome.bookmarks.update(found.id, { title: desiredTitle }).catch(() => {});
        }
        if (found.index !== i) {
          await chrome.bookmarks.move(found.id, { parentId, index: i }).catch(() => {});
        }
      } else {
        await chrome.bookmarks.create({ parentId, index: i, title: desiredTitle, url: item.url }).catch(() => {});
      }
    }
  }
}

globalThis.__prismSyncSharedBookmarks = async function(sharedItems) {
  if (!chrome.bookmarks || !Array.isArray(sharedItems)) return false;
  __prismSyncing = true;
  try {
    const barChildren = await chrome.bookmarks.getChildren('1');
    // 0. 确保最左边 index = 0 是当前 Profile 名字标识
    const labelNodes = barChildren.filter(isProfileLabel);
    for (let l = 1; l < labelNodes.length; l++) {
      await chrome.bookmarks.remove(labelNodes[l].id).catch(() => {});
    }
    let mainLabel = labelNodes[0];
    if (!mainLabel) {
      mainLabel = await chrome.bookmarks.create({ parentId: '1', index: 0, title: PROFILE_LABEL_TITLE, url: PROFILE_LABEL_URL }).catch(() => null);
    } else {
      if (mainLabel.title !== PROFILE_LABEL_TITLE) {
        await chrome.bookmarks.update(mainLabel.id, { title: PROFILE_LABEL_TITLE }).catch(() => {});
      }
      if (mainLabel.index !== 0) {
        await chrome.bookmarks.move(mainLabel.id, { parentId: '1', index: 0 }).catch(() => {});
      }
    }

    const divNodes = barChildren.filter(isDivider);
    for (let d = 1; d < divNodes.length; d++) {
      await chrome.bookmarks.remove(divNodes[d].id).catch(() => {});
    }

    // 1. 同步左侧共享区 (index: 1 .. sharedItems.length)
    const sharedUrls = new Set(sharedItems.filter(s => s.type !== 'folder' && !Array.isArray(s.children)).map(s => s.url));
    const sharedFolders = new Set(sharedItems.filter(s => s.type === 'folder' || Array.isArray(s.children)).map(s => s.name));
    
    // 清理在分界符左侧但不属于 sharedItems 和 ProfileLabel 的无用旧项
    const curChildrenBefore = await chrome.bookmarks.getChildren('1');
    const curDivPos = curChildrenBefore.findIndex(isDivider);
    const leftSlice = curDivPos === -1 ? curChildrenBefore : curChildrenBefore.slice(0, curDivPos);
    for (const node of leftSlice) {
      if (isDivider(node) || isProfileLabel(node)) continue;
      if (node.url) {
        if (!sharedUrls.has(node.url)) await chrome.bookmarks.remove(node.id).catch(() => {});
      } else {
        if (!sharedFolders.has(node.title)) await chrome.bookmarks.removeTree(node.id).catch(() => {});
      }
    }

    for (let i = 0; i < sharedItems.length; i++) {
      const targetIdx = i + 1;
      const item = sharedItems[i];
      const isFolder = item.type === 'folder' || Array.isArray(item.children);
      const currentChildren = await chrome.bookmarks.getChildren('1');
      if (isFolder) {
        const folderTitle = String(item.name || '文件夹').trim();
        let existingFolder = currentChildren.find(c => !c.url && c.title === folderTitle && !isDivider(c) && !isProfileLabel(c));
        if (!existingFolder) {
          existingFolder = await chrome.bookmarks.create({ parentId: '1', index: targetIdx, title: folderTitle }).catch(() => null);
        } else if (existingFolder.index !== targetIdx) {
          await chrome.bookmarks.move(existingFolder.id, { parentId: '1', index: targetIdx }).catch(() => {});
        }
        if (existingFolder) {
          await syncFolderChildren(existingFolder.id, item.children || []);
        }
      } else {
        const desiredTitle = item.hideTitle ? '' : String(item.name || '').replace(/^[🌐\\s]+/, '').trim();
        const existing = currentChildren.find(c => c.url === item.url && !isDivider(c) && !isProfileLabel(c));
        if (existing) {
          if (existing.title !== desiredTitle) {
            await chrome.bookmarks.update(existing.id, { title: desiredTitle }).catch(() => {});
          }
          if (existing.index !== targetIdx) {
            await chrome.bookmarks.move(existing.id, { parentId: '1', index: targetIdx }).catch(() => {});
          }
        } else {
          await chrome.bookmarks.create({ parentId: '1', index: targetIdx, title: desiredTitle, url: item.url }).catch(() => {});
        }
      }
    }

    // 2. 确保 ｜ 个人 分界符位于 index = sharedItems.length + 1
    const divTargetIndex = sharedItems.length + 1;
    const curChildrenAfterShared = await chrome.bookmarks.getChildren('1');
    const existingDiv = curChildrenAfterShared.find(isDivider);
    if (!existingDiv) {
      await chrome.bookmarks.create({ parentId: '1', index: divTargetIndex, title: DIVIDER_TITLE, url: DIVIDER_URL }).catch(() => null);
    } else {
      if (existingDiv.title !== DIVIDER_TITLE) {
        await chrome.bookmarks.update(existingDiv.id, { title: DIVIDER_TITLE }).catch(() => {});
      }
      if (existingDiv.index !== divTargetIndex) {
        await chrome.bookmarks.move(existingDiv.id, { parentId: '1', index: divTargetIndex }).catch(() => {});
      }
    }
    // 注意：分界符右侧全部保留为当前窗口的个人专属书签，绝不破坏！
    return true;
  } catch (e) {
    return false;
  } finally {
    setTimeout(() => { __prismSyncing = false; }, 150);
  }
};

function serializeTreeNodes(nodes) {
  const out = [];
  const seen = new Set();
  for (const c of (nodes || [])) {
    if (isProfileLabel(c)) continue;
    if (isDivider(c)) break; // 核心：遇到分界线即止，只有左侧是公用共享区！
    if (c.children) {
      const k = 'folder:' + (c.title || '文件夹');
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        name: c.title || '文件夹',
        type: 'folder',
        url: '',
        children: serializeTreeNodes(c.children)
      });
    } else if (c.url && !c.url.startsWith('chrome://') && !c.url.startsWith('file://')) {
      const k = 'url:' + c.url;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        name: c.title || c.url,
        type: 'url',
        url: c.url,
        hideTitle: c.title === ''
      });
    }
  }
  return out;
}

async function notifyIfSharedChanged() {
  if (__prismSyncing || !chrome.bookmarks) return;
  try {
    const subTree = await chrome.bookmarks.getSubTree('1');
    const barChildren = (subTree && subTree[0] && subTree[0].children) || [];
    const serialized = serializeTreeNodes(barChildren);
    if (!serialized.length) return;
    console.info('__PRISM_SHARED_BOOKMARKS__' + JSON.stringify(serialized));
  } catch (e) {}
}

if (chrome.bookmarks) {
  chrome.bookmarks.onCreated.addListener(() => { setTimeout(notifyIfSharedChanged, 80); });
  chrome.bookmarks.onRemoved.addListener(() => { setTimeout(notifyIfSharedChanged, 80); });
  chrome.bookmarks.onChanged.addListener(() => { setTimeout(notifyIfSharedChanged, 80); });
  chrome.bookmarks.onMoved.addListener(() => { setTimeout(notifyIfSharedChanged, 80); });
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
  <script src="background.js"></script>
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
  const googleTemplateData = {
    short_name: 'Google',
    keyword: 'google.com',
    url: 'https://www.google.com/search?q={searchTerms}',
    suggestions_url: 'https://www.google.com/complete/search?client=chrome&q={searchTerms}',
    favicon_url: 'https://www.google.com/favicon.ico',
    input_encodings: ['UTF-8'],
    safe_for_autoreplace: false,
    is_active: 1,
    prepopulate_id: 0,
    date_created: '13350000000000000',
    last_modified: '13350000000000000',
    synced_guid: '485bf7d3-0215-45af-87dc-538868000099',
  }
  prefs.default_search_provider_data = {
    template_url_data: googleTemplateData,
    mirrored_template_url_data: googleTemplateData,
  }
  prefs.default_search_provider = {
    enabled: true,
    guid: googleTemplateData.synced_guid,
  }
  prefs.countryid_at_install = 224
  prefs.extensions = {
    ...(prefs.extensions || {}),
    pinned_extensions: Array.from(new Set([
      ...(prefs.extensions?.pinned_extensions || []),
      BADGE_EXTENSION_ID,
      BROWSER_SKILL_EXTENSION_ID,
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
  // 在 Preferences 层真正锁死 WebRTC 非代理 UDP 防漏（现代 Chromium 仅读取此项，避免进程参数暴露或失效）
  if (profile.webRTCPolicy === 'proxy-only') {
    prefs.webrtc = {
      ...(prefs.webrtc || {}),
      ip_handling_policy: 'disable_non_proxied_udp',
    }
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

  // 1. 读取全局公用书签池，并自动扫描是否有其它 Profile 在磁盘上刚刚更新了公用书签，保障下一个 Profile 打开时 100% 同步到位
  const sharedPath = join(directory, '../../workspace-shared-bookmarks.json')
  const profilesRoot = join(directory, '..')
  let sharedItems: SharedBookmarkNode[] = []
  let sharedMtime = 0
  try {
    const st = await stat(sharedPath)
    sharedMtime = st.mtimeMs
    const raw = await readFile(sharedPath, 'utf8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) sharedItems = parsed
  } catch {}

  try {
    const pDirs = await readdir(profilesRoot).catch(() => [] as string[])
    let newestBmMtime = sharedMtime
    let newestExtracted: SharedBookmarkNode[] | null = null
    for (const pid of pDirs) {
      const candidatePath = join(profilesRoot, pid, 'Default', 'Bookmarks')
      try {
        const st = await stat(candidatePath)
        if (st.mtimeMs > newestBmMtime + 50) {
          const candRaw = await readFile(candidatePath, 'utf8')
          const candBm = JSON.parse(candRaw)
          const extracted = extractSharedFromBookmarksJson(candBm, sharedItems)
          if (extracted && extracted.length > 0 && JSON.stringify(extracted) !== JSON.stringify(sharedItems)) {
            newestBmMtime = st.mtimeMs
            newestExtracted = extracted
          }
        }
      } catch {}
    }
    if (newestExtracted) {
      sharedItems = newestExtracted
      await writeFile(sharedPath, JSON.stringify(sharedItems, null, 2), { mode: 0o600 }).catch(() => {})
    }
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

  if (!sharedItems.some(b => b.type !== 'folder' && isGoogleSearch(b.url))) {
    sharedItems.unshift({ id: 'default-google', name: 'Google', type: 'url', url: 'https://www.google.com/' })
  }
  if (!sharedItems.some(b => b.type !== 'folder' && isGmail(b.url))) {
    sharedItems.splice(1, 0, { id: 'default-gmail', name: 'Gmail', type: 'url', url: 'https://mail.google.com/' })
  }
  if (!sharedItems.some(b => b.type !== 'folder' && String(b.url).includes('ping0.cc'))) {
    sharedItems.push({ id: '90002', name: 'ip.ping0.cc', type: 'url', url: 'https://ip.ping0.cc/' })
  }

  // 组装公用书签节点（支持普通网址与书签目录 Folder）
  const sharedUrls = new Set<string>()
  const sharedFolders = new Set<string>()
  collectSharedKeys(sharedItems, sharedUrls, sharedFolders)
  const sharedNodes = buildChromeSharedNodes(sharedItems, nowChrome, 90010)

  // 提取本环境的个人专属书签（位于分界符之后，或者历史备份中不属于共享区的私有书签）
  const extractPrivateNodes = (children: any[] | undefined): any[] => {
    if (!Array.isArray(children) || !children.length) return []
    const divIdx = children.findIndex(isDividerNode)
    if (divIdx >= 0) {
      // 如果旧版本把个人书签放在分界符左侧、或者新版放在分界符右侧，统一过滤掉公用项和分界符后保留私有书签
      const after = children.slice(divIdx + 1)
      const before = children.slice(0, divIdx)
      const isNotShared = (n: any) => {
        if (!n || isDividerNode(n) || isProfileLabelNode(n)) return false
        if (n.type === 'folder' || Array.isArray(n.children)) {
          return !sharedFolders.has(String(n.name || '').trim())
        }
        const u = String(n.url || '')
        return Boolean(u && !u.startsWith('chrome://') && !u.startsWith('file://') && !sharedUrls.has(u))
      }
      const privAfter = after.filter(isNotShared)
      const privBefore = before.filter(isNotShared)
      // 合并并按 URL / Folder 名去重
      const seen = new Set<string>()
      const res: any[] = []
      for (const n of [...privAfter, ...privBefore]) {
        const k = (n.type === 'folder' || Array.isArray(n.children)) ? `f:${n.name}` : `u:${n.url}`
        if (seen.has(k)) continue
        seen.add(k)
        res.push(n)
      }
      return res
    }
    return []
  }

  let privateNodes = extractPrivateNodes(bm?.roots?.bookmark_bar?.children)
  if (!privateNodes.length) {
    try {
      const bakBm = JSON.parse(await readFile(join(defaultDir, 'Bookmarks.bak'), 'utf8'))
      privateNodes = extractPrivateNodes(bakBm?.roots?.bookmark_bar?.children)
    } catch {}
  }

  // 2. 最左边 Profile 名字标识，接着全局共享书签，中间 ｜ 个人，右边本号个人专属书签！
  const profileLabelGuid = '00000000-0000-4000-8000-000000000098'
  const profileLabelNode = {
    date_added: nowChrome,
    date_last_used: '0',
    guid: profileLabelGuid,
    id: '90098',
    name: buildProfileLabelTitle(number, profile),
    type: 'url',
    url: 'chrome://newtab/',
  }

  const dividerGuid = '00000000-0000-4000-8000-000000000099'
  const dividerNode = {
    date_added: nowChrome,
    date_last_used: '0',
    guid: dividerGuid,
    id: '90099',
    name: buildDividerTitle(number, profile),
    type: 'url',
    url: 'chrome://bookmarks/',
  }

  // 布局：[Profile名 ｜, ...全局共享书签, ｜ 个人, ...本号个人专属书签]
  bm = {
    version: 1,
    roots: {
      bookmark_bar: {
        children: [profileLabelNode, ...sharedNodes, dividerNode, ...privateNodes],
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
    SELECT 1 FROM favicon_bitmaps tb
    WHERE tb.icon_id = m_map.target_icon_id
      AND tb.width = b.width
      AND length(tb.image_data) > 0
);

DELETE FROM icon_mapping
WHERE icon_id NOT IN (SELECT DISTINCT icon_id FROM favicon_bitmaps WHERE length(image_data) > 0);

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

async function ensureProfileWallpapers(directory: string, resourcesDir: string, rootDir: string): Promise<void> {
  const possibleSources = [
    join(rootDir, 'wallpapers'),
    join(resourcesDir, 'ranma-wallpapers'),
    join(resourcesDir, 'wallpapers'),
  ]
  let sourceDir = ''
  for (const p of possibleSources) {
    if (await access(p).then(() => true).catch(() => false)) {
      sourceDir = p
      break
    }
  }
  if (!sourceDir) return
  const files = await readdir(sourceDir).catch(() => [] as string[])
  for (const f of files) {
    if (!f.endsWith('.jpg') && !f.endsWith('.png')) continue
    const src = join(sourceDir, f)
    const dst = join(directory, f)
    const exists = await access(dst).then(() => true).catch(() => false)
    if (!exists) {
      await symlink(src, dst).catch(async () => {
        await copyFile(src, dst).catch(() => undefined)
      })
    }
  }
}

async function ensureProfileSearchEngine(defaultDir: string): Promise<void> {
  const targetDb = join(defaultDir, 'Web Data')
  // 关键保护：如果 Web Data 尚未由 Chromium 创建并完成 schema 初始化（包含 autofill 表及 meta.version），
  // 绝不能提前新建只有 meta/keywords 表的空壳 SQLite 文件，否则会导致 Chromium 首次启动报 "Something went wrong when opening your profile"！
  const exists = await access(targetDb).then(() => true).catch(() => false)
  if (!exists) return
  const hasSchema = await new Promise<boolean>((resolve) => {
    const proc = spawn('/usr/bin/sqlite3', [targetDb, "SELECT value FROM meta WHERE key='version';"], { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    proc.stdout.on('data', d => { out += String(d) })
    proc.on('close', () => resolve(Boolean(out.trim())))
    proc.on('error', () => resolve(false))
  })
  if (!hasSchema) {
    // 如果之前残留了没有 version 的残缺空壳 Web Data，立即清理让 Chromium 原生重建
    await rm(targetDb, { force: true }).catch(() => undefined)
    return
  }
  const guid = '485bf7d3-0215-45af-87dc-538868000099'
  const initSql = `
INSERT OR REPLACE INTO keywords (
    id, short_name, keyword, favicon_url, url, safe_for_autoreplace,
    originating_url, date_created, usage_count, input_encodings,
    suggest_url, prepopulate_id, created_by_policy, last_modified,
    sync_guid, alternate_urls, image_url, search_url_post_params,
    suggest_url_post_params, image_url_post_params, new_tab_url,
    last_visited, created_from_play_api, is_active, starter_pack_id,
    enforced_by_policy, featured_by_policy
) VALUES (
    100, "Google", "google.com", "https://www.google.com/favicon.ico",
    "https://www.google.com/search?q={searchTerms}", 0,
    "", 13350000000000000, 10, "UTF-8",
    "https://www.google.com/complete/search?client=chrome&q={searchTerms}", 0, 0, 13350000000000000,
    "${guid}", "[]", "", "", "", "", "https://www.google.com/",
    0, 0, 1, 0, 0, 0
);
`
  await new Promise<void>((resolve) => {
    const proc = spawn('/usr/bin/sqlite3', [targetDb], { stdio: ['pipe', 'ignore', 'ignore'] })
    proc.stdin.write(initSql)
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
  bmWatchTimer?: ReturnType<typeof setInterval>;
  lastBmMtime?: number;
  lastSyncedSignature?: string;
  lastPageTimer?: ReturnType<typeof setTimeout>;
}
export class NativeBrowsers {
  private running = new Map<string, Running>()
  private closing = new Map<string, Promise<void>>()
  private opening = new Map<string, Promise<void>>()
  private syncingLock = false
  constructor(private root: string, private resources: string, private changed: () => void, private closed: (id: string) => void, private onNativeSharedBookmarksChanged?: (shared: SharedBookmarkNode[]) => void, private onBskMeta?: (id: string, instanceId: string, label: string) => void) {}
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
    await ensureProfileSearchEngine(join(directory, 'Default'))
    await ensureProfileWallpapers(directory, this.resources, this.root)
    const args = [
      `--user-data-dir=${directory}`,
      '--remote-debugging-pipe',
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-startup-window',
      '--disable-background-mode',
      '--disable-background-networking',
      '--disable-domain-reliability',
      '--disable-field-trial-config',
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
    const extPaths = [extDir]
    if (await access(join(BROWSER_SKILL_EXTENSION_DIR, 'manifest.json')).then(() => true).catch(() => false)) {
      extPaths.push(BROWSER_SKILL_EXTENSION_DIR)
    }
    args.push(`--load-extension=${extPaths.join(',')}`)
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
        if (running.bmWatchTimer) clearInterval(running.bmWatchTimer)
        this.running.delete(id)
        this.changed()
        this.closed(id)
      }
      // 窗口关闭后再读一次磁盘 Bookmarks，确保退出瞬间刷盘的书签 100% 同步到全局
      setTimeout(() => { void this.checkProfileBookmarksDisk(id, directory) }, 120)
    }
    child.once('exit', (code, signal) => { if (process.env.PRISM_NATIVE_DEBUG === '1') console.error('Native exit', code, signal); cleanup() })
    child.once('error', cleanup)
    const initBmStat = await stat(join(directory, 'Default', 'Bookmarks')).catch(() => null)
    let initSig = ''
    try {
      const initRaw = await readFile(join(this.root, 'workspace-shared-bookmarks.json'), 'utf8')
      const initParsed = JSON.parse(initRaw)
      if (Array.isArray(initParsed)) initSig = JSON.stringify(initParsed)
    } catch {}
    const bmWatchTimer = setInterval(() => {
      void this.checkProfileBookmarksDisk(id, directory)
    }, 800)
    this.running.set(id, { child, pipe, number, directory, bmWatchTimer, lastBmMtime: initBmStat?.mtimeMs || 0, lastSyncedSignature: initSig })
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
          const url = event.targetInfo.url || ''
          // 为内置徽章扩展的 Service Worker 开启轻量控制台监听，实时捕获用户在原生书签栏左区新增/修改的公共书签
          if ((type === 'service_worker' || type === 'background_page') && url.includes(BADGE_EXTENSION_ID)) {
            await pipe.send('Runtime.enable', {}, sid).catch(() => undefined)
            await pipe.send('Runtime.runIfWaitingForDebugger', {}, sid).catch(() => undefined)
            return
          }
          // 为 BrowserSkill 扩展的 Service Worker 自动同步环境名称作为 bh_label，并关闭借用确认（borrow_confirmation: never）
          if ((type === 'service_worker' || type === 'background_page') && url.includes(BROWSER_SKILL_EXTENSION_ID)) {
            await pipe.send('Runtime.enable', {}, sid).catch(() => undefined)
            await pipe.send('Runtime.runIfWaitingForDebugger', {}, sid).catch(() => undefined)
            const googleIdLabel = String(profile.name || `#${number}`).trim()
            setTimeout(async () => {
              try {
                const res = await pipe.send('Runtime.evaluate', {
                  expression: `new Promise(resolve => {
                    chrome.storage.local.get(['bsk_instance_id', 'bh_label', 'bsk_interaction_preferences'], data => {
                      const inst = data?.bsk_instance_id || '';
                      const desired = ${JSON.stringify(googleIdLabel)};
                      const updates = {};
                      if (data?.bh_label !== desired) {
                        updates.bh_label = desired;
                      }
                      const prefs = data?.bsk_interaction_preferences || {};
                      if (prefs.confirmTabBorrow !== false) {
                        updates.bsk_interaction_preferences = { ...prefs, confirmTabBorrow: false };
                      }
                      if (Object.keys(updates).length > 0) {
                        chrome.storage.local.set(updates, () => resolve({ inst, lbl: desired }));
                      } else {
                        resolve({ inst, lbl: data?.bh_label || desired });
                      }
                    });
                  })`,
                  awaitPromise: true,
                  returnByValue: true
                }, sid)
                const val = res?.result?.value
                if (val?.inst) {
                  this.onBskMeta?.(id, String(val.inst), String(val.lbl || googleIdLabel))
                }
              } catch {}
            }, 1200)
            return
          }
          // Native worker identity comes from process switches; resume immediately.
          if (isFingerprintKernel && ['worker', 'shared_worker', 'service_worker'].includes(type)) {
            await pipe.send('Runtime.runIfWaitingForDebugger', {}, sid).catch(() => undefined)
            return
          }

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
      pipe.on('Runtime.consoleAPICalled', (params: any) => {
        const firstArg = params?.args?.[0]?.value
        if (typeof firstArg === 'string' && firstArg.startsWith('__PRISM_SHARED_BOOKMARKS__')) {
          void this.handleNativeSharedBookmarkChange(id, firstArg.slice('__PRISM_SHARED_BOOKMARKS__'.length))
        }
      })
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
      // 首次启动的新环境：等待 Chromium 完成完整的 Web Data (autofill/meta) 初始化后，在后台静默补写 keywords 表
      setTimeout(() => { void ensureProfileSearchEngine(join(directory, 'Default')) }, 2500)
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
  private async checkProfileBookmarksDisk(id: string, directory: string) {
    if (this.syncingLock) return
    const bmPath = join(directory, 'Default', 'Bookmarks')
    try {
      const st = await stat(bmPath)
      const running = this.running.get(id)
      if (running && running.lastBmMtime && st.mtimeMs <= running.lastBmMtime) return
      if (running) running.lastBmMtime = st.mtimeMs
      const raw = await readFile(bmPath, 'utf8')
      const bm = JSON.parse(raw)
      const sharedPath = join(this.root, 'workspace-shared-bookmarks.json')
      let existing: SharedBookmarkNode[] = []
      try {
        const sRaw = await readFile(sharedPath, 'utf8')
        const sParsed = JSON.parse(sRaw)
        if (Array.isArray(sParsed)) existing = sParsed
      } catch {}
      const extracted = extractSharedFromBookmarksJson(bm, existing)
      if (!extracted || !extracted.length) return
      const extractedSig = JSON.stringify(extracted)
      const existingSig = JSON.stringify(existing)
      // 关键防覆盖保护：如果该窗口磁盘刷出的书签与它自己上次同步的快照完全一样，说明用户并未在该窗口修改书签（仅仅是窗口退出或内部刷新），绝不反向覆盖其它窗口刚更新的全局库！
      if (running?.lastSyncedSignature && extractedSig === running.lastSyncedSignature) return
      if (extractedSig !== existingSig) {
        if (running) running.lastSyncedSignature = extractedSig
        await this.applyUpdatedSharedBookmarks(id, extracted)
      }
    } catch {}
  }

  async syncSharedBookmarksLive(sharedItems: Array<{ name: string; url: string; type?: 'url' | 'folder'; hideTitle?: boolean; children?: any[] }>, excludeProfileId?: string) {
    const payload = JSON.stringify(sharedItems)
    for (const [id, item] of this.running.entries()) {
      if (id === excludeProfileId || this.closing.has(id) || item.child.killed || item.child.exitCode !== null) continue
      try {
        const { targetInfos } = await item.pipe.send('Target.getTargets')
        const sw = (targetInfos || []).find((t: any) =>
          (t.type === 'service_worker' || t.type === 'background_page' || t.type === 'page') &&
          String(t.url || '').includes(BADGE_EXTENSION_ID)
        )
        let sid = sw?.targetId ? item.pipe.sessions.get(sw.targetId) : undefined
        if (!sid && sw?.targetId) {
          const attached = await item.pipe.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true }).catch(() => undefined)
          sid = attached?.sessionId
        }
        let syncedOk = false
        if (sid) {
          const res = await item.pipe.send('Runtime.evaluate', {
            expression: `typeof __prismSyncSharedBookmarks === 'function' ? __prismSyncSharedBookmarks(${payload}) : false`,
            awaitPromise: true,
            returnByValue: true,
          }, sid).catch(() => undefined)
          syncedOk = Boolean(res?.result?.value)
        }
        if (!syncedOk) {
          // Chromium 148 在 --remote-debugging-pipe 下不暴露 service_worker target：
          // 直接创建一个隐藏的 popup.html 扩展页（内部加载了 background.js），直接在其 sessionId 上调用 __prismSyncSharedBookmarks 并立即关闭！
          const extPageUrl = `chrome-extension://${BADGE_EXTENSION_ID}/popup.html`
          const created = await item.pipe.send('Target.createTarget', { url: extPageUrl, background: true }).catch(() => undefined)
          if (created?.targetId) {
            await new Promise(r => setTimeout(r, 90))
            let popupSid = item.pipe.sessions.get(created.targetId)
            if (!popupSid) {
              const attached = await item.pipe.send('Target.attachToTarget', { targetId: created.targetId, flatten: true }).catch(() => undefined)
              popupSid = attached?.sessionId
            }
            if (popupSid) {
              const evalRes = await item.pipe.send('Runtime.evaluate', {
                expression: `typeof __prismSyncSharedBookmarks === 'function' ? __prismSyncSharedBookmarks(${payload}) : false`,
                awaitPromise: true,
                returnByValue: true,
              }, popupSid).catch(() => undefined)
              syncedOk = Boolean(evalRes?.result?.value)
            }
            await item.pipe.send('Target.closeTarget', { targetId: created.targetId }).catch(() => undefined)
          }
        }
        if (syncedOk) {
          item.lastSyncedSignature = payload
        }
        // 更新目标运行窗口的 lastBmMtime，防止把我们刚同步写入的变更有误判成回环
        setTimeout(async () => {
          const st = await stat(join(item.directory, 'Default', 'Bookmarks')).catch(() => null)
          if (st && this.running.has(id)) {
            this.running.get(id)!.lastBmMtime = st.mtimeMs
          }
        }, 450)
      } catch {}
    }
  }

  private async handleNativeSharedBookmarkChange(sourceProfileId: string, jsonStr: string) {
    try {
      const items = JSON.parse(jsonStr)
      if (!Array.isArray(items) || !items.length) return
      const sharedPath = join(this.root, 'workspace-shared-bookmarks.json')
      let existing: SharedBookmarkNode[] = []
      try {
        const raw = await readFile(sharedPath, 'utf8')
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) existing = parsed
      } catch {}
      const prevByKey = new Map<string, SharedBookmarkNode>()
      for (const item of existing) {
        prevByKey.set(item.type === 'folder' ? `folder:${item.name}` : `url:${item.url}`, item)
      }
      const updated: SharedBookmarkNode[] = []
      for (let i = 0; i < items.length; i++) {
        const parsed = parseRawBookmarkNodeToShared(items[i], i, prevByKey)
        if (parsed) updated.push(parsed)
      }
      const updatedSig = JSON.stringify(updated)
      if (!updated.length || JSON.stringify(existing) === updatedSig) return
      const running = this.running.get(sourceProfileId)
      if (running) running.lastSyncedSignature = updatedSig
      await this.applyUpdatedSharedBookmarks(sourceProfileId, updated)
    } catch {}
  }

  private async applyUpdatedSharedBookmarks(sourceProfileId: string, updated: SharedBookmarkNode[]) {
    if (this.syncingLock) return
    this.syncingLock = true
    try {
      const sharedPath = join(this.root, 'workspace-shared-bookmarks.json')
      await writeFile(sharedPath, JSON.stringify(updated, null, 2), { mode: 0o600 })
      await this.syncSharedBookmarksLive(updated, sourceProfileId)
      this.onNativeSharedBookmarksChanged?.(updated)
      // 同步落盘到其它未运行的 Profile 的 Default/Bookmarks，确保任意时刻一致
      const profilesRoot = join(this.root, 'native-profiles')
      const dirs = await readdir(profilesRoot).catch(() => [] as string[])
      const nowChrome = String((BigInt(Date.now()) + 11644473600000n) * 1000n)
      const dividerGuid = '00000000-0000-4000-8000-000000000099'
      const sharedNodes = buildChromeSharedNodes(updated, nowChrome, 90010)
      let profileById = new Map<string, any>()
      try {
        const wsRaw = await readFile(join(this.root, 'workspace.json'), 'utf8')
        const wsData = JSON.parse(wsRaw)
        for (const p of (wsData?.profiles || [])) {
          if (p?.id) profileById.set(p.id, p)
        }
      } catch {}
      const sharedUrls = new Set<string>()
      const sharedFolders = new Set<string>()
      collectSharedKeys(updated, sharedUrls, sharedFolders)
      for (const pid of dirs) {
        if (pid === sourceProfileId || this.running.has(pid)) continue
        const bmPath = join(profilesRoot, pid, 'Default', 'Bookmarks')
        try {
          const bmRaw = await readFile(bmPath, 'utf8')
          const bm = JSON.parse(bmRaw)
          const rawChildren = Array.isArray(bm?.roots?.bookmark_bar?.children) ? bm.roots.bookmark_bar.children : []
          const oldDivIdx = rawChildren.findIndex(isDividerNode)
          // 保留分界符右侧（及旧版分界符左侧且非公用）的个人专属书签
          const privateNodes: any[] = []
          const seenPriv = new Set<string>()
          if (oldDivIdx >= 0) {
            for (const n of [...rawChildren.slice(oldDivIdx + 1), ...rawChildren.slice(0, oldDivIdx)]) {
              if (!n || isDividerNode(n) || isProfileLabelNode(n)) continue
              const isFolder = n.type === 'folder' || Array.isArray(n.children)
              if (isFolder) {
                if (sharedFolders.has(String(n.name || '').trim())) continue
                const k = `f:${n.name}`
                if (!seenPriv.has(k)) { seenPriv.add(k); privateNodes.push(n) }
              } else {
                const u = String(n.url || '')
                if (!u || u.startsWith('chrome://') || u.startsWith('file://') || sharedUrls.has(u)) continue
                const k = `u:${u}`
                if (!seenPriv.has(k)) { seenPriv.add(k); privateNodes.push(n) }
              }
            }
          }
          const prof = profileById.get(pid)
          const profileLabelNode = {
            date_added: nowChrome,
            date_last_used: '0',
            guid: '00000000-0000-4000-8000-000000000098',
            id: '90098',
            name: buildProfileLabelTitle(prof?.sequenceNumber || prof?.number, prof),
            type: 'url',
            url: 'chrome://newtab/',
          }
          const dividerNode = {
            date_added: nowChrome,
            date_last_used: '0',
            guid: dividerGuid,
            id: '90099',
            name: buildDividerTitle(),
            type: 'url',
            url: 'chrome://bookmarks/',
          }
          if (bm?.roots?.bookmark_bar) {
            bm.roots.bookmark_bar.children = [profileLabelNode, ...sharedNodes, dividerNode, ...privateNodes]
            await writeFile(bmPath, JSON.stringify(bm, null, 2), { mode: 0o600 })
          }
        } catch {}
      }
    } finally {
      this.syncingLock = false
    }
  }
  async removeProfileData(id: string) {
    if (!safeId(id)) throw new Error('Profile ID 无效')
    await this.close(id)
    const directory = join(this.root, 'native-profiles', id)
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  }
}
