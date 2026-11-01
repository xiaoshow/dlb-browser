import { app, BrowserWindow, session, WebContentsView, nativeImage, Menu, clipboard } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { access, writeFile } from 'node:fs/promises'
import {
  importNativeCookiesToSession,
  setupCookieSyncBack,
  readProfileBookmarks,
  addProfileBookmark,
  removeProfileBookmark,
  updateProfileBookmark,
  reorderProfileBookmarks,
  readSharedBookmarks,
  addSharedBookmark,
  removeSharedBookmark,
  updateSharedBookmark,
  reorderSharedBookmarks,
  syncStoredBookmarkFavicon,
  type BookmarkItem,
} from './cookie-bridge.js'

export interface TabEntry {
  id: string
  profileId: string
  profileNumber: number
  profileName: string
  color: string
  url: string
  title: string
  favicon?: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  view: WebContentsView
}

export interface WorkspaceSession {
  win: BrowserWindow
  groupId: string
  groupName: string
  groupColor: string
  tabs: TabEntry[]
  activeTabId: string | null
  commandBarOpen?: boolean
}

const PROFILE_PALETTE = [
  '#8ee2b5', // Arc Mint
  '#c9baf7', // Arc Lavender
  '#fbb39d', // Arc Peach
  '#8fd5fa', // Arc Sky
  '#fde047', // Arc Lemon
  '#f9a8d4', // Arc Rose
  '#7de2d1', // Arc Teal
  '#a3e635', // Arc Sage
]

export class GroupWorkspaceManager {
  private workspaces = new Map<string, WorkspaceSession>()
  private winToGroupId = new Map<number, string>()
  private profileBookmarks = new Map<string, BookmarkItem[]>()
  private sharedBookmarks: BookmarkItem[] = []
  private importedProfileCookies = new Set<string>()

  constructor(
    private getState: () => any,
    private saveState: (state: any) => Promise<void> | void,
    private configureProxy: (ownerId: string, ses: Electron.Session, proxy: any) => Promise<string>,
    private getPreloadPath: () => string,
    private getHtmlPath: (groupId: string) => { isUrl: boolean; path: string }
  ) {}

  getWorkspaceByWindow(win: BrowserWindow): WorkspaceSession | undefined {
    const groupId = this.winToGroupId.get(win.id)
    return groupId ? this.workspaces.get(groupId) : undefined
  }

  getWorkspaceBySender(sender: Electron.WebContents): WorkspaceSession | undefined {
    const win = BrowserWindow.fromWebContents(sender)
    if (win) {
      const ws = this.getWorkspaceByWindow(win)
      if (ws) return ws
    }
    for (const ws of this.workspaces.values()) {
      if (ws.tabs.some((t) => t.view.webContents === sender)) {
        return ws
      }
    }
    return undefined
  }

  getWorkspace(groupId: string): WorkspaceSession | undefined {
    return this.workspaces.get(groupId)
  }

  getClientState(ws: WorkspaceSession) {
    const state = this.getState()
    const profiles = state.profiles || []
    const groups = state.groups || []
    const pbObj: Record<string, BookmarkItem[]> = {}
    for (const [k, v] of this.profileBookmarks.entries()) {
      pbObj[k] = v
    }
    return {
      groupId: ws.groupId,
      groupName: ws.groupName,
      groupColor: ws.groupColor,
      activeTabId: ws.activeTabId,
      bookmarks: this.sharedBookmarks,
      sharedBookmarks: this.sharedBookmarks,
      profileBookmarks: pbObj,
      tabs: ws.tabs.map((t) => {
        const p = profiles.find((item: any) => item.id === t.profileId)
        const grp = groups.find((g: any) => g.id === p?.groupId)
        return {
          id: t.id,
          profileId: t.profileId,
          profileNumber: t.profileNumber,
          profileName: t.profileName,
          color: t.color,
          url: t.url,
          title: t.title,
          favicon: t.favicon,
          loading: t.loading,
          canGoBack: t.canGoBack,
          canGoForward: t.canGoForward,
          pinned: Boolean(p?.pinned),
          groupId: p?.groupId || '',
          groupName: grp?.name || '默认分组',
        }
      }),
    }
  }

  broadcastState(ws: WorkspaceSession) {
    if (!ws.win.isDestroyed()) {
      ws.win.webContents.send('workspace:state', this.getClientState(ws))
    }
  }

