import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { access, readFile, writeFile } from 'node:fs/promises'
import crypto, { randomUUID } from 'node:crypto'
import type { Session } from 'electron'

const exec = promisify(execFile)

const SALT = Buffer.from('saltysalt', 'utf8')
const IV = Buffer.alloc(16, ' ')
const KEY = crypto.pbkdf2Sync('mock_password', SALT, 1003, 16, 'sha1')

export function decryptCookie(encBuf: Buffer): string {
  if (!encBuf || encBuf.length <= 3) return ''
  const prefix = encBuf.subarray(0, 3).toString('utf8')
  if (prefix !== 'v10') return encBuf.toString('utf8')
  const cipherData = encBuf.subarray(3)
  try {
    const decipher = crypto.createDecipheriv('aes-128-cbc', KEY, IV)
    const dec = Buffer.concat([decipher.update(cipherData), decipher.final()])
    // 32-byte header in Chromium on macOS OSCrypt
    return dec.subarray(32).toString('utf8')
  } catch {
    return ''
  }
}

export function encryptCookie(plaintext: string): Buffer {
  const cipher = crypto.createCipheriv('aes-128-cbc', KEY, IV)
  const header = crypto.randomBytes(32)
  const input = Buffer.concat([header, Buffer.from(plaintext, 'utf8')])
  const enc = Buffer.concat([cipher.update(input), cipher.final()])
  return Buffer.concat([Buffer.from('v10', 'utf8'), enc])
}

/**
 * Import all existing cookies from native Chromium user data directory into Electron's partition session.
 */
export async function importNativeCookiesToSession(
  userDataDir: string,
  profileId: string,
  ses: Session
): Promise<number> {
  const db = join(userDataDir, 'native-profiles', profileId, 'Default', 'Cookies')
  const exists = await access(db).then(() => true).catch(() => false)
  if (!exists) return 0

  const query =
    'SELECT host_key, name, path, is_secure, is_httponly, expires_utc, samesite, hex(encrypted_value) FROM cookies;'
  try {
    const { stdout } = await exec('sqlite3', [db, query], { maxBuffer: 15 * 1024 * 1024 })
    const lines = stdout.split('\n').filter(Boolean)
    let imported = 0

    for (const line of lines) {
      const parts = line.split('|')
      if (parts.length < 8) continue
      const [hostKey, name, path, isSecureStr, isHttpOnlyStr, expiresUtcStr, sameSiteStr, hex] = parts
      const val = decryptCookie(Buffer.from(hex || '', 'hex'))
      if (!val) continue

      const isSecure = isSecureStr === '1'
      const isDomain = hostKey.startsWith('.')
      const cleanHost = hostKey.replace(/^\./, '')
      const scheme = isSecure ? 'https' : 'http'
      const url = `${scheme}://${cleanHost}${path || '/'}`

      const details: Electron.CookiesSetDetails = {
        url,
        name,
        value: val,
        path: path || '/',
        secure: isSecure,
        httpOnly: isHttpOnlyStr === '1',
      }

      if (name.startsWith('__Host-')) {
        details.secure = true
        delete details.domain
        details.path = '/'
      } else if (name.startsWith('__Secure-')) {
        details.secure = true
        if (isDomain) details.domain = cleanHost
      } else if (isDomain) {
        details.domain = cleanHost
      }

      const expiresUtc = Number(expiresUtcStr)
      if (expiresUtc > 0) {
        const expSec = Math.floor(expiresUtc / 1000000) - 11644473600
        if (expSec > Date.now() / 1000) details.expirationDate = expSec
      }

      const sameSiteNum = Number(sameSiteStr)
      if (sameSiteNum === 1) details.sameSite = 'lax'
      else if (sameSiteNum === 2) details.sameSite = 'strict'
      else details.sameSite = 'no_restriction'

      try {
        await ses.cookies.set(details)
        imported++
      } catch {
        // Skip invalid/unsupported single cookies
      }
    }
    return imported
  } catch (err) {
    console.warn(`[CookieBridge] Import error for profile ${profileId}:`, err)
    return 0
  }
}

/**
 * Synchronize newly created or updated cookies in Electron session back to the native Chromium SQLite database.
 * 注意：原生 Chromium 在 macOS 上使用系统的独立 Keychain / OSCrypt 解密，外部盲目写入假 AES 会导致原生内核判定数据库损坏并登出 Google。
 * 此处仅作安全占位，不向原生 SQLite 写入无法被原生内核解密的假密文。
 */
