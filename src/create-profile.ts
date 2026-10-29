import type { AppState, BrowserProfile } from './types'
import { stableFingerprint } from './profile-fingerprint'
import { pickNotionAvatar } from './notion-avatars'

/** Each creation is a fresh identity. Proxy selection is the only shared setting. */
export function newProfile(state: AppState, proxyId: string, name?: string, avatar?: string, alias?: string): { profile: BrowserProfile; state: AppState } {
  const proxy = state.proxies.find(p => p.id === proxyId)
  if (!proxy) throw new Error('代理节点不存在，请刷新后重试')
  const id = crypto.randomUUID()
  const number = Math.max(state.nextProfileNumber || 1, ...state.profiles.map(p => (p.number || 0) + 1))
  const colors = ['#ef665f','#e79b3f','#44a97b','#4c8fe6','#7a68e8','#cf659e']
  const sameProxyCount = state.profiles.filter(p => p.proxyId === proxyId).length
  const existingNames = new Set(state.profiles.map(p => p.name))
  let defaultName = proxy.name
  if (sameProxyCount > 0 || existingNames.has(defaultName)) {
    let suffix = Math.max(sameProxyCount + 1, 2)
    while (existingNames.has(`${proxy.name} · #${suffix}`)) suffix++
    defaultName = `${proxy.name} · #${suffix}`
  }
  const chosenAvatar = avatar || pickNotionAvatar(number - 1)
  const profile: BrowserProfile = { id, number, name: name?.trim() || defaultName, alias: alias?.trim() || undefined, color: colors[state.profiles.length % colors.length], avatar: chosenAvatar, proxyId, timezone: 'auto', locale: 'auto', fingerprint: stableFingerprint(id), webRTCPolicy: 'proxy-only', startUrl: 'about:blank', userAgentMode: 'real', groupId: state.groups[0]?.id || 'group-daily' }
  return { profile, state: { ...state, nextProfileNumber: number + 1, profiles: [...state.profiles, profile] } }
}
