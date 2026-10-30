import { newProfile } from './create-profile'
import { ProxyConnectionCheck } from './ProxyConnectionCheck'
import { timezones, timezoneLabel } from './timezones'
import { V2raySync } from './V2raySync'
import { UpdateCenter } from './UpdateCenter'
import { stableFingerprint } from './profile-fingerprint'
import { ProfileManager } from './ProfileManager'
import { FingerprintSettings } from './FingerprintSettings'
import { useEffect, useRef, useState } from 'react'
import { Check, Cloud, Dices, Globe2, Network, Pause, Pencil, Pin, PinOff, Play, Plus, RefreshCw, Settings2, Star, X } from 'lucide-react'
import type { AppState, BrowserProfile, ProfileGroup, ProxyNode, ProxyTestResult } from './types'
import orbitLogo from './assets/dlb-mascot.png'
import { NOTION_AVATARS, nextNotionAvatar, pickNotionAvatar, resolveProfileAvatar } from './notion-avatars'

const colors = ['#ef665f', '#e79b3f', '#44a97b', '#4c8fe6', '#7a68e8', '#cf659e']
const fallback: AppState = { presentationMode: 'windows', profiles: [], proxies: [{ id: 'system', name: '跟随本机系统代理', kind: 'system' }, { id: 'direct', name: '本机直连（不走代理）', kind: 'direct' }], groups: [{ id: 'group-daily', name: '日常在用', color: '#ef665f' }, { id: 'group-temporary', name: '临时使用', color: '#7a68e8' }], defaultProxyId: 'system' }