export function setupCookieSyncBack(_userDataDir: string, _profileId: string, _ses: Session): void {
  // 安全保护：停止外部篡改原生 SQLite 数据库
}

export interface BookmarkItem {
  id?: string
  name: string
  url: string
  favicon?: string
  hideTitle?: boolean
}

export async function readProfileBookmarks(userDataDir: string, profileId: string): Promise<BookmarkItem[]> {
  const filePath = join(userDataDir, 'native-profiles', profileId, 'Default', 'Bookmarks')
  try {
    const raw = await readFile(filePath, 'utf8')
    const data = JSON.parse(raw)
    const children = data?.roots?.bookmark_bar?.children || []
    return children
      .filter((c: any) => c && c.type === 'url' && c.url && !c.url.startsWith('file://'))
      .map((c: any) => ({
        id: c.id || c.guid,
        name: c.name || c.url,
        url: c.url,
        favicon: c.favicon || undefined,
        hideTitle: Boolean(c.hideTitle),
      }))
  } catch {
    return []
  }
}

export async function addProfileBookmark(
  userDataDir: string,
  profileId: string,
  name: string,
  url: string,
  favicon?: string,
  hideTitle?: boolean
): Promise<void> {
  const filePath = join(userDataDir, 'native-profiles', profileId, 'Default', 'Bookmarks')
  try {
    let data: any = {}
    try {
      data = JSON.parse(await readFile(filePath, 'utf8'))
    } catch {}
    if (!data.roots) data.roots = {}
    if (!data.roots.bookmark_bar) {
      data.roots.bookmark_bar = { children: [], name: 'Bookmarks Bar', type: 'folder' }
    }
    if (!Array.isArray(data.roots.bookmark_bar.children)) {
      data.roots.bookmark_bar.children = []
    }
    const target = data.roots.bookmark_bar.children.find((c: any) => c?.url === url)
    if (!target) {
      data.roots.bookmark_bar.children.push({
        date_added: String((Date.now() + 11644473600000) * 1000),
        guid: randomUUID(),
        id: String(Date.now()),
        name: name || url,
        type: 'url',
        url,
        favicon: favicon || undefined,
        ...(hideTitle !== undefined ? { hideTitle: Boolean(hideTitle) } : {}),
      })
      await writeFile(filePath, JSON.stringify(data, null, 2), { mode: 0o600 })
    } else if (favicon && !target.favicon) {
      target.favicon = favicon
      await writeFile(filePath, JSON.stringify(data, null, 2), { mode: 0o600 })
    }
  } catch (err) {
    console.warn(`[Bookmarks] Failed to add bookmark for ${profileId}:`, err)
  }
}

export async function removeProfileBookmark(
  userDataDir: string,
  profileId: string,
  url: string
): Promise<void> {
  const filePath = join(userDataDir, 'native-profiles', profileId, 'Default', 'Bookmarks')
  try {
    const raw = await readFile(filePath, 'utf8')
    const data = JSON.parse(raw)
    if (Array.isArray(data?.roots?.bookmark_bar?.children)) {
      data.roots.bookmark_bar.children = data.roots.bookmark_bar.children.filter((c: any) => c?.url !== url)
      await writeFile(filePath, JSON.stringify(data, null, 2), { mode: 0o600 })
    }
  } catch (err) {
    console.warn(`[Bookmarks] Failed to remove bookmark for ${profileId}:`, err)
  }
}

export async function updateProfileBookmark(
  userDataDir: string,
  profileId: string,
  oldUrl: string,
  newName: string,
  newUrl: string
): Promise<void> {
  const filePath = join(userDataDir, 'native-profiles', profileId, 'Default', 'Bookmarks')
  try {
    const raw = await readFile(filePath, 'utf8')
    const data = JSON.parse(raw)
    const children = data?.roots?.bookmark_bar?.children
    if (Array.isArray(children)) {
      const target = children.find((c: any) => c?.url === oldUrl)
      if (target) {
        target.name = newName.trim() || target.name
        target.url = newUrl.trim() || target.url
        await writeFile(filePath, JSON.stringify(data, null, 2), { mode: 0o600 })
      }
    }
  } catch (err) {
    console.warn(`[Bookmarks] Failed to update bookmark for ${profileId}:`, err)
  }
}