  private updateBounds(ws: WorkspaceSession) {
    if (ws.win.isDestroyed()) return
    const [width, height] = ws.win.getContentSize()
    const sidebarWidth = 260
    // 官方 Chrome 原版顶部地址栏 (42px) + 官方书签栏 (30px) = 72px，绝不遮挡顶部操作区
    const topBarHeight = 72
    const contentX = sidebarWidth
    const contentY = topBarHeight
    const contentW = Math.max(0, width - sidebarWidth)
    const contentH = Math.max(0, height - topBarHeight)

    const active = ws.tabs.find((t) => t.id === ws.activeTabId)
    for (const tab of ws.tabs) {
      if (tab === active) {
        tab.view.setBounds({
          x: contentX,
          y: contentY,
          width: contentW,
          height: contentH,
        })
        tab.view.setVisible(true)
      } else {
        tab.view.setVisible(false)
      }
    }
  }

  moveTab(groupId: string, sourceTabId: string, targetGroupId?: string, pinned?: boolean) {
    const ws = this.workspaces.get(groupId)
    if (!ws) return
    const tab = ws.tabs.find((t) => t.id === sourceTabId)
    if (!tab) return

    const state = this.getState()
    const profiles = state.profiles || []
    const targetProfile = profiles.find((p: any) => p.id === tab.profileId)
    if (targetProfile) {
      if (pinned !== undefined) targetProfile.pinned = pinned
      if (targetGroupId !== undefined) targetProfile.groupId = targetGroupId
      this.saveState({ ...state, profiles })
    }
    this.broadcastState(ws)
  }

  setCommandBar(groupId: string, open: boolean) {
    const ws = this.workspaces.get(groupId)
    if (!ws) return
    ws.commandBarOpen = open
    this.updateBounds(ws)
  }

