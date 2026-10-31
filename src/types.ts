export type ProxyKind = 'direct' | 'system' | 'socks5' | 'vless'

export interface ProxyNode {
  source?: 'v2rayn'
  sourceId?: string
  favorite?: boolean
  id: string
  name: string
  kind: ProxyKind
  host?: string
  port?: number
  username?: string
  password?: string
  shareUrl?: string
  transport?: string
  security?: string
  flow?: string
  sni?: string
  fingerprint?: string
  publicKey?: string
  shortId?: string
}

export interface FingerprintOptions {
  seed?: string
  canvas?: 'real' | 'noise'
  webGL?: 'real' | 'noise'
  audio?: 'real' | 'noise'
  webGLVendor?: string
  webGLRenderer?: string
  deviceMemory?: number
  maxTouchPoints?: number
  doNotTrack?: 'real' | 'on' | 'off'
  webRTC?: 'real' | 'disabled'
  mediaDevices?: 'real' | 'blocked'
  speech?: 'real' | 'hidden'
  fonts?: 'real' | 'restricted'
  webGPU?: 'real' | 'disabled'
  battery?: 'real' | 'hidden'
  connection?: 'real' | 'hidden'
  plugins?: 'real' | 'empty'
  colorScheme?: 'light' | 'dark'
  reducedMotion?: 'reduce' | 'no-preference'
  geolocationMode?: 'ip'
  geolocation?: { latitude: number; longitude: number; accuracy: number }
  pixelRatio?: number
}

export interface BrowserProfile {
  number?: number
  id: string
  name: string
  alias?: string
  color: string
  avatar?: string
  lastOpenedAt?: string
  proxyId: string
  fingerprint?: FingerprintOptions
  timezone: string
  locale?: string
  resolution?: { width: number; height: number }
  hardwareConcurrency?: number
  webRTCPolicy?: 'real' | 'proxy-only'
  startUrl: string
  userAgentMode: 'real' | 'custom'
  userAgent?: string
  notes?: string
  accountNote?: string
  groupId: string
  pinned?: boolean
}

export interface ProfileGroup {
  sortMode?: 'original' | 'name' | 'reset' | 'priority' | 'recent'
  id: string
  name: string
  color: string
  collapsed?: boolean
}

export interface AppState {
  nextProfileNumber?: number
  presentationMode?: 'tabs' | 'windows'
  pinnedSortMode?: ProfileGroup['sortMode']
  profiles: BrowserProfile[]
  proxies: ProxyNode[]
  groups: ProfileGroup[]
  defaultProxyId?: string
  keepAlive?: number
  preloadOnStart?: boolean
}

export interface VlessParseResult {
  ok: boolean
  node?: ProxyNode
  error?: string
}

export interface ProxyTestResult {
  location?: { ip: string; timezone: string; locale: string; latitude: number; longitude: number; country: string; city: string }
  locationWarning?: string
  ok: boolean
  latency?: number
  ip?: string
  error?: string
}

export interface WorkspaceTab {
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
}

export interface WorkspaceState {
  groupId: string
  groupName: string
  groupColor: string
  tabs: WorkspaceTab[]
  activeTabId: string | null
}

export interface BrowserAPI {
  scanV2ray: () => Promise<{ nodes: ProxyNode[]; total: number; skipped: number }>
  syncV2ray: (selected: string[]) => Promise<{ state: AppState; added: number; updated: number }>
  getUpdateStatus: (check?: boolean) => Promise<UpdateCenterStatus>
  setPresentationMode: (mode: 'tabs' | 'windows') => Promise<{ ok: boolean }>
  getRunningProfiles: () => Promise<string[]>
  onProfileRuntime: (callback: (ids: string[]) => void) => () => void
  loadState: () => Promise<AppState>
  saveState: (state: AppState) => Promise<void>
  openProfile: (profile: BrowserProfile, proxy?: ProxyNode) => Promise<{ ok: boolean; error?: string }>
  closeProfile: (profileId: string) => Promise<void>
  deleteProfiles: (profileIds: string[]) => Promise<{ ok: boolean; state?: AppState; error?: string }>
  exportCookies: (profileId: string) => Promise<{ ok: boolean; cookies?: any[]; error?: string }>
  importCookies: (profileId: string, cookies: any[]) => Promise<{ ok: boolean; count?: number; error?: string }>
  onAccountNote: (callback: (profileId: string, note: string) => void) => () => void
  parseVless: (url: string) => Promise<VlessParseResult>
  testProxy: (proxy: ProxyNode) => Promise<ProxyTestResult>
  onNewTab: (callback: () => void) => () => void
  onCloseTab: (callback: () => void) => () => void
  openGroupWorkspace: (groupId: string, profileIds?: string[]) => Promise<{ ok: boolean; error?: string }>
  workspaceGetState: () => Promise<WorkspaceState | null>
  workspaceSwitchTab: (tabId: string) => Promise<void>
  workspaceCloseTab: (tabId: string) => Promise<void>
  workspaceNewTab: (profileId?: string, url?: string) => Promise<void>
  workspaceNavigate: (tabId: string, url: string) => Promise<void>
  workspaceGoBack: (tabId: string) => Promise<void>
  workspaceGoForward: (tabId: string) => Promise<void>
  workspaceReload: (tabId: string) => Promise<void>
  workspaceSetCommandBar: (visible: boolean) => Promise<void>
  onWorkspaceState: (callback: (state: WorkspaceState) => void) => () => void
}

declare global {
  interface Window {
    profileBrowser?: BrowserAPI
  }
}

export interface UpdateCenterStatus {
  appVersion: string
  kernelVersion: string
  kernelName: string
  configured: boolean
  installEnabled: boolean
  status: string
  message: string
  checkedAt?: string
  releases?: Partial<Record<'app' | 'kernel', { version: string; notes: string; publishedAt: string; url: string; sha256: string }>>
}
