import { timezoneLabel } from './timezones'
import { useState, useEffect } from 'react'
import { Search, Play, Square, Fingerprint, Globe2, Settings2, Monitor, Network, RefreshCw, MapPin, Cpu, Link2, ArrowLeftRight, Trash2, Download, Upload, Cookie, Folder, ChevronRight, ChevronDown, Pencil, LayoutGrid, Copy } from 'lucide-react'
import type { AppState, BrowserProfile, ProxyTestResult } from './types'
import { resolveProfileAvatar, pickNotionAvatar } from './notion-avatars'
import { stableFingerprint } from './profile-fingerprint'

// Notion-style tags, persisted in profile.alias as "a, b, c" so the native toolbar badge keeps working.
export const splitTags = (alias?: string) => [...new Set((alias ?? '').split(/[,，]/).map(t => t.replace(/\s*[\(（]副本[\)）]/g, '').trim()).filter(Boolean))]
export const joinTags = (tags: string[]) => tags.join(', ')
export const PRESET_TAGS = ['Flow']
export const collectAllTags = (profiles: BrowserProfile[]) => {
  const fromProfiles = profiles.flatMap(p => [...splitTags(p.alias), ...splitTags(p.notes)])
  return [...new Set([...PRESET_TAGS, ...fromProfiles])]
}
export const TAG_COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const
export const TAG_COLOR_META: { id: string; label: string; dot: string }[] = [
  { id: 'gray',   label: '浅灰', dot: '#9ca3af' },
  { id: 'brown',  label: '暖棕', dot: '#a16207' },
  { id: 'orange', label: '活力橙', dot: '#f97316' },
  { id: 'yellow', label: '明黄', dot: '#eab308' },
  { id: 'green',  label: '翠绿', dot: '#22c55e' },
  { id: 'blue',   label: '晴空蓝', dot: '#3b82f6' },
  { id: 'purple', label: '优雅紫', dot: '#a855f7' },
  { id: 'pink',   label: '樱花粉', dot: '#ec4899' },
  { id: 'red',    label: '珊瑚红', dot: '#ef4444' },
]
export const tagColor = (tag: string, customColors?: Record<string, string>) => {
  if (customColors?.[tag] && (TAG_COLORS as readonly string[]).includes(customColors[tag])) {
    return customColors[tag]
  }
  let h = 0
  for (const c of tag) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return TAG_COLORS[h % TAG_COLORS.length]
}
const DRAG_MIME = 'application/x-prism-tag'

function TagCell({ profile, allTags, tagColors, onChange, onReceive, onClickTag, onContextMenuTag }: { profile: BrowserProfile; allTags: string[]; tagColors?: Record<string, string>; onChange: (tags: string[]) => void; onReceive: (fromId: string, tag: string, copy: boolean) => void; onClickTag?: (tag: string) => void; onContextMenuTag?: (tag: string, x: number, y: number) => void }) {
  const tags = splitTags(profile.alias)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [over, setOver] = useState(false)
  const add = (raw: string) => { const next = splitTags(joinTags([...tags, raw])); if (next.length !== tags.length) onChange(next); setDraft('') }
  const suggestions = allTags.filter(t => !tags.includes(t) && t.toLowerCase().includes(draft.trim().toLowerCase()))
  return <div className={`tag-cell ${over ? 'drop-over' : ''}`}
    onDragOver={e => { if (!e.dataTransfer.types.includes(DRAG_MIME)) return; e.preventDefault(); e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move'; setOver(true) }}
    onDragLeave={() => setOver(false)}
    onDrop={e => { setOver(false); const raw = e.dataTransfer.getData(DRAG_MIME); if (!raw) return; e.preventDefault(); const { from, tag } = JSON.parse(raw); onReceive(from, tag, e.altKey) }}
    onClick={() => setEditing(true)}>
    {tags.map(tag => <span key={tag} className={`notion-tag tag-${tagColor(tag, tagColors)}`} draggable title="点击筛选此 Tag；右键点击更换颜色；拖到其他 Profile 移动；按住 ⌥ 拖动为复制"
      onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ from: profile.id, tag })); e.dataTransfer.effectAllowed = 'copyMove' }}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenuTag?.(tag, e.clientX, e.clientY) }}
      onClick={e => { e.stopPropagation(); onClickTag?.(tag) }}>
      {tag}<button type="button" aria-label={`移除 ${tag}`} onClick={e => { e.stopPropagation(); onChange(tags.filter(t => t !== tag)) }}>×</button>
    </span>)}
    {editing ? <span className="tag-input-wrap" onClick={e => e.stopPropagation()}>
      <input autoFocus className="tag-input" value={draft} placeholder="输入或选择标签…" onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft.trim()) add(draft); setTimeout(() => setEditing(false), 150) }}
        onKeyDown={e => {
          if ((e.key === 'Enter' || e.key === ',') && draft.trim()) { e.preventDefault(); add(draft) }
          else if (e.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1))
          else if (e.key === 'Escape') { setDraft(''); setEditing(false) }
        }} />
      {suggestions.length > 0 && <span className="tag-suggest">{suggestions.map(t => <button type="button" key={t} className={`notion-tag tag-${tagColor(t, tagColors)}`} onMouseDown={e => { e.preventDefault(); add(t) }}>{t}</button>)}</span>}
    </span> : !tags.length && <span className="tag-placeholder">＋ 添加标签</span>}
  </div>
}