  async openGroup(groupId: string, explicitProfileIds?: string[]): Promise<{ ok: boolean; error?: string }> {
    const state = this.getState()
    const group = (state.groups || []).find((g: any) => g.id === groupId) || {
      id: groupId || 'all',
      name: groupId ? '自定义分组' : '全部环境',
      color: '#3b82f6',
    }

    const profiles = (state.profiles || []).filter((p: any) => {
      if (explicitProfileIds?.length) return explicitProfileIds.includes(p.id)
      return groupId ? p.groupId === groupId : true
    })

    if (!profiles.length) {
      return { ok: false, error: '该分组内暂无任何 Profile，请先添加环境' }
    }

    // 初始化/加载同窗聚合共用书签池与各环境专属书签
    const initialPids = profiles.map((p: any) => p.id)
    this.sharedBookmarks = await readSharedBookmarks(app.getPath('userData'), initialPids)
    for (const pid of initialPids) {
      const pItems = await readProfileBookmarks(app.getPath('userData'), pid)
      this.profileBookmarks.set(pid, pItems)
    }

    // If workspace already exists for this group, focus and return
    const existing = this.workspaces.get(group.id)
    if (existing && !existing.win.isDestroyed()) {
      existing.win.show()
      existing.win.focus()
      return { ok: true }
    }

    const groupIconPath = join(
      app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources'),
      'native/prism-group-dock.png'
    )
    const baseIconPath = join(
      app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources'),
      'native/prism-dock.png'
    )
    let workspaceIcon: Electron.NativeImage | undefined
    try {
      workspaceIcon = nativeImage.createFromPath(groupIconPath)
      if (workspaceIcon.isEmpty()) {
        workspaceIcon = nativeImage.createFromPath(baseIconPath)
      }
    } catch {
      try {
        workspaceIcon = nativeImage.createFromPath(baseIconPath)
      } catch {}
    }

    const win = new BrowserWindow({
      title: `${group.name} · Arc 聚合工作台`,
      width: 1480,
      height: 920,
      minWidth: 1040,
      minHeight: 640,
      icon: workspaceIcon && !workspaceIcon.isEmpty() ? workspaceIcon : undefined,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 18, y: 16 },
      backgroundColor: '#8ee2b5',
      show: false,
      webPreferences: {
        preload: this.getPreloadPath(),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    // macOS Dock 图标与徽标支持 (保证聚合打开时在 Dock 醒目可见并带专属装饰)
    if (process.platform === 'darwin' && app.dock) {
      try {
        app.dock.show()
        if (workspaceIcon && !workspaceIcon.isEmpty()) {
          app.dock.setIcon(workspaceIcon)
        }
        app.dock.setBadge(profiles.length > 0 ? `🗂️ ${profiles.length}` : '聚合')

        const dockMenu = Menu.buildFromTemplate([
          {
            label: `✨ 聚合工作台：${group.name}（${profiles.length} 个环境）`,
            click: () => {
              if (!win.isDestroyed()) {
                win.show()
                win.focus()
              }
            },
          },
          { type: 'separator' },
          {
            label: `📌 切换到主管理面板`,
            click: () => {
              const mainWin = BrowserWindow.getAllWindows().find((w) => w.id !== win.id)
              if (mainWin && !mainWin.isDestroyed()) {
                mainWin.show()
                mainWin.focus()
              }
            },
          },
        ])
        app.dock.setMenu(dockMenu)
      } catch (err) {
        console.warn('[Dock] Failed to configure dock for group workspace:', err)
      }
    }

    const ws: WorkspaceSession = {
      win,
      groupId: group.id,
      groupName: group.name,
      groupColor: group.color || '#3b82f6',
      tabs: [],
      activeTabId: null,
    }

    this.workspaces.set(group.id, ws)
    this.winToGroupId.set(win.id, group.id)

    win.on('resize', () => this.updateBounds(ws))
    win.on('focus', () => {
      if (process.platform === 'darwin' && app.dock) {
        app.dock.setBadge(profiles.length > 0 ? `🗂️ ${profiles.length}` : '聚合')
      }
    })
    win.on('closed', () => {
      this.winToGroupId.delete(win.id)
      this.workspaces.delete(group.id)
      // 如果没有其他聚合窗口在跑，清空 Dock 角标并切回默认图标
      if (process.platform === 'darwin' && app.dock && this.workspaces.size === 0) {
        try {
          const defaultIcon = nativeImage.createFromPath(baseIconPath)
          if (!defaultIcon.isEmpty()) {
            app.dock.setIcon(defaultIcon)
          }
        } catch {}
        app.dock.setBadge('')
      }
      // Destroy views
      for (const t of ws.tabs) {
        try {
          win.contentView.removeChildView(t.view)
          t.view.webContents.close()
        } catch {}
      }
    })

    // Load frontend page
    const html = this.getHtmlPath(group.id)
    win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      if (level >= 2) {
        console.error(`[Workspace Frontend Error] ${message} (${sourceId}:${line})`)
      }
    })

    if (html.isUrl) {
      await win.loadURL(html.path)
    } else {
      await win.loadFile(html.path, {
        query: { mode: 'workspace', groupId: group.id },
        search: `?mode=workspace&groupId=${encodeURIComponent(group.id)}`,
      })
    }

    win.once('ready-to-show', () => {
      win.show()
      this.broadcastState(ws)
    })

    // Initialize tabs: one initial tab per profile (严禁隐式并发偷跑 Google 请求)
    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i]
      const color = p.color || PROFILE_PALETTE[((p.number || i + 1) - 1) % PROFILE_PALETTE.length]
      const targetStartUrl = p.startUrl && p.startUrl.trim() ? p.startUrl.trim() : 'about:blank'
      await this.createTabEntry(ws, p, color, targetStartUrl)
    }

    if (ws.tabs.length > 0) {
      this.switchTab(group.id, ws.tabs[0].id)
    }

    return { ok: true }
  }

  private async createTabEntry(
    ws: WorkspaceSession,
    profile: any,
    color: string,
    initialUrl: string,
    insertAfterTabId?: string
  ): Promise<TabEntry> {
    const tabId = randomUUID()
    const state = this.getState()
    const proxy = (state.proxies || []).find((px: any) => px.id === profile.proxyId)

    // Dedicated partition ensures complete session isolation
    const partition = `persist:profile-${profile.id}`
    const ses = session.fromPartition(partition, { cache: true })

    try {
      await this.configureProxy(profile.id, ses, proxy)
    } catch (e) {
      console.warn(`[Workspace] Proxy config warning for ${profile.name}:`, e)
    }

    // 纯净 User-Agent：剥除 "Electron/x.y.z" 标识，杜绝被网站识别为自动化工具，同时保持 Client Hints 自然一致
    const defaultUa = ses.getUserAgent()
    const cleanUa = defaultUa.replace(/\s*Electron\/[0-9.]+/gi, '')
    const targetUa = profile.userAgentMode === 'custom' && profile.userAgent ? profile.userAgent : cleanUa
    ses.setUserAgent(targetUa)

    try {
      ses.webRequest.onBeforeSendHeaders((details, callback) => {
        const headers = { ...details.requestHeaders }
        for (const k of Object.keys(headers)) {
          if (k.toLowerCase() === 'user-agent') {
            headers[k] = headers[k].replace(/\s*Electron\/[0-9.]+/gi, '')
          }
        }
        callback({ requestHeaders: headers })
      })
    } catch {}

    // 仅在首次初始化全新 Profile 分区时导入一次现有 Cookies，绝不在已有会话中反复重放覆盖，避免触发 Google 旋转封禁
    const markerFile = join(app.getPath('userData'), 'Partitions', `profile-${profile.id}`, '.cookies_migrated')
    const markerExists = await access(markerFile).then(() => true).catch(() => false)
    if (!markerExists && !this.importedProfileCookies.has(profile.id)) {
      this.importedProfileCookies.add(profile.id)
      try {
        const count = await importNativeCookiesToSession(app.getPath('userData'), profile.id, ses)
        await writeFile(markerFile, JSON.stringify({ migratedAt: new Date().toISOString(), count }), { mode: 0o600 }).catch(() => undefined)
      } catch (e) {
        console.warn(`[Workspace] Cookie import warning for ${profile.name}:`, e)
      }
    }

    const view = new WebContentsView({
      webPreferences: {
        session: ses,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: true,
      },
    })

    // 恢复全套 Chrome 原生快捷键
    view.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      const isMac = process.platform === 'darwin'
      const cmdOrCtrl = isMac ? input.meta : input.control
      const key = input.key.toLowerCase()

      // 1. Reload (Cmd/Ctrl + R, Cmd/Ctrl + Shift + R, F5)
      if (key === 'r' && cmdOrCtrl && !input.alt) {
        event.preventDefault()
        if (input.shift) view.webContents.reloadIgnoringCache()
        else view.webContents.reload()
        return
      }
      if (key === 'f5') {
        event.preventDefault()
        if (input.shift || cmdOrCtrl) view.webContents.reloadIgnoringCache()
        else view.webContents.reload()
        return
      }

      // 2. Navigation Back / Forward (Cmd + [ / Cmd + ], Alt + Left / Alt + Right)
      if ((cmdOrCtrl && key === '[') || (input.alt && key === 'arrowleft')) {
        event.preventDefault()
        if (view.webContents.navigationHistory.canGoBack()) view.webContents.navigationHistory.goBack()
        return
      }
      if ((cmdOrCtrl && key === ']') || (input.alt && key === 'arrowright')) {
        event.preventDefault()
        if (view.webContents.navigationHistory.canGoForward()) view.webContents.navigationHistory.goForward()
        return
      }

      // 3. Focus Address Bar (Cmd/Ctrl + L)
      if (key === 'l' && cmdOrCtrl && !input.shift && !input.alt) {
        event.preventDefault()
        ws.win.webContents.focus()
        try { ws.win.webContents.send('workspace:focus-omnibox') } catch {}
        return
      }

      // 4. Bookmark Current Tab (Cmd/Ctrl + D)
      if (key === 'd' && cmdOrCtrl && !input.shift && !input.alt) {
        event.preventDefault()
        const tab = ws.tabs.find(t => t.id === ws.activeTabId)
        if (tab && tab.url && tab.url !== 'about:blank') {
          void this.addBookmark(ws.groupId, tab.profileId, tab.title || tab.url, tab.url)
        }
        return
      }

      // 5. Close Tab (Cmd/Ctrl + W)
      if (key === 'w' && cmdOrCtrl && !input.shift && !input.alt) {
        event.preventDefault()
        this.closeTab(ws.groupId, tabId)
        return
      }

      // 6. New Tab (Cmd/Ctrl + T)
      if (key === 't' && cmdOrCtrl && !input.shift && !input.alt) {
        event.preventDefault()
        void this.createTabEntry(ws, profile, color, 'about:blank', tabId).then(newTab => {
          this.switchTab(ws.groupId, newTab.id)
          setTimeout(() => {
            if (!ws.win.isDestroyed()) {
              ws.win.webContents.focus()
              ws.win.webContents.send('workspace:focus-omnibox', { clear: true })
            }
          }, 30)
        })
        return
      }

      // 7. DevTools (Cmd/Ctrl + Alt + I, F12)
      if ((key === 'i' && cmdOrCtrl && input.alt) || key === 'f12') {
        event.preventDefault()
        view.webContents.toggleDevTools()
        return
      }

      // 8. Zoom (+, -, 0)
      if (cmdOrCtrl && (key === '=' || key === '+')) {
        event.preventDefault()
        const z = view.webContents.getZoomFactor()
        view.webContents.setZoomFactor(Math.min(3.0, z + 0.1))
        return
      }
      if (cmdOrCtrl && (key === '-' || key === '_')) {
        event.preventDefault()
        const z = view.webContents.getZoomFactor()
        view.webContents.setZoomFactor(Math.max(0.3, z - 0.1))
        return
      }
      if (cmdOrCtrl && key === '0') {
        event.preventDefault()
        view.webContents.setZoomFactor(1.0)
        return
      }

      // 9. Tab Switching (Control + Tab, Control + Shift + Tab)
      if (input.control && key === 'tab') {
        event.preventDefault()
        const idx = ws.tabs.findIndex(t => t.id === ws.activeTabId)
        if (idx !== -1 && ws.tabs.length > 1) {
          const nextIdx = input.shift
            ? (idx - 1 + ws.tabs.length) % ws.tabs.length
            : (idx + 1) % ws.tabs.length
          this.switchTab(ws.groupId, ws.tabs[nextIdx].id)
        }
        return
      }
    })

    view.setVisible(false)
    ws.win.contentView.addChildView(view)

    const tabEntry: TabEntry = {
      id: tabId,
      profileId: profile.id,
      profileNumber: profile.number || 1,
      profileName: profile.name || 'Google Profile',
      color,
      url: initialUrl,
      title: `${profile.name || '环境'} - 加载中...`,
      loading: true,
      canGoBack: false,
      canGoForward: false,
      view,
    }

    // Core rule: setWindowOpenHandler creates a child tab right adjacent to this tab with the EXACT SAME COLOR & PROFILE!
    view.webContents.setWindowOpenHandler(({ url }) => {
      void this.createAdjacentTab(ws.groupId, tabId, url)
      return { action: 'deny' }
    })

    view.webContents.on('page-title-updated', (_event, title) => {
      tabEntry.title = title || tabEntry.profileName
      this.broadcastState(ws)
    })

    view.webContents.on('page-favicon-updated', (_event, favicons) => {
      if (favicons?.[0]) {
        tabEntry.favicon = favicons[0]
        void this.syncBookmarkFavicon(tabEntry.url, favicons[0])
        this.broadcastState(ws)
      }
    })

    view.webContents.on('did-start-loading', () => {
      tabEntry.loading = true
      this.broadcastState(ws)
    })

    view.webContents.on('did-stop-loading', () => {
      tabEntry.loading = false
      tabEntry.url = view.webContents.getURL()
      tabEntry.canGoBack = view.webContents.canGoBack()
      tabEntry.canGoForward = view.webContents.canGoForward()
      this.broadcastState(ws)
    })

    // Insert adjacent or at end
    if (insertAfterTabId) {
      const idx = ws.tabs.findIndex((t) => t.id === insertAfterTabId)
      if (idx >= 0) {
        ws.tabs.splice(idx + 1, 0, tabEntry)
      } else {
        ws.tabs.push(tabEntry)
      }
    } else {
      ws.tabs.push(tabEntry)
    }

    void view.webContents.loadURL(initialUrl).catch(() => undefined)
    return tabEntry
  }

  // Same Profile & Same Color adjacent tab creation
  async createAdjacentTab(groupId: string, sourceTabId: string, url: string) {
    const ws = this.workspaces.get(groupId)
    if (!ws) return
    const sourceTab = ws.tabs.find((t) => t.id === sourceTabId)
    if (!sourceTab) return

    const state = this.getState()
    const profile = (state.profiles || []).find((p: any) => p.id === sourceTab.profileId) || {
      id: sourceTab.profileId,
      name: sourceTab.profileName,
      number: sourceTab.profileNumber,
    }

    // Strictly inherit color and profileId
    const targetUrl = url || 'about:blank'
    const newTab = await this.createTabEntry(ws, profile, sourceTab.color, targetUrl, sourceTabId)
    this.switchTab(groupId, newTab.id)
    if (targetUrl === 'about:blank') {
      setTimeout(() => {
        if (!ws.win.isDestroyed()) {
          ws.win.webContents.focus()
          ws.win.webContents.send('workspace:focus-omnibox', { clear: true })
        }
      }, 30)
    }
  }

  async newTab(groupId: string, targetProfileId?: string, url?: string) {
    const ws = this.workspaces.get(groupId)
    if (!ws) return
    const activeTab = ws.tabs.find((t) => t.id === ws.activeTabId)
    const profileId = targetProfileId || activeTab?.profileId || ws.tabs[0]?.profileId
    if (!profileId) return

    const state = this.getState()
    const profile = (state.profiles || []).find((p: any) => p.id === profileId)
    if (!profile) return

    const existingTab = ws.tabs.find((t) => t.profileId === profileId)
    const color = existingTab?.color || profile.color || '#2563eb'
    const targetUrl = url || (profile.startUrl && profile.startUrl.trim() ? profile.startUrl.trim() : 'about:blank')

    const newTab = await this.createTabEntry(ws, profile, color, targetUrl, activeTab?.id)
    this.switchTab(groupId, newTab.id)
    if (targetUrl === 'about:blank') {
      setTimeout(() => {
        if (!ws.win.isDestroyed()) {
          ws.win.webContents.focus()
          ws.win.webContents.send('workspace:focus-omnibox', { clear: true })
        }
      }, 30)
    }
  }

  private getArcBgColor(hex?: string): string {
    const map: Record<string, string> = {
      '#ea580c': '#ffaa88',
      '#059669': '#8ee2b5',
      '#2563eb': '#8cd3f8',
      '#7c3aed': '#c8b7f8',
      '#e11d48': '#f9a8d4',
      '#d97706': '#fde047',
      '#0284c7': '#8cd3f8',
      '#16a34a': '#bef264',
      '#0d9488': '#7ee2d4',
    }
    return map[hex || ''] || hex || '#8ee2b5'
  }

  async ensureBookmarks(profileId: string): Promise<BookmarkItem[]> {
    const bms = await readProfileBookmarks(app.getPath('userData'), profileId)
    this.profileBookmarks.set(profileId, bms)
    return bms
  }

  async syncBookmarkFavicon(url: string, favicon: string) {
    if (!url || !favicon) return
    let changed = false
    for (const b of this.sharedBookmarks) {
      if (b.url === url && b.favicon !== favicon) {
        b.favicon = favicon
        changed = true
      }
    }
    for (const [, list] of this.profileBookmarks.entries()) {
      for (const b of list) {
        if (b.url === url && b.favicon !== favicon) {
          b.favicon = favicon
          changed = true
        }
      }
    }
    if (changed) {
      await syncStoredBookmarkFavicon(app.getPath('userData'), undefined, url, favicon)
    }
  }

  async addBookmark(
    groupId: string,
    profileId: string,
    name: string,
    url: string,
    scope: 'shared' | 'profile' = 'shared',
    favicon?: string
  ) {
    const ws = this.workspaces.get(groupId)
    if (scope === 'profile' && profileId) {
      await addProfileBookmark(app.getPath('userData'), profileId, name, url, favicon)
      const updated = await readProfileBookmarks(app.getPath('userData'), profileId)
      this.profileBookmarks.set(profileId, updated)
    } else {
      const pids = ws ? Array.from(new Set(ws.tabs.map((t) => t.profileId))) : [profileId]
      this.sharedBookmarks = await addSharedBookmark(app.getPath('userData'), name, url, pids, favicon)
    }
    if (ws) this.broadcastState(ws)
  }

  async removeBookmark(
    groupId: string,
    profileId: string,
    url: string,
    scope: 'shared' | 'profile' = 'shared'
  ) {
    const ws = this.workspaces.get(groupId)
    if (scope === 'profile' && profileId) {
      await removeProfileBookmark(app.getPath('userData'), profileId, url)
      const updated = await readProfileBookmarks(app.getPath('userData'), profileId)
      this.profileBookmarks.set(profileId, updated)
    } else {
      const pids = ws ? Array.from(new Set(ws.tabs.map((t) => t.profileId))) : [profileId]
      this.sharedBookmarks = await removeSharedBookmark(app.getPath('userData'), url, pids)
    }
    if (ws) this.broadcastState(ws)
  }

  async updateBookmark(
    groupId: string,
    profileId: string,
    oldUrl: string,
    newName: string,
    newUrl: string,
    scope: 'shared' | 'profile' = 'shared',
    favicon?: string
  ) {
    const ws = this.workspaces.get(groupId)
    if (scope === 'profile' && profileId) {
      await updateProfileBookmark(app.getPath('userData'), profileId, oldUrl, newName, newUrl)
      const updated = await readProfileBookmarks(app.getPath('userData'), profileId)
      this.profileBookmarks.set(profileId, updated)
    } else {
      this.sharedBookmarks = await updateSharedBookmark(app.getPath('userData'), oldUrl, newName, newUrl, favicon)
    }
    if (ws) this.broadcastState(ws)
  }

  async moveBookmarkScope(
    groupId: string,
    profileId: string,
    bookmark: BookmarkItem,
    targetScope: 'shared' | 'profile'
  ) {
    const ws = this.workspaces.get(groupId)
    if (targetScope === 'shared') {
      if (profileId) {
        await removeProfileBookmark(app.getPath('userData'), profileId, bookmark.url)
        const updated = await readProfileBookmarks(app.getPath('userData'), profileId)
        this.profileBookmarks.set(profileId, updated)
      }
      this.sharedBookmarks = await addSharedBookmark(app.getPath('userData'), bookmark.name, bookmark.url, [])
    } else if (targetScope === 'profile') {
      this.sharedBookmarks = await removeSharedBookmark(app.getPath('userData'), bookmark.url, [])
      if (profileId) {
        await addProfileBookmark(app.getPath('userData'), profileId, bookmark.name, bookmark.url)
        const updated = await readProfileBookmarks(app.getPath('userData'), profileId)
        this.profileBookmarks.set(profileId, updated)
      }
    }
    if (ws) this.broadcastState(ws)
  }

  async reorderBookmarks(
    groupId: string,
    profileId: string,
    bookmarks: BookmarkItem[],
    scope: 'shared' | 'profile' = 'shared'
  ) {
    const ws = this.workspaces.get(groupId)
    if (scope === 'profile' && profileId) {
      await reorderProfileBookmarks(app.getPath('userData'), profileId, bookmarks)
      this.profileBookmarks.set(profileId, bookmarks)
    } else {
      this.sharedBookmarks = await reorderSharedBookmarks(app.getPath('userData'), bookmarks)
    }
    if (ws) this.broadcastState(ws)
  }

  setModalActive(groupId: string, active: boolean) {
    const ws = this.workspaces.get(groupId)
    if (!ws) return
    const activeTab = ws.tabs.find((t) => t.id === ws.activeTabId)
    if (activeTab) {
      activeTab.view.setVisible(!active)
    }
  }

  showBookmarkContextMenu(
    groupId: string,
    profileId: string,
    bookmark: BookmarkItem | null,
    scope: 'shared' | 'profile',
    x?: number,
    y?: number
  ) {
    const ws = this.workspaces.get(groupId)
    if (!ws || ws.win.isDestroyed()) return

    const popupOptions: Electron.PopupOptions = { window: ws.win }
    if (typeof x === 'number' && typeof y === 'number' && x > 0 && y > 0) {
      popupOptions.x = Math.round(x)
      popupOptions.y = Math.round(y)
    }

    if (bookmark) {
      const menu = Menu.buildFromTemplate([
        {
          label: '在当前标签打开',
          click: () => {
            ws.win.webContents.send('workspace:trigger-bookmark', {
              action: 'open',
              url: bookmark.url,
            })
          },
        },
        {
          label: '在新标签页打开',
          click: () => {
            ws.win.webContents.send('workspace:trigger-bookmark', {
              action: 'new-tab',
              url: bookmark.url,
            })
          },
        },
        { type: 'separator' },
        scope === 'shared'
          ? {
              label: '转为专属收藏（当前号独享）',
              click: () => {
                void this.moveBookmarkScope(groupId, profileId, bookmark, 'profile')
              },
            }
          : {
              label: '转为公共收藏（所有号可见）',
              click: () => {
                void this.moveBookmarkScope(groupId, profileId, bookmark, 'shared')
              },
            },
        { type: 'separator' },
        {
          label: '重命名…',
          click: () => {
            ws.win.webContents.send('workspace:trigger-bookmark', {
              action: 'rename',
              bookmark,
              scope,
            })
          },
        },
        {
          label: '编辑…',
          click: () => {
            ws.win.webContents.send('workspace:trigger-bookmark', {
              action: 'edit',
              bookmark,
              scope,
            })
          },
        },
        {
          label: '复制网址',
          click: () => {
            clipboard.writeText(bookmark.url)
          },
        },
        { type: 'separator' },
        {
          label: '删除',
          click: () => {
            void this.removeBookmark(groupId, profileId, bookmark.url, scope)
          },
        },
      ])
      setTimeout(() => {
        if (!ws.win.isDestroyed()) {
          menu.popup(popupOptions)
        }
      }, 20)
    } else {
      const menu = Menu.buildFromTemplate([
        {
          label: `添加${scope === 'shared' ? '公共' : '专属'}书签…`,
          click: () => {
            ws.win.webContents.send('workspace:trigger-bookmark', {
              action: 'add',
              scope,
            })
          },
        },
      ])
      setTimeout(() => {
        if (!ws.win.isDestroyed()) {
          menu.popup(popupOptions)
        }
      }, 20)
    }
  }

  setProfileColor(groupId: string, profileId: string, color: string) {
    const ws = this.workspaces.get(groupId)
    if (!ws) return
    for (const t of ws.tabs) {
      if (t.profileId === profileId) {
        t.color = color
      }
    }
    const active = ws.tabs.find((t) => t.id === ws.activeTabId)
    if (active && active.profileId === profileId) {
      try {
        ws.win.setBackgroundColor(this.getArcBgColor(color))
      } catch {}
    }
    this.broadcastState(ws)

    try {
      const state = this.getState()
      const p = (state.profiles || []).find((item: any) => item.id === profileId)
      if (p) p.color = color
    } catch {}
  }

  switchTab(groupId: string, tabId: string) {
    const ws = this.workspaces.get(groupId)
    if (!ws) return
    const target = ws.tabs.find((t) => t.id === tabId)
    if (!target) return

    ws.activeTabId = tabId
    if (target.color) {
      try {
        ws.win.setBackgroundColor(this.getArcBgColor(target.color))
      } catch {}
    }
    this.updateBounds(ws)
    if (target.url === 'about:blank') {
      ws.win.webContents.focus()
      setTimeout(() => {
        if (!ws.win.isDestroyed()) {
          ws.win.webContents.send('workspace:focus-omnibox', { clear: true })
        }
      }, 10)
    } else {
      target.view.webContents.focus()
    }
    void this.ensureBookmarks(target.profileId).then(() => {
      this.broadcastState(ws)
    })
    this.broadcastState(ws)
  }

  closeTab(groupId: string, tabId: string) {
    const ws = this.workspaces.get(groupId)
    if (!ws) return
    const idx = ws.tabs.findIndex((t) => t.id === tabId)
    if (idx < 0) return

    const [removed] = ws.tabs.splice(idx, 1)
    try {
      ws.win.contentView.removeChildView(removed.view)
      removed.view.webContents.close()
    } catch {}

    // If active tab closed, switch to adjacent
    if (ws.activeTabId === tabId) {
      if (ws.tabs.length > 0) {
        const nextIdx = Math.min(idx, ws.tabs.length - 1)
        this.switchTab(groupId, ws.tabs[nextIdx].id)
      } else {
        ws.activeTabId = null
        this.broadcastState(ws)
        try { ws.win.close() } catch {}
      }
    } else {
      this.broadcastState(ws)
    }
  }

  navigate(groupId: string, tabId: string, rawUrl: string) {
    const ws = this.workspaces.get(groupId)
    if (!ws) return
    const tab = ws.tabs.find((t) => t.id === tabId)
    if (!tab) return

    let targetUrl = rawUrl.trim()
    if (!targetUrl) return
    if (!/^https?:\/\//i.test(targetUrl) && !/^about:/i.test(targetUrl)) {
      if (targetUrl.includes('.') && !targetUrl.includes(' ')) {
        targetUrl = 'https://' + targetUrl
      } else {
        targetUrl = 'https://www.google.com/search?q=' + encodeURIComponent(targetUrl)
      }
    }
    tab.url = targetUrl
    tab.loading = true
    this.broadcastState(ws)
    targetUrl !== 'about:blank' && tab.view.webContents.focus()
    void tab.view.webContents.loadURL(targetUrl).catch((err) => {
      console.warn(`[Workspace] Navigate error for tab ${tabId}:`, err)
    })
  }

  goBack(groupId: string, tabId: string) {
    const ws = this.workspaces.get(groupId)
    const tab = ws?.tabs.find((t) => t.id === tabId)
    if (tab?.view.webContents.canGoBack()) tab.view.webContents.goBack()
  }

  goForward(groupId: string, tabId: string) {
    const ws = this.workspaces.get(groupId)
    const tab = ws?.tabs.find((t) => t.id === tabId)
    if (tab?.view.webContents.canGoForward()) tab.view.webContents.goForward()
  }

  reload(groupId: string, tabId: string) {
    const ws = this.workspaces.get(groupId)
    const tab = ws?.tabs.find((t) => t.id === tabId)
    if (tab) tab.view.webContents.reload()
  }
}