function App() {
  const [state, setState] = useState<AppState>(fallback)
  const [runtimeIds, setRuntimeIds] = useState<string[]>([])
  const [changingMode, setChangingMode] = useState(false)
  const [v2raySyncOpen, setV2raySyncOpen] = useState(false)
  const [updateCenterOpen, setUpdateCenterOpen] = useState(false)
  const [openIds, setOpenIds] = useState<string[]>([])
  const [pausedIds, setPausedIds] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [editing, setEditing] = useState<BrowserProfile | null>(null)
  const [renaming, setRenaming] = useState<BrowserProfile | null>(null)
  const [proxyPanel, setProxyPanel] = useState(false)
  const [proxyModal, setProxyModal] = useState(false)
  const [newProfileModal, setNewProfileModal] = useState(false)
  const [cookieProfile, setCookieProfile] = useState<BrowserProfile | null>(null)
  const [importProfilesOpen, setImportProfilesOpen] = useState(false)
  const [profilePicker, setProfilePicker] = useState(false)
  const [context, setContext] = useState<{ id: string; x: number; y: number } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const stateRef = useRef(state)
  const activeRef = useRef(activeId)
  const pausedRef = useRef(pausedIds)
  const openIdsRef = useRef(openIds)
  stateRef.current = state
  activeRef.current = activeId
  pausedRef.current = pausedIds
  openIdsRef.current = openIds

  useEffect(() => {
    const api = window.profileBrowser
    if (!api) return
    const off = api.onProfileRuntime(ids => { setRuntimeIds(ids) })
    void api.getRunningProfiles().then(setRuntimeIds)
    return off
  }, [])
  async function changeMode(mode: 'tabs' | 'windows') {
    setChangingMode(true)
    try {
      await window.profileBrowser?.setPresentationMode(mode)
      updateState({ ...stateRef.current, presentationMode: mode })
      setToast('独立窗口工作空间已就绪')
    } catch (error) { setToast(error instanceof Error ? error.message : '模式切换失败') }
    finally { setChangingMode(false) }
  }
  async function stopWindowProfile(id: string) {
    await window.profileBrowser?.closeProfile(id)
    setOpenIds(ids => ids.filter(item => item !== id))
    setPausedIds(ids => ids.includes(id) ? ids : [...ids, id])
    if (activeRef.current === id) { activeRef.current = null; setActiveId(null) }
  }
  useEffect(() => { void window.profileBrowser?.loadState().then((next) => {
    let migrated = false
    const profiles = (next.profiles || []).map((p, idx) => {
      const resolved = resolveProfileAvatar(p.avatar, (p.number || idx + 1) - 1)
      if (resolved !== p.avatar) {
        migrated = true
        return { ...p, avatar: resolved }
      }
      return p
    })
    next = { ...next, presentationMode: 'windows', profiles }
    stateRef.current = next
    setState(next)
    if (migrated) void window.profileBrowser?.saveState(next)
    const pinnedIds = next.profiles.filter((profile) => profile.pinned).map((profile) => profile.id)
    setOpenIds(pinnedIds)
    setPausedIds(next.preloadOnStart === false ? pinnedIds : [])
  }) }, [])
  useEffect(() => {
    const api = window.profileBrowser
    if (!api) return
    const offNew = api.onNewTab(() => setNewProfileModal(true))
    const offNote = api.onAccountNote((profileId, note) => {
      const current = stateRef.current
      if (current.profiles.find((p) => p.id === profileId)?.accountNote === note) return
      updateState({ ...current, profiles: current.profiles.map((p) => p.id === profileId ? { ...p, accountNote: note } : p) })
    })
    const offClose = api.onCloseTab(() => {
      const id = activeRef.current
      if (!id) return
      const profile = stateRef.current.profiles.find((item) => item.id === id)
      if (profile?.pinned) void pauseProfile(id)
      else void closeTab(id)
    })
    return () => { offNote(); offNew(); offClose() }
  }, [])
  useEffect(() => { const close = () => { setContext(null); setProfilePicker(false) }; window.addEventListener('click', close); return () => window.removeEventListener('click', close) }, [])

  const active = state.profiles.find((profile) => profile.id === activeId)
  function residentFull(sourceId: string) {
    const current = stateRef.current
    const source = current.profiles.find((profile) => profile.id === sourceId)
    const count = current.profiles.filter((profile) => profile.pinned).length
    if (source?.pinned || count < (current.keepAlive ?? 5)) return false
    setToast(`常驻已满（${current.keepAlive ?? 5} 个）：先拖出一个，或在常驻标题右边调大数量`)
    return true
  }
  function updateState(next: AppState) { stateRef.current = next; setState(next); void window.profileBrowser?.saveState(next) }

  async function openProfile(profile: BrowserProfile) {
    const proxy = stateRef.current.proxies.find((item) => item.id === profile.proxyId)
    const lastOpened = Date.parse(stateRef.current.profiles.find((item) => item.id === profile.id)?.lastOpenedAt ?? '') || 0
    if (Date.now() - lastOpened > 60_000) updateState({ ...stateRef.current, profiles: stateRef.current.profiles.map((item) => item.id === profile.id ? { ...item, lastOpenedAt: new Date().toISOString() } : item) })
    setOpenIds((ids) => ids.includes(profile.id) ? ids : [...ids, profile.id])
    activeRef.current = profile.id; setActiveId(profile.id)
    const result = await window.profileBrowser?.openProfile(profile, proxy)
    if (result?.ok) { setPausedIds((ids) => ids.filter((id) => id !== profile.id)) }
    else {
      setToast(result?.error ?? '无法打开标签')
      if (profile.pinned) await pauseProfile(profile.id)
      else await closeTab(profile.id)
    }
  }
  async function createAndOpenTab(name: string, proxyId: string, avatar?: string, alias?: string) {
    const created = newProfile(stateRef.current, proxyId, name, avatar, alias)
    const profile = created.profile
    updateState(created.state)
    setNewProfileModal(false)
    await openProfile(profile)
  }
  async function createFromProxy(proxy: ProxyNode) {
    const created = newProfile(stateRef.current, proxy.id)
    await window.profileBrowser!.saveState(created.state)
    stateRef.current = created.state; setState(created.state)
    setToast(`已创建 #${created.profile.number} ${created.profile.name}，绑定 ${proxy.name}；未自动启动`)
  }
  async function closeTab(id: string) {
    await window.profileBrowser?.closeProfile(id)
    setOpenIds((ids) => {
      const index = ids.indexOf(id); const next = ids.filter((item) => item !== id)
      if (activeRef.current === id) {
        const nextId = next[Math.max(0, index - 1)] ?? null
        activeRef.current = nextId; setActiveId(nextId)
      }
      return next
    })
  }
  async function pauseProfile(id: string) {
    await window.profileBrowser?.closeProfile(id)
    setPausedIds((ids) => ids.includes(id) ? ids : [...ids, id])
    if (activeRef.current === id) {
      activeRef.current = null
      setActiveId(null)
    }
    setToast('Profile 已暂停，Cookie 和登录状态仍会保留')
  }
  async function saveProfile(profile: BrowserProfile) {
    const previous = stateRef.current.profiles.find((item) => item.id === profile.id)
    updateState({ ...stateRef.current, profiles: stateRef.current.profiles.map((item) => item.id === profile.id ? profile : item) })
    setEditing(null)
    const environmentChanged = previous && (previous.proxyId !== profile.proxyId || previous.timezone !== profile.timezone || previous.userAgent !== profile.userAgent || previous.userAgentMode !== profile.userAgentMode || previous.locale !== profile.locale || previous.webRTCPolicy !== profile.webRTCPolicy || previous.hardwareConcurrency !== profile.hardwareConcurrency || JSON.stringify(previous.resolution) !== JSON.stringify(profile.resolution) || JSON.stringify(previous.fingerprint) !== JSON.stringify(profile.fingerprint))
    if (environmentChanged && runtimeIds.includes(profile.id)) {
      const proxy = stateRef.current.proxies.find((item) => item.id === profile.proxyId)
      await window.profileBrowser?.closeProfile(profile.id)
      const result = await window.profileBrowser?.openProfile(profile, proxy)
      setToast(result?.ok ? '标签设置已保存并重新载入' : (result?.error ?? '新环境载入失败'))
      return
    }
    setToast('标签设置已保存')
  }
  function renameProfile(name: string) {
    if (!renaming || !name.trim()) return
    updateState({ ...stateRef.current, profiles: stateRef.current.profiles.map((profile) => profile.id === renaming.id ? { ...profile, name: name.trim() } : profile) })
    setRenaming(null)
    setToast('标签已重命名')
  }
  function togglePin(id: string) {
    const current = stateRef.current.profiles.find((profile) => profile.id === id)
    if (!current) return
    if (!current.pinned && residentFull(id)) return
    const willPin = !current.pinned
    updateState({ ...stateRef.current, profiles: stateRef.current.profiles.map((profile) => profile.id === id ? { ...profile, pinned: willPin } : profile) })
    if (willPin) setOpenIds((ids) => ids.includes(id) ? ids : [...ids, id])
    else if (pausedRef.current.includes(id)) {
      setOpenIds((ids) => ids.filter((item) => item !== id))
      setPausedIds((ids) => ids.filter((item) => item !== id))
    }
    setToast(current.pinned ? '已移到临时，不再常驻' : '已设为常驻，会一直在后台保持加载')
  }
  async function selectProxyForActive(proxy: ProxyNode) {
    if (!active) { setToast('请先打开一个 Profile'); return }
    if (active.proxyId === proxy.id) { setToast(`当前已经在使用 ${proxy.name}`); return }
    const updated = { ...active, proxyId: proxy.id }
    updateState({ ...stateRef.current, profiles: stateRef.current.profiles.map((profile) => profile.id === active.id ? updated : profile) })
    await window.profileBrowser?.closeProfile(active.id)
    const result = await window.profileBrowser?.openProfile(updated, proxy)
    if (!result?.ok) { setToast(result?.error ?? '代理切换失败'); return }
    setToast(`已切换到 ${proxy.name}`)
  }

  return <div className="orbit-window prism-management">
    <><div className="management-titlebar"><span>Prism 指纹浏览器</span><span>独立窗口工作空间</span></div><aside className="management-sidebar"><div className="prism-brand"><img src={orbitLogo} alt="Prism Logo"/><div><strong>Prism</strong><small>指纹浏览器 · Preview</small></div></div><button className="primary sidebar-create" onClick={() => setNewProfileModal(true)}><Plus size={19}/>新建浏览器环境</button><div className="navigation-caption">工作空间</div><nav><button className="active"><Globe2/>浏览器环境<span>{state.profiles.length}</span></button><button onClick={() => setProxyPanel(true)}><Network/>代理管理</button><button onClick={() => setV2raySyncOpen(true)}><Star/>v2rayN 收藏同步</button></nav><div className="navigation-caption">应用</div><nav><button onClick={() => setUpdateCenterOpen(true)}><RefreshCw/>更新中心</button></nav><div className="sidebar-bottom"><span><i className="live-dot"/>{runtimeIds.length} 个环境运行中</span><small>Fingerprint Chromium 148 内核</small><div>Prism Preview <span>本地工作空间</span></div></div></aside></>

    {<ProfileManager onOrganize={updateState} state={state} running={runtimeIds} onOpen={openProfile} onStop={stopWindowProfile} onEdit={setEditing} onUpdateAlias={(id, alias) => {
      const current = stateRef.current
      updateState({ ...current, profiles: current.profiles.map(p => p.id === id ? { ...p, alias: alias || undefined } : p) })
      setToast(alias ? `标签：${alias}` : '已清空标签')
    }} onNew={() => setNewProfileModal(true)} onProxies={() => setProxyPanel(true)} onProtect={(ids) => { const current = stateRef.current; updateState({ ...current, profiles: current.profiles.map(p => ids.includes(p.id) ? { ...p, fingerprint: { ...p.fingerprint, ...stableFingerprint(p.fingerprint?.seed || p.id) }, webRTCPolicy: 'proxy-only' } : p) }); setToast('已保存稳定保护；运行中的 Profile 停止后再启动生效，种子保持不变') }} onModeChange={changeMode} modeBusy={changingMode} onDelete={async (ids) => {
      const res = await window.profileBrowser?.deleteProfiles(ids)
      if (res?.ok && res.state) {
        stateRef.current = res.state
        setState(res.state)
        setOpenIds(cur => cur.filter(id => !ids.includes(id)))
        setPausedIds(cur => cur.filter(id => !ids.includes(id)))
        setToast(`已彻底删除 ${ids.length} 个浏览器环境及其本地缓存`)
      } else {
        setToast(res?.error || '删除失败')
      }
    }} onCookieModal={setCookieProfile} onExportProfiles={(ids) => {
      const list = ids.length ? stateRef.current.profiles.filter(p => ids.includes(p.id)) : stateRef.current.profiles
      const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), profiles: list, proxies: stateRef.current.proxies }, null, 2)
      const blob = new Blob([payload], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `prism-profiles-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setToast(`已导出 ${list.length} 个环境配置`)
    }} onImportProfiles={() => setImportProfilesOpen(true)} />}
    {cookieProfile && <CookieManagerDialog profile={cookieProfile} onClose={() => setCookieProfile(null)} onToast={setToast} />}
    {importProfilesOpen && <ProfileImportDialog state={state} onClose={() => setImportProfilesOpen(false)} onImported={(nextState, count) => { updateState(nextState); setImportProfilesOpen(false); setToast(`已成功导入 ${count} 个浏览器环境`) }} />}
    {context && <TabContextMenu profile={state.profiles.find((p) => p.id === context.id)!} paused={pausedIds.includes(context.id)} x={context.x} y={context.y} proxy={state.proxies.find((p) => p.id === state.profiles.find((item) => item.id === context.id)?.proxyId)} onRename={() => { setRenaming(state.profiles.find((p) => p.id === context.id)!); setContext(null) }} onEdit={() => { setEditing(state.profiles.find((p) => p.id === context.id)!); setContext(null) }} onTogglePin={() => { togglePin(context.id); setContext(null) }} onPause={() => { void pauseProfile(context.id); setContext(null) }} onResume={() => { const profile = state.profiles.find((p) => p.id === context.id); if (profile) void openProfile(profile); setContext(null) }} onClose={() => { void closeTab(context.id); setContext(null) }} />}
    {profilePicker && <div className="profile-picker"><header><strong>所有 Profile</strong><span>{state.profiles.length} 个独立环境</span></header><div className="profile-picker-list">{state.profiles.map(profile => <button key={profile.id} onClick={() => { setProfilePicker(false); void openProfile(profile) }}><Avatar profile={profile}/><span><strong>{profile.name}</strong><small>{timezoneLabel(profile.timezone)}</small></span></button>)}</div></div>}
    {editing && <ProfileEditor profile={editing} proxies={state.proxies} groups={state.groups} onClose={() => setEditing(null)} onSave={saveProfile} />}
    {renaming && <RenameProfileDialog profile={renaming} onClose={() => setRenaming(null)} onSave={renameProfile} />}
    {newProfileModal && <NewProfileDialog proxies={state.proxies} defaultProxyId={state.defaultProxyId} onClose={() => setNewProfileModal(false)} onCreate={(name, proxyId, avatar, alias) => void createAndOpenTab(name, proxyId, avatar, alias)} />}
    {v2raySyncOpen && <V2raySync state={state} onSaved={updateState} onClose={() => setV2raySyncOpen(false)} />}
    {updateCenterOpen && <UpdateCenter onClose={() => setUpdateCenterOpen(false)} />}
    {proxyPanel && <ProxyManager onCreate={createFromProxy} state={state} activeProfile={active} updateState={updateState} onSelect={(proxy) => void selectProxyForActive(proxy)} onClose={() => setProxyPanel(false)} openModal={() => setProxyModal(true)} />}
    {proxyModal && <ProxyImporter onClose={() => setProxyModal(false)} onImported={(nodes) => { updateState({ ...stateRef.current, proxies: [...stateRef.current.proxies, ...nodes] }); setProxyModal(false); setToast(`已导入 ${nodes.length} 个代理`) }} />}
    {toast && <div className="toast" onAnimationEnd={() => setToast(null)}>{toast}</div>}
  </div>
}

function Avatar({ profile }: { profile: BrowserProfile }) {
  const image = resolveProfileAvatar(profile.avatar, (profile.number || 1) - 1)
  return <span className="avatar notion-avatar"><img src={image} alt="" /></span>
}

function TabContextMenu({ profile, proxy, paused, x, y, onRename, onEdit, onTogglePin, onPause, onResume, onClose }: { profile: BrowserProfile; proxy?: ProxyNode; paused: boolean; x: number; y: number; onRename: () => void; onEdit: () => void; onTogglePin: () => void; onPause: () => void; onResume: () => void; onClose: () => void }) {
  return <div className="context-menu" style={{ left: Math.max(8, Math.min(x, 36)), top: Math.max(8, Math.min(y, window.innerHeight - 290)) }} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}><div className="context-profile"><Avatar profile={profile} /><span><strong>{profile.name}</strong><small>{profile.pinned ? `常驻${paused ? ' · 已暂停' : ' · 运行中'} · ` : ''}{proxy?.name ?? '本机直连'} · {timezones.find((z) => z.value === profile.timezone)?.label ?? profile.timezone}</small></span></div>{profile.pinned && <button onClick={paused ? onResume : onPause}>{paused ? <Play /> : <Pause />}{paused ? '恢复运行' : '暂停运行'}{!paused && <kbd>⌘W</kbd>}</button>}<button onClick={onTogglePin}>{profile.pinned ? <PinOff /> : <Pin />}{profile.pinned ? '移出常驻' : '设为常驻'}</button><button onClick={onRename}><Pencil />重命名…</button><button onClick={onEdit}><Settings2 />Profile 设置…</button>{!profile.pinned && <><div className="menu-separator" /><button onClick={onClose}><X />关闭临时标签 <kbd>⌘W</kbd></button></>}</div>
}

function RenameProfileDialog({ profile, onClose, onSave }: { profile: BrowserProfile; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(profile.name)
  return <div className="modal-backdrop higher"><form className="sheet rename-sheet" onSubmit={(event) => { event.preventDefault(); if (name.trim()) onSave(name) }}><header><div><h2>重命名标签</h2><p>只修改显示名称，不影响登录状态</p></div><button type="button" className="icon-button" onClick={onClose}><X /></button></header><div className="sheet-body"><label className="field"><span>名称</span><input autoFocus value={name} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setName(event.target.value)} /></label></div><footer><button type="button" className="secondary" onClick={onClose}>取消</button><button type="submit" className="primary" disabled={!name.trim()}>保存</button></footer></form></div>
}

function NewProfileDialog({ proxies, defaultProxyId, onClose, onCreate }: { proxies: ProxyNode[]; defaultProxyId?: string; onClose: () => void; onCreate: (name: string, proxyId: string, avatar: string, alias?: string) => void }) {
  const [name, setName] = useState('')
  const [alias, setAlias] = useState('')
  const [avatar, setAvatar] = useState(() => pickNotionAvatar())
  const [proxyId, setProxyId] = useState(() => proxies.some((proxy) => proxy.id === defaultProxyId) ? defaultProxyId! : (proxies.find((proxy) => proxy.id === 'system')?.id ?? proxies[0]?.id ?? ''))
  const selectedProxy = proxies.find((proxy) => proxy.id === proxyId)
  return <div className="modal-backdrop higher"><form className="sheet new-profile-sheet" onSubmit={(event) => { event.preventDefault(); if (proxyId) onCreate(name.trim() || selectedProxy?.name || '新环境', proxyId, avatar, alias.trim() || undefined) }}><header><div><h2>新建 Profile</h2><p>创建全新的 Cookie、收藏栏与独立指纹空间</p></div><button type="button" className="icon-button" onClick={onClose}><X /></button></header><div className="sheet-body"><div className="identity-row"><span className="avatar notion-avatar"><img src={avatar} alt="" /></span><label className="field grow"><span>名称（留空则默认与代理同名）</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={selectedProxy?.name || '例如：东京工作环境'} /></label><button type="button" className="image-button" onClick={() => setAvatar(nextNotionAvatar(avatar))}><Dices size={14} />换一个</button></div><label className="field"><span>别名 / 用途备注（可选，会醒目显示在列表与浏览器工具栏）</span><input value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="例如：X主号 / TikTok美区 / PayPal收款" /></label><label className="field"><span>网络</span><select value={proxyId} onChange={(event) => setProxyId(event.target.value)}>{proxies.map((proxy) => <option key={proxy.id} value={proxy.id}>{proxy.name}{proxy.id === defaultProxyId ? ' · 默认' : ''}{proxy.kind === 'direct' ? ' · 直连' : proxy.kind === 'system' ? ' · 本机系统代理' : ` · ${proxy.kind.toUpperCase()}`}</option>)}</select></label><ProxyConnectionCheck proxy={selectedProxy}/><label className="field"><span>时区 / Timezone</span><input readOnly value={timezoneLabel("auto")} /></label>{selectedProxy && <div className="new-profile-summary"><Network /><span><strong>{selectedProxy.name}</strong><small>{selectedProxy.kind === 'direct' ? '不使用代理，直接连接网络' : selectedProxy.kind === 'system' ? '自动跟随 macOS 系统代理（如 v2rayN 本地端口）' : `默认预选 · ${selectedProxy.kind.toUpperCase()} · ${selectedProxy.host}:${selectedProxy.port}`}</small></span></div>}</div><footer><button type="button" className="secondary" onClick={onClose}>取消</button><button type="submit" className="primary" disabled={!proxyId}>创建并打开</button></footer></form></div>
}

function ProfileEditor({ profile: initial, proxies, groups, onClose, onSave }: { profile: BrowserProfile; proxies: ProxyNode[]; groups: ProfileGroup[]; onClose: () => void; onSave: (profile: BrowserProfile) => void }) {
  const [profile, setProfile] = useState(() => ({ ...initial, avatar: resolveProfileAvatar(initial.avatar, (initial.number || 1) - 1) }))
  const patch = (value: Partial<BrowserProfile>) => setProfile((current) => ({ ...current, ...value }))
  return <div className="modal-backdrop"><section className="sheet editor-sheet environment-editor"><header><div><h2>Session 环境设置</h2><p>登录态独立保存，环境修改后自动重新载入</p></div><button className="icon-button" onClick={onClose}><X /></button></header><div className="sheet-body"><div className="environment-fields">
    <div className="identity-row"><Avatar profile={profile} /><label className="field grow"><span>名称</span><input autoFocus value={profile.name} onChange={(e) => patch({ name: e.target.value })} /></label><button type="button" className="image-button" onClick={() => patch({ avatar: nextNotionAvatar(profile.avatar) })}><Dices size={14} />换一个</button></div>
    <label className="field"><span>别名 / 用途备注（显示在列表及浏览器顶部红色标识栏）</span><input value={profile.alias ?? ''} onChange={(e) => patch({ alias: e.target.value })} placeholder="例如：X主号 / TikTok美区 / 养号专用" /></label>
    <label className="field"><span>Chiikawa 角色头像（吉伊卡哇系列）</span><div className="notion-avatar-picks">{NOTION_AVATARS.map((item) => <button type="button" key={item.id} title={item.label} className={profile.avatar === item.svg ? 'picked' : ''} onClick={() => patch({ avatar: item.svg })}><img src={item.svg} alt={item.label} /></button>)}</div></label>
    <div className="two-fields"><label className="field"><span>代理</span><select value={profile.proxyId} onChange={(e) => patch({ proxyId: e.target.value })}>{proxies.map((proxy) => <option key={proxy.id} value={proxy.id}>{proxy.name}</option>)}</select></label><label className="field"><span>时区</span><select value={profile.timezone} onChange={(e) => patch({ timezone: e.target.value })}>{timezones.map((zone) => <option key={zone.value} value={zone.value}>{zone.label}</option>)}</select></label></div>
    <ProxyConnectionCheck proxy={proxies.find(p => p.id === profile.proxyId)} />
    <div className="two-fields"><label className="field"><span>分组</span><select value={profile.groupId} onChange={(e) => patch({ groupId: e.target.value })}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label className="field"><span>打开网址</span><input value={profile.startUrl} onChange={(e) => patch({ startUrl: e.target.value })} /></label></div>
    <h3 className="environment-heading">浏览器指纹</h3>
    <div className="two-fields"><label className="field"><span>User-Agent</span><select value={profile.userAgentMode} onChange={(e) => patch({ userAgentMode: e.target.value as 'real' | 'custom' })}><option value="real">Chrome 148 标准内核（推荐·防异常）</option><option value="custom">自定义</option></select></label><label className="field"><span>WebRTC</span><select value={profile.webRTCPolicy ?? 'real'} onChange={(e) => patch({ webRTCPolicy: e.target.value as 'real' | 'proxy-only' })}><option value="real">真实</option><option value="proxy-only">禁止非代理 UDP（防泄露）</option></select></label></div>
    {profile.userAgentMode === 'custom' && <label className="field"><span>自定义 User-Agent</span><textarea value={profile.userAgent ?? ''} onChange={(e) => patch({ userAgent: e.target.value })} /></label>}
    <div className="two-fields"><label className="field"><span>语言 / Accept-Language</span><select value={profile.locale ?? ''} onChange={(e) => patch({ locale: e.target.value || undefined })}><option value="">跟随系统</option><option value="auto">跟随代理 IP（地区默认语言）</option>{['en-US', 'en-GB', 'ja-JP', 'zh-CN', 'zh-TW', 'ko-KR', 'de-DE'].map((locale) => <option key={locale}>{locale}</option>)}</select></label><label className="field"><span>硬件并发数 (CPU 核数)</span><select value={profile.hardwareConcurrency ?? ''} onChange={(e) => patch({ hardwareConcurrency: e.target.value ? Number(e.target.value) : undefined })}><option value="">按种子自动伪装（8 / 10 / 12 / 14 / 16 核）</option>{[4, 8, 10, 12, 14, 16, 24].map((value) => <option key={value}>{value}</option>)}</select></label></div>
    <label className="field"><span>屏幕 / 页面分辨率</span><select value={profile.resolution ? `${profile.resolution.width}x${profile.resolution.height}` : ''} onChange={(e) => { const [width, height] = e.target.value.split('x').map(Number); patch({ resolution: width ? { width, height } : undefined }) }}><option value="">自适应窗口（C++ 种子独立微调）</option>{['1280x800', '1366x768', '1440x900', '1920x1080', '2560x1440'].map((value) => <option key={value}>{value}</option>)}</select></label>
    <FingerprintSettings profile={profile} patch={patch} />

    <label className="field"><span>备注</span><textarea value={profile.notes ?? ''} onChange={(e) => patch({ notes: e.target.value })} placeholder="可选" /></label><div className="reserved"><Cloud /><span><strong>Google Profile</strong><small>已预留，暂未启用</small></span></div>
  </div>    <aside className="environment-summary"><h3>当前环境摘要</h3><dl><dt>Session</dt><dd>{profile.name}</dd><dt>代理</dt><dd>{proxies.find((proxy) => proxy.id === profile.proxyId)?.name ?? '代理不存在'}</dd><dt>时区</dt><dd>{timezoneLabel(profile.timezone)}</dd><dt>语言</dt><dd>{profile.locale || '跟随系统'}</dd><dt>分辨率</dt><dd>{profile.resolution ? `${profile.resolution.width} × ${profile.resolution.height}` : 'C++ 种子独立微调'}</dd><dt>硬件并发</dt><dd>{profile.hardwareConcurrency ? `${profile.hardwareConcurrency} 核` : '按种子自动伪装 (8-16核)'}</dd><dt>WebRTC</dt><dd>{profile.webRTCPolicy === 'proxy-only' ? '禁止非代理 UDP' : '真实'}</dd><dt>Canvas</dt><dd>{profile.fingerprint?.canvas === 'noise' ? 'C++ 稳定噪声' : '真实'}</dd><dt>WebGL</dt><dd>{profile.fingerprint?.webGL === 'noise' ? 'C++ 稳定噪声 (M1-M4)' : '真实'}</dd><dt>音频</dt><dd>{profile.fingerprint?.audio === 'noise' ? 'C++ 稳定噪声' : '真实'}</dd><dt>内存</dt><dd>{profile.fingerprint?.deviceMemory ? `${profile.fingerprint.deviceMemory} GB` : '按种子自动伪装'}</dd><dt>定位</dt><dd>{profile.fingerprint?.geolocation ? '自定义坐标' : '跟随代理/默认'}</dd><dt>TLS</dt><dd>Chrome 148 原生 BoringSSL</dd><dt>存储</dt><dd>独立持久化 Session</dd></dl></aside></div><footer><button className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={!profile.name.trim() || (profile.userAgentMode === 'custom' && !profile.userAgent?.trim())} onClick={() => onSave(profile)}>保存</button></footer></section></div>
}

function ProxyManager({ onCreate, state, activeProfile, updateState, onSelect, onClose, openModal }: { onCreate: (proxy: ProxyNode) => Promise<void>; state: AppState; activeProfile?: BrowserProfile; updateState: (state: AppState) => void; onSelect: (proxy: ProxyNode) => void; onClose: () => void; openModal: () => void }) {
  const [creating, setCreating] = useState<string | null>(null)
  const [createError, setCreateError] = useState('')
  async function create(proxy: ProxyNode) { setCreating(proxy.id); setCreateError(''); try { await onCreate(proxy) } catch(e) { setCreateError(e instanceof Error ? e.message : '创建失败，请重试') } finally { setCreating(null) } }
  const [tests, setTests] = useState<Record<string, ProxyTestResult | 'testing'>>({})
  async function test(proxy: ProxyNode) { setTests((value) => ({ ...value, [proxy.id]: 'testing' })); const result = await window.profileBrowser!.testProxy(proxy); setTests((value) => ({ ...value, [proxy.id]: result })) }
  return <div className="modal-backdrop"><section className="sheet proxy-sheet"><header><div><h2>选择代理服务器</h2><p>{activeProfile ? `当前 Profile：${activeProfile.name} · 点击一行立即切换` : '星标代理会成为新建 Profile 的默认网络'}</p></div><div className="header-actions"><button className="primary compact" onClick={openModal}><Plus />导入代理</button><button className="icon-button" onClick={onClose}><X /></button></div></header>{createError && <p className="error" role="alert">{createError}</p>}<div className="proxy-list">{state.proxies.map((proxy) => { const result = tests[proxy.id]; const selected = activeProfile?.proxyId === proxy.id; const isDefault = (state.defaultProxyId ?? 'system') === proxy.id; const usedByProfiles = state.profiles.filter((profile) => profile.proxyId === proxy.id).length; return <div className={`proxy-row ${selected ? 'selected' : ''} ${activeProfile ? 'selectable' : ''}`} role="button" tabIndex={activeProfile ? 0 : -1} aria-selected={selected} key={proxy.id} onClick={() => activeProfile && onSelect(proxy)} onKeyDown={(event) => { if (activeProfile && (event.key === 'Enter' || event.key === ' ')) onSelect(proxy) }}><span className={`proxy-symbol ${proxy.kind}`}><Network /></span><span className="proxy-detail"><strong>{proxy.favorite && "★ "}{proxy.name}{selected && <em>当前使用</em>}{isDefault && <em>新建默认</em>}</strong><small>{proxy.kind === 'direct' ? '本机网络，不使用代理' : proxy.kind === 'system' ? '自动跟随 macOS 系统代理（如 v2rayN 本地端口）' : `${proxy.kind.toUpperCase()} · ${proxy.host}:${proxy.port}${proxy.kind === 'vless' ? ` · ${proxy.transport || 'tcp'} / ${proxy.security || 'none'}` : ''}`}</small></span><span className={`test-result ${result !== 'testing' && result?.ok ? 'ok' : result !== 'testing' && result ? 'bad' : ''}`}>{result === 'testing' ? <><RefreshCw className="spin" />测试中</> : result ? result.ok ? <><Check />{result.ip} · {result.latency} ms{result.location && <small>{result.location.country} {result.location.city} · {result.location.timezone} · {result.location.locale}</small>}{result.locationWarning && <small>{result.locationWarning}</small>}</> : <><X />{result.error}</> : '尚未测试'}</span><button className="test-button" disabled={result === 'testing'} onClick={(event) => { event.stopPropagation(); void test(proxy) }}>测试</button><button type="button" className="secondary proxy-create" disabled={!!creating} onClick={(event) => { event.stopPropagation(); void create(proxy) }}>{creating === proxy.id ? '创建中…' : '＋ 创建 Profile'}</button><span className="proxy-actions"><button className={`icon-button default-proxy ${isDefault ? 'active' : ''}`} title={isDefault ? '当前是新建默认代理' : '设为新建默认代理'} onClick={(event) => { event.stopPropagation(); updateState({ ...state, defaultProxyId: proxy.id }) }}><Star /></button><button className="icon-button" title={usedByProfiles ? `仍有 ${usedByProfiles} 个 Profile 使用此代理` : '删除代理'} disabled={proxy.id === 'direct' || proxy.id === 'system' || usedByProfiles > 0} onClick={(event) => { event.stopPropagation(); updateState({ ...state, defaultProxyId: state.defaultProxyId === proxy.id ? 'system' : state.defaultProxyId, proxies: state.proxies.filter((item) => item.id !== proxy.id) }) }}><X /></button></span></div> })}</div></section></div>
}

function ProxyImporter({ onClose, onImported }: { onClose: () => void; onImported: (nodes: ProxyNode[]) => void }) {
  const [kind, setKind] = useState<'vless' | 'socks5'>('vless'); const [links, setLinks] = useState(''); const [host, setHost] = useState(''); const [port, setPort] = useState(''); const [error, setError] = useState('')
  async function importLinks() {
    setError('')
    if (kind === 'vless') {
      const values = links.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      const results = await Promise.all(values.map((value) => window.profileBrowser!.parseVless(value)))
      const failed = results.find((item) => !item.ok)
      if (failed) { setError(failed.error ?? '链接解析失败'); return }
      onImported(results.flatMap((item) => item.node ? [item.node] : []))
      return
    }
    let proxyHost = host.trim(); let proxyPort = port.trim()
    if (/@/.test(proxyHost)) { setError('当前版本仅支持无认证 SOCKS5，请填写 IP 和端口'); return }
    const pasted = proxyHost.match(/^(?:socks5:\/\/)?([^:]+):(\d+)$/)
    if (pasted && !proxyPort) { proxyHost = pasted[1]; proxyPort = pasted[2] }
    const portNumber = Number(proxyPort)
    if (!proxyHost || !Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) { setError('请填写正确的 IP 和端口'); return }
    onImported([{ id: crypto.randomUUID(), name: `${proxyHost}:${portNumber}`, kind: 'socks5', host: proxyHost, port: portNumber }])
  }
  return <div className="modal-backdrop higher"><section className="sheet import-sheet"><header><div><h2>导入代理</h2><p>支持 VLESS 分享链接和无认证 SOCKS5</p></div><button className="icon-button" onClick={onClose}><X /></button></header><div className="sheet-body"><div className="segmented"><button className={kind === 'vless' ? 'active' : ''} onClick={() => setKind('vless')}>VLESS</button><button className={kind === 'socks5' ? 'active' : ''} onClick={() => setKind('socks5')}>SOCKS5</button></div>{kind === 'vless' ? <label className="field"><span>每行一个链接</span><textarea autoFocus value={links} onChange={(e) => setLinks(e.target.value)} placeholder="vless://UUID@server:443?...#纽约节点" /></label> : <><div className="socks-simple"><label className="field"><span>IP 或域名</span><input autoFocus value={host} onChange={(event) => setHost(event.target.value)} placeholder="例如 127.0.0.1" /></label><label className="field port-field"><span>端口</span><input inputMode="numeric" value={port} onChange={(event) => setPort(event.target.value.replace(/\D/g, ''))} placeholder="1080" /></label></div><p className="field-hint">也可以把 <code>IP:端口</code> 或 <code>socks5://IP:端口</code> 直接粘贴到第一个框。</p></>}{error && <p className="error">{error}</p>}</div><footer><button className="secondary" onClick={onClose}>取消</button><button className="primary" onClick={() => void importLinks()}>导入</button></footer></section></div>
}

function CookieManagerDialog({ profile, onClose, onToast }: { profile: BrowserProfile; onClose: () => void; onToast: (msg: string) => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function loadCurrent() {
    setBusy(true); setError('')
    try {
      const res = await window.profileBrowser?.exportCookies(profile.id)
      if (!res?.ok) { setError(res?.error || '读取 Cookie 失败'); return }
      const json = JSON.stringify(res.cookies ?? [], null, 2)
      setText(json)
      onToast(`已读取 ${res.cookies?.length ?? 0} 条 Cookie`)
    } finally { setBusy(false) }
  }
  async function copyExport() {
    setBusy(true); setError('')
    try {
      const res = await window.profileBrowser?.exportCookies(profile.id)
      if (!res?.ok) { setError(res?.error || '导出失败'); return }
      const json = JSON.stringify(res.cookies ?? [], null, 2)
      setText(json)
      await navigator.clipboard.writeText(json).catch(() => undefined)
      onToast(`已导出并复制 ${res.cookies?.length ?? 0} 条 Cookie 到剪贴板`)
    } finally { setBusy(false) }
  }
  async function applyImport() {
    setError('')
    let parsed: any
    try { parsed = JSON.parse(text.trim()) } catch { setError('JSON 格式有误，请粘贴合法的 Cookie JSON 数组'); return }
    const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.cookies) ? parsed.cookies : null
    if (!arr) { setError('JSON 顶层需为 Cookie 数组 [...]'); return }
    setBusy(true)
    try {
      const res = await window.profileBrowser?.importCookies(profile.id, arr)
      if (!res?.ok) { setError(res?.error || '导入失败'); return }
      onToast(`成功导入 ${res.count ?? arr.length} 条 Cookie 到 ${profile.name}`)
      onClose()
    } finally { setBusy(false) }
  }
  return <div className="modal-backdrop higher" onClick={onClose}>
    <section className="sheet import-sheet" style={{ width: 560 }} onClick={e => e.stopPropagation()}>
      <header>
        <div><h2>Cookie 导入 / 导出 · #{profile.number} {profile.name}</h2><p>支持标准 EditThisCookie / Cookie-Editor / JSON 数组格式（运行中或关闭状态均可直接读写）</p></div>
        <button className="icon-button" onClick={onClose}><X /></button>
      </header>
      <div className="sheet-body">
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button type="button" className="secondary" disabled={busy} onClick={() => void loadCurrent()}>读取当前 Cookie</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => void copyExport()}>导出并复制 JSON</button>
        </div>
        <label className="field">
          <span>Cookie JSON 内容</span>
          <textarea autoFocus style={{ minHeight: 200, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5 }} value={text} onChange={e => setText(e.target.value)} placeholder='[{"domain": ".example.com", "name": "session_id", "value": "xyz", "path": "/", "secure": true}]' />
        </label>
        {error && <p className="error">{error}</p>}
      </div>
      <footer>
        <button type="button" className="secondary" onClick={onClose}>取消</button>
        <button type="button" className="primary" disabled={busy || !text.trim()} onClick={() => void applyImport()}>{busy ? '处理中…' : '导入并写入环境'}</button>
      </footer>
    </section>
  </div>
}

function ProfileImportDialog({ state, onClose, onImported }: { state: AppState; onClose: () => void; onImported: (next: AppState, count: number) => void }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setText(String(reader.result || ''))
    reader.readAsText(file)
  }
  function submit() {
    setError('')
    let parsed: any
    try { parsed = JSON.parse(text.trim()) } catch { setError('JSON 解析失败，请检查格式'); return }
    const list: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.profiles) ? parsed.profiles : []
    if (!list.length) { setError('未找到可导入的 profiles 数组'); return }
    let nextNum = Math.max(state.nextProfileNumber || 1, ...state.profiles.map(p => (p.number || 0) + 1))
    const imported: BrowserProfile[] = list.map((item, idx) => {
      const id = crypto.randomUUID()
      const num = nextNum++
      return {
        id,
        number: num,
        name: String(item.name || `导入环境 #${num}`),
        alias: item.alias ? String(item.alias) : undefined,
        color: item.color || colors[(state.profiles.length + idx) % colors.length],
        avatar: resolveProfileAvatar(item.avatar, num - 1),
        proxyId: state.proxies.some(px => px.id === item.proxyId) ? item.proxyId : (state.defaultProxyId || 'system'),
        timezone: item.timezone || 'auto',
        locale: item.locale || 'auto',
        fingerprint: item.fingerprint ? { ...item.fingerprint, seed: item.fingerprint.seed || id } : stableFingerprint(id),
        webRTCPolicy: item.webRTCPolicy || 'proxy-only',
        startUrl: item.startUrl || 'about:blank',
        userAgentMode: item.userAgentMode || 'real',
        userAgent: item.userAgent,
        notes: item.notes,
        groupId: state.groups.some(g => g.id === item.groupId) ? item.groupId : (state.groups[0]?.id || 'group-daily'),
      }
    })
    onImported({ ...state, nextProfileNumber: nextNum, profiles: [...state.profiles, ...imported] }, imported.length)
  }
  return <div className="modal-backdrop higher" onClick={onClose}>
    <section className="sheet import-sheet" style={{ width: 520 }} onClick={e => e.stopPropagation()}>
      <header>
        <div><h2>导入浏览器环境配置</h2><p>选择导出的 JSON 文件或直接粘贴配置内容</p></div>
        <button className="icon-button" onClick={onClose}><X /></button>
      </header>
      <div className="sheet-body">
        <label className="field">
          <span>从本地 JSON 文件读取</span>
          <input type="file" accept=".json,application/json" onChange={handleFile} />
        </label>
        <label className="field">
          <span>或粘贴 JSON 配置</span>
          <textarea style={{ minHeight: 160, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5 }} value={text} onChange={e => setText(e.target.value)} placeholder='{"profiles": [...]}' />
        </label>
        {error && <p className="error">{error}</p>}
      </div>
      <footer>
        <button type="button" className="secondary" onClick={onClose}>取消</button>
        <button type="button" className="primary" disabled={!text.trim()} onClick={submit}>确认导入</button>
      </footer>
    </section>
  </div>
}

export default App