export async function reorderProfileBookmarks(
  userDataDir: string,
  profileId: string,
  orderedItems: BookmarkItem[]
): Promise<void> {
  const filePath = join(userDataDir, 'native-profiles', profileId, 'Default', 'Bookmarks')
  try {
    const raw = await readFile(filePath, 'utf8')
    const data = JSON.parse(raw)
    if (!data.roots) data.roots = {}
    if (!data.roots.bookmark_bar) data.roots.bookmark_bar = { children: [], name: 'Bookmarks Bar', type: 'folder' }
    
    // 按新顺序重组 children（完整保留原有的 hideTitle、favicon、date_added 等元数据）
    const oldChildren: any[] = Array.isArray(data.roots.bookmark_bar.children)
      ? data.roots.bookmark_bar.children
      : []
    data.roots.bookmark_bar.children = orderedItems.map((item) => {
      const prev = oldChildren.find((c: any) => c?.url === item.url)
      return {
        ...(prev || {}),
        date_added: prev?.date_added || String((Date.now() + 11644473600000) * 1000),
        guid: item.id || prev?.guid || randomUUID(),
        id: item.id || prev?.id || String(Date.now()),
        name: item.name || item.url,
        type: 'url',
        url: item.url,
        ...(item.favicon || prev?.favicon ? { favicon: item.favicon || prev?.favicon } : {}),
        ...(item.hideTitle !== undefined
          ? { hideTitle: Boolean(item.hideTitle) }
          : prev?.hideTitle !== undefined
            ? { hideTitle: Boolean(prev.hideTitle) }
            : {}),
      }
    })
    await writeFile(filePath, JSON.stringify(data, null, 2), { mode: 0o600 })
  } catch (err) {
    console.warn(`[Bookmarks] Failed to reorder bookmarks for ${profileId}:`, err)
  }
}

/**
 * 共享/共用收藏夹库 (Shared Workspace Bookmarks)
 * 所有选中的 Profile 在同窗聚合工作台内共享这一套收藏
 */
export async function readSharedBookmarks(userDataDir: string, initialProfileIds: string[] = []): Promise<BookmarkItem[]> {
  const filePath = join(userDataDir, 'workspace-shared-bookmarks.json')
  try {
    const raw = await readFile(filePath, 'utf8')
    const list = JSON.parse(raw)
    if (Array.isArray(list)) return list
  } catch {}

  // 初始如果为空，尝试从各个选中环境的原生书签中合并出初始共享池
  const merged: BookmarkItem[] = []
  const seenUrls = new Set<string>()

  for (const pid of initialProfileIds) {
    const items = await readProfileBookmarks(userDataDir, pid)
    for (const it of items) {
      if (!seenUrls.has(it.url)) {
        seenUrls.add(it.url)
        merged.push(it)
      }
    }
  }

  // 默认提供几个常用极客与搜索入口（如尚未有任何书签）
  if (merged.length === 0) {
    merged.push(
      { id: '1', name: 'Google', url: 'https://www.google.com' },
      { id: '2', name: 'YouTube', url: 'https://www.youtube.com' },
      { id: '3', name: 'GitHub', url: 'https://github.com' }
    )
  }

  try {
    await writeFile(filePath, JSON.stringify(merged, null, 2), { mode: 0o600 })
  } catch {}
  return merged
}

export async function addSharedBookmark(
  userDataDir: string,
  name: string,
  url: string,
  mirrorToProfileIds: string[] = [],
  favicon?: string,
  hideTitle?: boolean
): Promise<BookmarkItem[]> {
  const filePath = join(userDataDir, 'workspace-shared-bookmarks.json')
  let list: BookmarkItem[] = []
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) list = parsed
  } catch {}

  const existing = list.find(b => b.url === url)
  if (!existing) {
    list.push({
      id: randomUUID(),
      name: name || url,
      url,
      favicon: favicon || undefined,
      ...(hideTitle !== undefined ? { hideTitle: Boolean(hideTitle) } : {}),
    })
    await writeFile(filePath, JSON.stringify(list, null, 2), { mode: 0o600 })
  } else if (favicon && !existing.favicon) {
    existing.favicon = favicon
    await writeFile(filePath, JSON.stringify(list, null, 2), { mode: 0o600 })
  }

  // 镜像同步写入各选中的 Profile 自身，确保单独启动时也有此书签
  for (const pid of mirrorToProfileIds) {
    await addProfileBookmark(userDataDir, pid, name, url, favicon, hideTitle).catch(() => undefined)
  }

  return list
}

