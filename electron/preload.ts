import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('profileBrowser', {
  scanV2ray: () => ipcRenderer.invoke('v2ray:scan'),
  syncV2ray: (selected: string[]) => ipcRenderer.invoke('v2ray:sync', selected),
  getUpdateStatus: (check: boolean = false) => ipcRenderer.invoke('updates:status', check),
  setPresentationMode: (mode: 'tabs' | 'windows') => ipcRenderer.invoke('workspace:mode', mode),
  getRunningProfiles: () => ipcRenderer.invoke('profile:runtime'),
  onProfileRuntime: (callback: (ids: string[]) => void) => { const listener = (_event: Electron.IpcRendererEvent, ids: string[]) => callback(ids); ipcRenderer.on('profile:runtime', listener); return () => ipcRenderer.removeListener('profile:runtime', listener) },
  onAccountNote: (callback: (profileId: string, note: string) => void) => { const listener = (_event: Electron.IpcRendererEvent, profileId: string, note: string) => callback(profileId, note); ipcRenderer.on('profile:account-note', listener); return () => ipcRenderer.removeListener('profile:account-note', listener) },
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (state: unknown) => ipcRenderer.invoke('state:save', state),
  openProfile: (profile: unknown, proxy: unknown) => ipcRenderer.invoke('profile:open', profile, proxy),
  closeProfile: (profileId: string) => ipcRenderer.invoke('profile:close', profileId),
  deleteProfiles: (profileIds: string[]) => ipcRenderer.invoke('profile:delete', profileIds),
  exportCookies: (profileId: string) => ipcRenderer.invoke('profile:cookies-export', profileId),
  importCookies: (profileId: string, cookies: unknown[]) => ipcRenderer.invoke('profile:cookies-import', profileId, cookies),
  parseVless: (url: string) => ipcRenderer.invoke('proxy:parse-vless', url),
  testProxy: (proxy: unknown) => ipcRenderer.invoke('proxy:test', proxy),
  onNewTab: (callback: () => void) => { const listener = () => callback(); ipcRenderer.on('shortcut:new-tab', listener); return () => ipcRenderer.removeListener('shortcut:new-tab', listener) },
  onCloseTab: (callback: () => void) => { const listener = () => callback(); ipcRenderer.on('shortcut:close-tab', listener); return () => ipcRenderer.removeListener('shortcut:close-tab', listener) },
})
