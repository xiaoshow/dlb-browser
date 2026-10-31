import { app, BrowserWindow, session, WebContentsView } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { importNativeCookiesToSession, setupCookieSyncBack } from './cookie-bridge.js'

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

  constructor(
    private getState: () => any,
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
    return {
      groupId: ws.groupId,
      groupName: ws.groupName,
      groupColor: ws.groupColor,
      activeTabId: ws.activeTabId,
      tabs: ws.tabs.map((t) => ({
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
      })),
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
    const sidebarWidth = 250
    const topBarHeight = 44
    const margin = 6
    const contentX = sidebarWidth + margin
    const contentY = topBarHeight + margin
    const contentW = Math.max(0, width - sidebarWidth - margin * 2)
    const contentH = Math.max(0, height - topBarHeight - margin * 2)

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

    // If workspace already exists for this group, focus and return
    const existing = this.workspaces.get(group.id)
    if (existing && !existing.win.isDestroyed()) {
      existing.win.show()
      existing.win.focus()
      return { ok: true }
    }

    const win = new BrowserWindow({
      title: `${group.name} · Arc 聚合工作台`,
      width: 1480,
      height: 920,
      minWidth: 1040,
      minHeight: 640,
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
    win.on('closed', () => {
      this.winToGroupId.delete(win.id)
      this.workspaces.delete(group.id)
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
    if (html.isUrl) {
      await win.loadURL(html.path)
    } else {
      await win.loadFile(html.path, { search: `?mode=workspace&groupId=${encodeURIComponent(group.id)}` })
    }

    win.once('ready-to-show', () => {
      win.show()
      this.broadcastState(ws)
    })

    // Initialize tabs: one initial tab per profile
    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i]
      const color = p.color || PROFILE_PALETTE[((p.number || i + 1) - 1) % PROFILE_PALETTE.length]
      await this.createTabEntry(ws, p, color, p.startUrl && p.startUrl !== 'about:blank' ? p.startUrl : 'https://www.google.com')
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

    // Clean user agent: strip "Electron/x.y.z" so Google doesn't block or drop login!
    const defaultUa = ses.getUserAgent()
    const cleanUa = defaultUa.replace(/\s*Electron\/[0-9.]+/g, '')
    ses.setUserAgent(profile.userAgentMode === 'custom' && profile.userAgent ? profile.userAgent : cleanUa)

    // Import existing cookies from native profile SQLite so it has identical login state
    try {
      await importNativeCookiesToSession(app.getPath('userData'), profile.id, ses)
    } catch (e) {
      console.warn(`[Workspace] Cookie import warning for ${profile.name}:`, e)
    }

    // Bidirectional sync back to native profile SQLite so changes are preserved
    try {
      setupCookieSyncBack(app.getPath('userData'), profile.id, ses)
    } catch {}

    const view = new WebContentsView({
      webPreferences: {
        session: ses,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: true,
      },
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
    const newTab = await this.createTabEntry(ws, profile, sourceTab.color, url || 'https://www.google.com', sourceTabId)
    this.switchTab(groupId, newTab.id)
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
    const targetUrl = url || (profile.startUrl && profile.startUrl !== 'about:blank' ? profile.startUrl : 'https://www.google.com')

    const newTab = await this.createTabEntry(ws, profile, color, targetUrl, activeTab?.id)
    this.switchTab(groupId, newTab.id)
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
    target.view.webContents.focus()
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
    void tab.view.webContents.loadURL(targetUrl).catch(() => undefined)
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