export async function removeSharedBookmark(
  userDataDir: string,
  url: string,
  mirrorToProfileIds: string[] = []
): Promise<BookmarkItem[]> {
  const filePath = join(userDataDir, 'workspace-shared-bookmarks.json')
  let list: BookmarkItem[] = []
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) list = parsed
  } catch {}

  list = list.filter(b => b.url !== url)
  await writeFile(filePath, JSON.stringify(list, null, 2), { mode: 0o600 })

  for (const pid of mirrorToProfileIds) {
    await removeProfileBookmark(userDataDir, pid, url).catch(() => undefined)
  }

  return list
}

export async function updateSharedBookmark(
  userDataDir: string,
  oldUrl: string,
  newName: string,
  newUrl: string,
  favicon?: string
): Promise<BookmarkItem[]> {
  const filePath = join(userDataDir, 'workspace-shared-bookmarks.json')
  let list: BookmarkItem[] = []
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) list = parsed
  } catch {}

  const target = list.find(b => b.url === oldUrl)
  if (target) {
    target.name = newName.trim() || target.name
    target.url = newUrl.trim() || target.url
    if (favicon) target.favicon = favicon
    await writeFile(filePath, JSON.stringify(list, null, 2), { mode: 0o600 })
  }
  return list
}

export async function syncStoredBookmarkFavicon(
  userDataDir: string,
  profileId: string | undefined,
  url: string,
  favicon: string
): Promise<void> {
  if (!url || !favicon) return
  // 1. 同步 shared bookmarks
  try {
    const sharedPath = join(userDataDir, 'workspace-shared-bookmarks.json')
    const raw = await readFile(sharedPath, 'utf8')
    const list: BookmarkItem[] = JSON.parse(raw)
    let changed = false
    for (const b of list) {
      if (b.url === url && b.favicon !== favicon) {
        b.favicon = favicon
        changed = true
      }
    }
    if (changed) {
      await writeFile(sharedPath, JSON.stringify(list, null, 2), { mode: 0o600 })
    }
  } catch {}

  // 2. 同步 profile bookmarks
  if (profileId) {
    try {
      const profPath = join(userDataDir, 'native-profiles', profileId, 'Default', 'Bookmarks')
      const raw = await readFile(profPath, 'utf8')
      const data = JSON.parse(raw)
      const children = data?.roots?.bookmark_bar?.children
      if (Array.isArray(children)) {
        let changed = false
        for (const c of children) {
          if (c && c.url === url && c.favicon !== favicon) {
            c.favicon = favicon
            changed = true
          }
        }
        if (changed) {
          await writeFile(profPath, JSON.stringify(data, null, 2), { mode: 0o600 })
        }
      }
    } catch {}
  }
}

export async function reorderSharedBookmarks(
  userDataDir: string,
  newList: BookmarkItem[]
): Promise<BookmarkItem[]> {
  const filePath = join(userDataDir, 'workspace-shared-bookmarks.json')
  try {
    await writeFile(filePath, JSON.stringify(newList, null, 2), { mode: 0o600 })
  } catch {}
  return newList
}

export async function toggleSharedBookmarkHideTitle(
  userDataDir: string,
  url: string
): Promise<BookmarkItem[]> {
  const filePath = join(userDataDir, 'workspace-shared-bookmarks.json')
  let list: BookmarkItem[] = []
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) list = parsed
  } catch {}

  const target = list.find((b) => b.url === url)
  if (target) {
    target.hideTitle = !target.hideTitle
    await writeFile(filePath, JSON.stringify(list, null, 2), { mode: 0o600 })
  }
  return list
}

export async function toggleProfileBookmarkHideTitle(
  userDataDir: string,
  profileId: string,
  url: string
): Promise<BookmarkItem[]> {
  const filePath = join(userDataDir, 'native-profiles', profileId, 'Default', 'Bookmarks')
  try {
    const raw = await readFile(filePath, 'utf8')
    const data = JSON.parse(raw)
    const children = data?.roots?.bookmark_bar?.children
    if (Array.isArray(children)) {
      const target = children.find((c: any) => c?.url === url)
      if (target) {
        target.hideTitle = !target.hideTitle
        await writeFile(filePath, JSON.stringify(data, null, 2), { mode: 0o600 })
      }
    }
  } catch {}
  return readProfileBookmarks(userDataDir, profileId)
}