type Props = {
  state: AppState
  onOrganize: (state: AppState) => void
  running: string[]
  onOpen: (p: BrowserProfile) => Promise<void>
  onStop: (id: string) => Promise<void>
  onEdit: (p: BrowserProfile) => void
  onUpdateAlias: (id: string, alias: string) => void
  onRenameProfile?: (id: string, name: string) => void
  onNew: () => void
  onProxies: () => void
  onModeChange: (mode: 'tabs' | 'windows') => Promise<void>
  modeBusy: boolean
  onBrowse?: () => void
  onProtect: (ids: string[]) => void
  onDelete: (ids: string[]) => Promise<void>
  onCookieModal: (p: BrowserProfile) => void
  onExportProfiles: (ids: string[]) => void
  onImportProfiles: () => void
}

export function ProfileManager({ state, onOrganize, running, onOpen, onStop, onEdit, onUpdateAlias, onRenameProfile, onNew, onProxies, onProtect, onDelete, onCookieModal, onExportProfiles, onImportProfiles }: Props) {
  const [folderName, setFolderName] = useState('')
  const [newFolder, setNewFolder] = useState(false)
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = useState('')
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null)
  const [editingProfileName, setEditingProfileName] = useState('')
  const [groupMenuProfileId, setGroupMenuProfileId] = useState<string | null>(null)
  const [tagColorMenu, setTagColorMenu] = useState<{ tag: string; x: number; y: number } | null>(null)
  const [moveTo, setMoveTo] = useState('')
  const [query, setQuery] = useState(''), [group, setGroup] = useState(''), [tagFilter, setTagFilter] = useState('')
  const [busy, setBusy] = useState<string[]>([]), [selected, setSelected] = useState<string[]>([])
  const [tests, setTests] = useState<Record<string, ProxyTestResult | 'testing'>>({})
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[] | null>(null)
  const allTags = collectAllTags(state.profiles)
  const hasTag = (p: BrowserProfile, t: string) => [...splitTags(p.alias), ...splitTags(p.notes)].includes(t)
  const profiles = state.profiles.filter(p =>
    (group ? p.groupId === group : (query.trim() || tagFilter || !state.groups.find(g => g.id === p.groupId)?.collapsed)) &&
    (!tagFilter || hasTag(p, tagFilter)) &&
    `${p.name} ${p.alias ?? ''} ${p.notes ?? ''}`.toLowerCase().includes(query.toLowerCase())
  )
  async function operate(p: BrowserProfile, stop = false) { setBusy(ids => [...ids,p.id]); try { if(stop) await onStop(p.id);else await onOpen(p) } finally {setBusy(ids => ids.filter(id=>id!==p.id))} }
  async function batch(stop:boolean) { for(const p of state.profiles.filter(p=>selected.includes(p.id))) await operate(p,stop) }
  async function test(id:string) { const proxy=state.proxies.find(p=>p.id===id);if(!proxy || tests[id]==='testing')return;setTests(v=>({...v,[id]:'testing'}));try{const result=await window.profileBrowser!.testProxy(proxy);setTests(v=>({...v,[id]:result}))}catch{setTests(v=>({...v,[id]:{ok:false,error:'检测失败，请重试'}}))} }
  const region = timezoneLabel
  const proxyUseCount = (proxyId: string) => state.profiles.filter(p => p.proxyId === proxyId).length

  function handleSaveRename(folderId: string) {
    const trimmed = editingFolderName.trim()
    if (trimmed) {
      onOrganize({
        ...state,
        groups: state.groups.map(g => g.id === folderId ? { ...g, name: trimmed } : g),
      })
    }
    setEditingFolderId(null)
  }

  function handleDeleteFolder(folderId: string) {
    if (!window.confirm('确定要删除此分组吗？组内的 Profile 将保留并移至全部环境。')) return
    const nextGroups = state.groups.filter(g => g.id !== folderId)
    const nextProfiles = state.profiles.map(p => p.groupId === folderId ? { ...p, groupId: '' } : p)
    onOrganize({ ...state, groups: nextGroups, profiles: nextProfiles })
    if (group === folderId) setGroup('')
  }

  function startRename(p: BrowserProfile) {
    setEditingProfileId(p.id)
    setEditingProfileName(p.name)
  }

  function handleFinishRename(id: string) {
    if (editingProfileId === id) {
      const trimmed = editingProfileName.trim()
      const original = state.profiles.find(p => p.id === id)?.name
      if (trimmed && trimmed !== original) {
        if (onRenameProfile) {
          onRenameProfile(id, trimmed)
        } else {
          onOrganize({
            ...state,
            profiles: state.profiles.map(p => p.id === id ? { ...p, name: trimmed } : p),
          })
        }
      }
      setEditingProfileId(null)
    }
  }

  async function confirmDelete() {
    if (!confirmDeleteIds?.length) return
    const ids = confirmDeleteIds
    setConfirmDeleteIds(null)
    setSelected(cur => cur.filter(id => !ids.includes(id)))
    await onDelete(ids)
  }

  function duplicateProfile(orig: BrowserProfile) {
    const id = crypto.randomUUID()
    const number = Math.max(state.nextProfileNumber || 1, ...state.profiles.map(p => (p.number || 0) + 1))
    const colors = ['#ef665f','#e79b3f','#44a97b','#4c8fe6','#7a68e8','#cf659e']
    const newProfile: BrowserProfile = {
      id,
      number,
      name: `${orig.name} (副本)`,
      alias: orig.alias,
      color: colors[state.profiles.length % colors.length],
      avatar: pickNotionAvatar(number - 1),
      proxyId: orig.proxyId, // 唯一继承项：只dup用的Proxy！
      timezone: 'auto',
      locale: 'auto',
      fingerprint: stableFingerprint(id), // 全新独立指纹，绝对不共享旧指纹
      webRTCPolicy: 'proxy-only',
      startUrl: orig.startUrl || 'about:blank',
      userAgentMode: 'real',
      groupId: orig.groupId || state.groups[0]?.id || 'group-daily',
    }

    const nextState: AppState = {
      ...state,
      nextProfileNumber: number + 1,
      profiles: [...state.profiles, newProfile],
    }
    onOrganize(nextState)
    void window.profileBrowser?.saveState(nextState)
  }

  function duplicateSelected() {
    if (!selected.length) return
    let currentNumber = Math.max(state.nextProfileNumber || 1, ...state.profiles.map(p => (p.number || 0) + 1))
    const colors = ['#ef665f','#e79b3f','#44a97b','#4c8fe6','#7a68e8','#cf659e']
    const newProfiles: BrowserProfile[] = []

    for (const sid of selected) {
      const orig = state.profiles.find(p => p.id === sid)
      if (!orig) continue
      const id = crypto.randomUUID()
      const number = currentNumber++
      newProfiles.push({
        id,
        number,
        name: `${orig.name} (副本)`,
        alias: orig.alias,
        color: colors[(state.profiles.length + newProfiles.length) % colors.length],
        avatar: pickNotionAvatar(number - 1),
        proxyId: orig.proxyId, // 唯一继承项：只dup用的Proxy！
        timezone: 'auto',
        locale: 'auto',
        fingerprint: stableFingerprint(id),
        webRTCPolicy: 'proxy-only',
        startUrl: orig.startUrl || 'about:blank',
        userAgentMode: 'real',
        groupId: orig.groupId || state.groups[0]?.id || 'group-daily',
      })
    }

    if (!newProfiles.length) return
    const nextState: AppState = {
      ...state,
      nextProfileNumber: currentNumber,
      profiles: [...state.profiles, ...newProfiles],
    }
    onOrganize(nextState)
    void window.profileBrowser?.saveState(nextState)
    setSelected([])
  }

  // 快捷键支持：Cmd+A / Ctrl+A 全选或反选当前环境列表，Esc 清空选择
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey
      const target = e.target as HTMLElement | null
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)

      if (isCmdOrCtrl && e.key.toLowerCase() === 'a') {
        if (isInput) return // 处于文字输入框中时保留原生全选文字行为
        e.preventDefault()
        e.stopPropagation()
        const allIds = profiles.map(p => p.id)
        if (allIds.length === 0) return
        const isAllSelected = allIds.every(id => selected.includes(id))
        if (isAllSelected) {
          setSelected([])
        } else {
          setSelected(allIds)
        }
        return
      }

      if (e.key === 'Escape' && !isInput && selected.length > 0) {
        e.preventDefault()
        setSelected([])
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [profiles, selected])

  useEffect(() => {
    if (!groupMenuProfileId && !tagColorMenu) return
    const closeMenu = () => {
      setGroupMenuProfileId(null)
      setTagColorMenu(null)
    }
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [groupMenuProfileId, tagColorMenu])

  function handleSelectTagColor(tag: string, colorId: string) {
    const nextTagColors = { ...(state.tagColors || {}), [tag]: colorId }
    const nextState = { ...state, tagColors: nextTagColors }
    onOrganize(nextState)
    void window.profileBrowser?.saveState(nextState)
    setTagColorMenu(null)
  }
  return <main className="profile-manager">
    <header className="manager-heading">
      <div><h1>浏览器环境 <span>{state.profiles.length}</span></h1><p>独立窗口，固定配置。每个身份都有自己的空间。</p></div>
      <button className="secondary" onClick={onImportProfiles}><Upload size={15}/>导入环境</button>
      <button className="secondary" onClick={() => onExportProfiles(selected)}><Download size={15}/>{selected.length ? `导出所选 (${selected.length})` : '导出全部'}</button>
      <button className="secondary" onClick={onProxies}><Network size={16}/>管理代理</button>
      <button className="primary" onClick={onNew}>＋ 新建 Profile</button>
    </header>
    <section className="profile-folders" aria-label="Profile 文件夹">
      <button className={`secondary ${!group ? 'active' : ''}`} onClick={() => {setGroup('');setSelected([])}}>全部环境</button>
      {state.groups.map(folder => {
        const isEditingThis = editingFolderId === folder.id
        const folderProfilesCount = state.profiles.filter(p => p.groupId === folder.id).length
        return (
          <div className={`folder-pill ${group === folder.id ? 'active' : ''}`} key={folder.id}>
            <button
              type="button"
              className="folder-toggle-btn"
              title={folder.collapsed ? '展开' : '折叠'}
              onClick={(e) => {
                e.stopPropagation()
                onOrganize({
                  ...state,
                  groups: state.groups.map(g => g.id === folder.id ? { ...g, collapsed: !g.collapsed } : g)
                })
                setSelected([])
                if (group === folder.id) setGroup('')
              }}
            >
              {folder.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            </button>
            {isEditingThis ? (
              <input
                autoFocus
                className="folder-rename-input"
                value={editingFolderName}
                onChange={e => setEditingFolderName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveRename(folder.id)
                  if (e.key === 'Escape') setEditingFolderId(null)
                }}
                onBlur={() => handleSaveRename(folder.id)}
              />
            ) : (
              <div
                className="folder-pill-name"
                onClick={() => { setGroup(folder.id); setSelected([]) }}
                title={`查看 ${folder.name}`}
              >
                <Folder size={14} />
                <span>{folder.name}</span>
                <span className="folder-count-badge">{folderProfilesCount}</span>
              </div>
            )}
            <div className="folder-pill-actions">
              <button
                type="button"
                className="folder-action-icon"
                title="修改分组名称"
                onClick={(e) => {
                  e.stopPropagation()
                  setEditingFolderId(folder.id)
                  setEditingFolderName(folder.name)
                }}
              >
                <Pencil size={11} />
              </button>
              <button
                type="button"
                className="folder-action-icon danger"
                title="删除分组"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteFolder(folder.id)
                }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        )
      })}
      <button className="secondary" onClick={() => setNewFolder(true)}>＋ 新建文件夹</button>
      {group && (
        <button
          type="button"
          className="secondary"
          title="在同一个独立窗口内以多标签聚合打开此分组的所有环境（每个 Profile 独立彩色 Tab，物理隔离不串号）"
          onClick={() => void window.profileBrowser?.openGroupWorkspace(group)}
        >
          <LayoutGrid size={14}/>同窗聚合打开本组 ({state.profiles.filter(p => p.groupId === group).length})
        </button>
      )}
      {newFolder && <form onSubmit={e=>{e.preventDefault();const name=folderName.trim();if(!name)return;onOrganize({...state,groups:[...state.groups,{id:crypto.randomUUID(),name,color:'#64748b',collapsed:true}]});setFolderName('');setNewFolder(false)}}><input aria-label="文件夹名称" autoFocus placeholder="例如：偶尔使用" maxLength={40} value={folderName} onChange={e=>setFolderName(e.target.value)}/><button className="secondary" disabled={!folderName.trim()}>创建</button><button type="button" className="secondary" onClick={()=>setNewFolder(false)}>取消</button></form>}
      <small>折叠的文件夹在全部列表中隐藏；点击文件夹或搜索即可查看，不会自动启动。</small>
    </section>
    <div className="manager-search">
      <select aria-label="按文件夹筛选" value={group} onChange={e=>{setGroup(e.target.value);setSelected([])}}><option value="">全部文件夹</option>{state.groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>
      <select aria-label="按 Tag 筛选" value={tagFilter} onChange={e=>{setTagFilter(e.target.value);setSelected([])}}>
        <option value="">全部标签 (Tag)</option>
        {allTags.map(t => {
          const cnt = state.profiles.filter(p => hasTag(p, t)).length
          return <option key={t} value={t}>{t} ({cnt})</option>
        })}
      </select>
      <label><Search size={19}/><input aria-label="搜索 Profile" placeholder="搜索环境名称、别名或备注" value={query} onChange={e=>{setQuery(e.target.value);setSelected([])}}/></label>
      <span className="mode-label"><Monitor size={16}/>Chrome 独立窗口</span>
    </div>
    {allTags.length > 0 && (
      <div className="tag-filter-bar">
        <span className="tag-filter-label" title="点击标签筛选；右键或点调色盘可给标签换颜色">Tag 筛选：</span>
        <button type="button" className={`tag-filter-chip ${!tagFilter ? 'active' : ''}`} onClick={() => { setTagFilter(''); setSelected([]) }}>全部</button>
        {allTags.map(t => {
          const cnt = state.profiles.filter(p => hasTag(p, t)).length
          const isActive = tagFilter === t
          return (
            <div key={t} className="tag-filter-chip-wrap">
              <button
                type="button"
                className={`notion-tag tag-${tagColor(t, state.tagColors)} tag-filter-chip ${isActive ? 'active' : ''}`}
                title="点击筛选此 Tag；右键点击更换颜色"
                onClick={() => { setTagFilter(isActive ? '' : t); setSelected([]) }}
                onContextMenu={e => {
                  e.preventDefault()
                  e.stopPropagation()
                  setTagColorMenu({ tag: t, x: e.clientX, y: e.clientY })
                }}
              >
                {t}<span className="tag-chip-count">{cnt}</span>
                <span
                  className="tag-color-trigger"
                  title={`给 "${t}" 换颜色`}
                  onClick={e => {
                    e.stopPropagation()
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    setTagColorMenu({ tag: t, x: rect.left, y: rect.bottom + 4 })
                  }}
                >🎨</span>
              </button>
            </div>
          )
        })}
      </div>
    )}
    <div className="manager-actions">
      <button className="primary" disabled={!selected.length||!!busy.length} onClick={()=>void batch(false)}><Play size={16}/>启动所选</button>
      <button className="secondary" disabled={!selected.length||!!busy.length} onClick={()=>void batch(true)}><Square size={16}/>停止</button>
      <button
        type="button"
        className="primary"
        title="在同一个窗口内以多标签聚合打开（每个 Profile 独立彩色 Tab，物理隔离不串号）"
        disabled={!selected.length && !group}
        onClick={() => void window.profileBrowser?.openGroupWorkspace(group || 'all', selected.length ? selected : undefined)}
      >
        <LayoutGrid size={16}/>同窗聚合打开{selected.length ? ` (${selected.length})` : group ? ' (本组)' : ''}
      </button>
      <button className="secondary" disabled={!selected.length||!!busy.length} onClick={()=>onProtect(selected)}><Fingerprint size={17}/>启用固定保护</button>
      <button className="secondary danger-btn" disabled={!selected.length||!!busy.length} onClick={()=>setConfirmDeleteIds(selected)}><Trash2 size={15}/>删除所选{selected.length ? ` (${selected.length})` : ''}</button>
      <button className="secondary" disabled={!selected.length||!!busy.length} onClick={()=>duplicateSelected()} title="复制所选环境（仅继承代理网络配置，全新指纹环境）"><Copy size={15}/>复制所选{selected.length ? ` (${selected.length})` : ''}</button>
      <select aria-label="移动所选到文件夹" disabled={!selected.length} value={moveTo} onChange={e=>{const id=e.target.value;if(!id)return;onOrganize({...state,profiles:state.profiles.map(p=>selected.includes(p.id)?{...p,groupId:id}:p)});setSelected([]);setMoveTo('')}}><option value="">移动所选到文件夹…</option>{state.groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>
      <span/>
      <small><i className="live-dot"/>{running.length} 个运行中</small>
    </div>
    <div className="manager-table-scroll"><table><thead><tr><th><input type="checkbox" aria-label="选择当前列表" title="全选 / 取消全选 (⌘A)" checked={!!profiles.length&&profiles.every(p=>selected.includes(p.id))} onChange={e=>setSelected(e.target.checked?profiles.map(p=>p.id):[])}/></th><th>编号</th><th>名称 / 分组</th><th>别名 / 用途</th><th style={{ minWidth: 165, whiteSpace: 'nowrap' }}>浏览器环境</th><th>代理协议</th><th>出口 IP</th><th>状态</th><th>操作</th></tr></thead><tbody>{profiles.map((p, idx) => {
      const proxy = state.proxies.find(n => n.id === p.proxyId)
      const live = running.includes(p.id)
      const result = tests[p.proxyId]
      const avatarSrc = resolveProfileAvatar(p.avatar, (p.number || idx + 1) - 1)
      const sharedCount = proxy && proxy.kind !== 'direct' && proxy.kind !== 'system' ? proxyUseCount(p.proxyId) : 0
      return <tr key={p.id}>
        <td><input type="checkbox" aria-label={`选择 ${p.name}`} checked={selected.includes(p.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id))}/></td>
        <td className="profile-number"><span className={`number-pill ${live ? 'live' : ''}`}>#{p.number ?? idx + 1}</span></td>
        <td>
          <div className="profile-name-cell">
            <span className="environment-avatar notion-avatar"><img src={avatarSrc} alt="" /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {editingProfileId === p.id ? (
                <input
                  type="text"
                  className="profile-inline-rename-input"
                  autoFocus
                  value={editingProfileName}
                  onChange={(e) => setEditingProfileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleFinishRename(p.id)
                    if (e.key === 'Escape') setEditingProfileId(null)
                  }}
                  onBlur={() => handleFinishRename(p.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div
                  className="profile-name-title-row"
                  title="点击或双击快速修改名称"
                  onClick={() => startRename(p)}
                >
                  <strong>{p.name}</strong>
                  <button
                    type="button"
                    className="inline-rename-pencil"
                    title="快速改名"
                    onClick={(e) => {
                      e.stopPropagation()
                      startRename(p)
                    }}
                  >
                    <Pencil size={11} />
                  </button>
                </div>
              )}
              <div className="profile-group-inline-wrap">
                <button
                  type="button"
                  className="profile-group-inline-btn"
                  title="点击快速切换所属分组"
                  onClick={(e) => {
                    e.stopPropagation()
                    setGroupMenuProfileId(groupMenuProfileId === p.id ? null : p.id)
                  }}
                >
                  <Folder size={11} />
                  <span>{state.groups.find(g => g.id === p.groupId)?.name || '未分组'}</span>
                  <ChevronDown size={11} />
                </button>
                {p.notes ? <small className="profile-notes-inline"> · {p.notes}</small> : null}
                {groupMenuProfileId === p.id && (
                  <div className="profile-group-popover" onClick={(e) => e.stopPropagation()}>
                    <div className="profile-group-popover-title">切换分组</div>
                    {state.groups.map(g => (
                      <button
                        type="button"
                        key={g.id}
                        className={`profile-group-option ${p.groupId === g.id ? 'active' : ''}`}
                        onClick={() => {
                          onOrganize({
                            ...state,
                            profiles: state.profiles.map(item => item.id === p.id ? { ...item, groupId: g.id } : item)
                          })
                          setGroupMenuProfileId(null)
                        }}
                      >
                        <Folder size={12} />
                        <span>{g.name}</span>
                        {p.groupId === g.id && <b>✓</b>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </td>
        <td className="alias-cell">
          <TagCell profile={p} allTags={allTags} tagColors={state.tagColors} onContextMenuTag={(t, x, y) => setTagColorMenu({ tag: t, x, y })} onClickTag={(t) => { setTagFilter(tagFilter === t ? '' : t); setSelected([]) }} onChange={(tags) => onUpdateAlias(p.id, joinTags(tags))} onReceive={(from, tag, copy) => {
            if (from === p.id) return
            const target = splitTags(p.alias)
            if (!target.includes(tag)) onUpdateAlias(p.id, joinTags([...target, tag]))
            if (!copy) { const src = state.profiles.find(x => x.id === from); if (src) onUpdateAlias(from, joinTags(splitTags(src.alias).filter(t => t !== tag))) }
          }} />
        </td>
        <td style={{ minWidth: 165, whiteSpace: 'nowrap' }}>
          <div className="env-icons">
            <span className="env-badge" title="Fingerprint Chromium C++ 内核级指纹隔离"><Fingerprint size={15}/><Cpu size={15}/><Globe2 size={15}/><b>148</b></span>
            <span style={{ whiteSpace: 'nowrap', display: 'inline-block' }}>{p.locale==='auto'?'IP 语言':p.locale||'系统语言'}</span>
          </div>
          <small>{region(p.timezone)}</small>
        </td>
        <td>
          {!proxy ? <strong className="node-name">代理缺失</strong> : proxy.kind === 'direct' ? <>
            <strong className="node-name muted">No Proxy</strong>
            <small>本机直连 · 不走代理</small>
          </> : proxy.kind === 'system' ? <>
            <strong className="node-name"><span className="proxy-share-tag"><Link2 size={12}/>SYS</span>{proxy.name}</strong>
            <small>system · 127.0.0.1:10808 (本机代理)</small>
          </> : <>
            <strong className="node-name"><span className="proxy-share-tag" title={`共 ${sharedCount} 个环境绑定此节点`}><Link2 size={12}/>({sharedCount})</span>{proxy.favorite?'★ ':''}{proxy.name}</strong>
            <small><span className="proto-tag">{proxy.kind}</span>{proxy.host?` ${proxy.host}:${proxy.port}`:''}</small>
          </>}
        </td>
        <td>
          <div className="ip-cell">
            <button className={`ip-status-btn ${result && result !== 'testing' ? (result.ok ? 'ok' : 'bad') : ''}`} title="点击测试代理连通性与出口 IP" disabled={!proxy||result==='testing'} onClick={()=>void test(p.proxyId)}>
              {result === 'testing' ? <RefreshCw size={14} className="spin"/> : <ArrowLeftRight size={14}/>}
            </button>
            <div className="ip-copy">
              <button className="ip-check" disabled={!proxy||result==='testing'} onClick={()=>void test(p.proxyId)}>
                {result==='testing'?'正在检测…':result?.ok?<><MapPin size={13} className="pin-ok"/><strong>{result.ip}</strong></>:result?'连接失败 · 重试':'检测出口 IP'}
              </button>
              {result&&result!=='testing'&&<small title={result.error}>{result.ok?result.location?`${result.location.country} - ${result.location.city} · ${result.latency}ms`:result.locationWarning:result.error}</small>}
            </div>
          </div>
        </td>
        <td><span className={`runtime-status ${live?'running':''}`}><i/>{busy.includes(p.id)?'处理中':live?'运行中':'未启动'}</span></td>
        <td>
          <div className="manager-row-actions">
            <button className="primary" disabled={busy.includes(p.id)} onClick={()=>void operate(p)}><Play size={14}/>{live?'显示':'启动'}</button>
            {live&&<button className="secondary stop-profile" title={`停止 ${p.name}`} onClick={()=>void operate(p,true)}><Square size={13}/>停止</button>}
            <button className="icon-button" title={`复制 ${p.name}（仅继承代理网络，全新指纹环境）`} onClick={()=>duplicateProfile(p)}><Copy size={16}/></button>
            <button className="icon-button" title={`导入 / 导出 ${p.name} 的 Cookie`} onClick={()=>onCookieModal(p)}><Cookie size={17}/></button>
            <button className="icon-button" title={`改名 ${p.name}`} onClick={()=>startRename(p)}><Pencil size={15}/></button>
            <button className="icon-button" title={`设置 ${p.name}`} onClick={()=>onEdit(p)}><Settings2 size={17}/></button>
            <button className="icon-button danger-icon" title={`删除 ${p.name}`} onClick={()=>setConfirmDeleteIds([p.id])}><Trash2 size={16}/></button>
          </div>
        </td>
      </tr>
    })}</tbody></table>{!profiles.length&&<div className="manager-empty"><Fingerprint size={42}/><h3>{state.profiles.length?'没有匹配的环境':'创建你的第一个浏览器环境'}</h3><p>选择一个代理节点，开始独立浏览。</p><button className="primary" onClick={onNew}>＋ 新建 Profile</button></div>}</div>
    <footer className="manager-footer"><span>已选择 <strong>{selected.length}</strong> 个环境 <small style={{ marginLeft: 8, color: '#94a3b8', fontSize: 11 }}>(⌘A 全选)</small></span><span>共 {profiles.length} 个 <b>1</b></span></footer>
    {tagColorMenu && (
      <div
        className="tag-color-popover"
        style={{
          left: Math.max(12, Math.min(tagColorMenu.x, window.innerWidth - 210)),
          top: Math.max(12, Math.min(tagColorMenu.y, window.innerHeight - 280)),
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="tag-color-popover-title">标签「{tagColorMenu.tag}」颜色</div>
        <div className="tag-color-grid">
          {TAG_COLOR_META.map(c => {
            const current = tagColor(tagColorMenu.tag, state.tagColors)
            return (
              <button
                type="button"
                key={c.id}
                className={`tag-color-option ${current === c.id ? 'active' : ''}`}
                onClick={() => handleSelectTagColor(tagColorMenu.tag, c.id)}
              >
                <span className={`notion-tag tag-${c.id} tag-color-preview`}>{tagColorMenu.tag}</span>
                <span className="tag-color-label">{c.label}</span>
                {current === c.id && <b>✓</b>}
              </button>
            )
          })}
        </div>
      </div>
    )}
    {confirmDeleteIds && <div className="modal-backdrop higher" onClick={() => setConfirmDeleteIds(null)}>
      <section className="sheet rename-sheet" onClick={e => e.stopPropagation()}>
        <header><div><h2>确认删除环境</h2><p>将彻底删除所选 {confirmDeleteIds.length} 个 Profile 及其本地独立 Cookie 与缓存目录</p></div></header>
        <div className="sheet-body">
          <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
            即将删除：<strong>{confirmDeleteIds.map(id => state.profiles.find(p => p.id === id)?.name || id).join('、')}</strong>。此操作不可恢复，确定继续吗？
          </p>
        </div>
        <footer>
          <button type="button" className="secondary" onClick={() => setConfirmDeleteIds(null)}>取消</button>
          <button type="button" className="primary danger-solid" onClick={() => void confirmDelete()}>确认删除</button>
        </footer>
      </section>
    </div>}
  </main>
}
