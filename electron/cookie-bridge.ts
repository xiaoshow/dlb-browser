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
 */
export function setupCookieSyncBack(userDataDir: string, profileId: string, ses: Session): void {
  const db = join(userDataDir, 'native-profiles', profileId, 'Default', 'Cookies')

  ses.cookies.on('changed', async (_event, cookie, cause, removed) => {
    // 关键保护：绝不因前端单次页面刷新或短暂 session 过期把原生持久 SQLite 中的有效登录凭证误删！
    if (cause === 'overwrite' || removed) return
    const exists = await access(db).then(() => true).catch(() => false)
    if (!exists) return

    try {
      const encrypted = encryptCookie(cookie.value)
      const hex = encrypted.toString('hex')
      const nowUtcMicros = (Math.floor(Date.now() / 1000) + 11644473600) * 1000000
      const expUtcMicros = cookie.expirationDate
        ? (Math.floor(cookie.expirationDate) + 11644473600) * 1000000
        : 0
      const hostKey = cookie.domain || ''
      const isSecure = cookie.secure ? 1 : 0
      const isHttpOnly = cookie.httpOnly ? 1 : 0
      let sameSite = 0
      if (cookie.sameSite === 'lax') sameSite = 1
      else if (cookie.sameSite === 'strict') sameSite = 2
      else if (cookie.sameSite === 'no_restriction') sameSite = -1

      const sql = `INSERT OR REPLACE INTO cookies (
        creation_utc, host_key, top_frame_site_key, name, value, encrypted_value, path,
        expires_utc, is_secure, is_httponly, last_access_utc, has_expires, is_persistent,
        priority, samesite, source_scheme, source_port, last_update_utc, source_type, has_cross_site_ancestor
      ) VALUES (
        ${nowUtcMicros}, '${hostKey}', '', '${cookie.name}', '', X'${hex}', '${cookie.path || '/'}',
        ${expUtcMicros}, ${isSecure}, ${isHttpOnly}, ${nowUtcMicros}, ${cookie.expirationDate ? 1 : 0}, ${cookie.expirationDate ? 1 : 0},
        1, ${sameSite}, ${isSecure ? 2 : 1}, ${isSecure ? 443 : 80}, ${nowUtcMicros}, 0, 0
      );`
      await exec('sqlite3', [db, sql]).catch(() => undefined)
    } catch {}
  })
}

export interface BookmarkItem {
  id?: string
  name: string
  url: string
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
      }))
  } catch {
    return []
  }
}

export async function addProfileBookmark(
  userDataDir: string,
  profileId: string,
  name: string,
  url: string
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
    const exists = data.roots.bookmark_bar.children.some((c: any) => c?.url === url)
    if (!exists) {
      data.roots.bookmark_bar.children.push({
        date_added: String((Date.now() + 11644473600000) * 1000),
        guid: randomUUID(),
        id: String(Date.now()),
        name: name || url,
        type: 'url',
        url,
      })
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
  mirrorToProfileIds: string[] = []
): Promise<BookmarkItem[]> {
  const filePath = join(userDataDir, 'workspace-shared-bookmarks.json')
  let list: BookmarkItem[] = []
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) list = parsed
  } catch {}

  if (!list.some(b => b.url === url)) {
    list.push({
      id: randomUUID(),
      name: name || url,
      url,
    })
    await writeFile(filePath, JSON.stringify(list, null, 2), { mode: 0o600 })
  }

  // 镜像同步写入各选中的 Profile 自身，确保单独启动时也有此书签
  for (const pid of mirrorToProfileIds) {
    await addProfileBookmark(userDataDir, pid, name, url).catch(() => undefined)
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
