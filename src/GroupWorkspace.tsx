import React, { useEffect, useState, useRef } from 'react'
import type { WorkspaceState, WorkspaceTab } from './types'
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Plus,
  X,
  Globe,
  Lock,
  Palette,
  Star,
  ShieldCheck,
  Copy,
  Edit2,
  Trash2,
  ExternalLink,
  User,
  ArrowRightLeft,
} from 'lucide-react'

interface BookmarkContextMenuState {
  visible: boolean
  x: number
  y: number
  bookmark: { name: string; url: string } | null
  scope: 'shared' | 'profile'
}

interface EditBookmarkModalState {
  open: boolean
  isNew: boolean
  isRenameOnly?: boolean
  oldUrl: string
  name: string
  url: string
  scope: 'shared' | 'profile'
}

export interface ArcPalette {
  id: string
  name: string
  bg: string
  sidebar: string
  highlight: string
  text: string
  dot: string
}

export const ARC_PALETTES: ArcPalette[] = [
  { id: 'mint', name: 'Mint 薄荷绿', bg: '#8ee2b5', sidebar: '#72dba2', highlight: '#2d885c', text: '#103623', dot: '#10b981' },
  { id: 'peach', name: 'Coral 珊瑚橙', bg: '#fca58e', sidebar: '#f98b70', highlight: '#e05528', text: '#4a180b', dot: '#ea580c' },
  { id: 'lavender', name: 'Lavender 薰衣草紫', bg: '#c8b7f8', sidebar: '#b69ff4', highlight: '#6c48d4', text: '#241452', dot: '#7c3aed' },
  { id: 'sky', name: 'Sky 晴空蓝', bg: '#8cd3f8', sidebar: '#70c5f4', highlight: '#1d87bf', text: '#0b2e40', dot: '#0284c7' },
  { id: 'yellow', name: 'Lemon 柠檬金', bg: '#fde047', sidebar: '#facc15', highlight: '#b45309', text: '#451a03', dot: '#d97706' },
  { id: 'rose', name: 'Rose 玫瑰粉', bg: '#f9a8d4', sidebar: '#f472b6', highlight: '#be185d', text: '#4c0519', dot: '#e11d48' },
  { id: 'teal', name: 'Teal 碧波青', bg: '#7ee2d4', sidebar: '#60d8c8', highlight: '#0d9488', text: '#08332f', dot: '#0d9488' },
  { id: 'sage', name: 'Sage 嫩芽绿', bg: '#bef264', sidebar: '#a3e635', highlight: '#4d7c0f', text: '#1a2e05', dot: '#16a34a' },
]

export function getArcTheme(hex?: string): ArcPalette {
  if (!hex) return ARC_PALETTES[0]
  const lower = hex.toLowerCase()
  const found = ARC_PALETTES.find(
    (p) =>
      p.bg.toLowerCase() === lower ||
      p.dot.toLowerCase() === lower ||
      p.sidebar.toLowerCase() === lower ||
      p.highlight.toLowerCase() === lower
  )
  if (found) return found

  if (lower.includes('orange') || lower === '#ea580c' || lower.startsWith('#f') || lower.startsWith('#e')) {
    if (lower === '#e11d48' || lower.includes('rose') || lower.includes('pink')) return ARC_PALETTES[5]
    return ARC_PALETTES[1] // Coral
  }
  if (lower.includes('purple') || lower === '#7c3aed' || lower.startsWith('#c') || lower.startsWith('#8b')) {
    return ARC_PALETTES[2] // Lavender
  }
  if (lower.includes('blue') || lower === '#2563eb' || lower === '#0284c7' || lower.startsWith('#7') || lower.startsWith('#8')) {
    return ARC_PALETTES[3] // Sky
  }
  if (lower.includes('green') || lower === '#059669' || lower === '#16a34a' || lower.startsWith('#8e') || lower.startsWith('#7c')) {
    return ARC_PALETTES[0] // Mint
  }
  return ARC_PALETTES[0]
}

function ChromeFolderIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, marginRight: 3, verticalAlign: 'middle' }}
    >
      <path
        d="M1.5 3.5C1.5 2.67 2.17 2 3 2H6.5L8 3.5H13C13.83 3.5 14.5 4.17 14.5 5V12.5C14.5 13.33 13.83 14 13 14H3C2.17 14 1.5 13.33 1.5 12.5V3.5Z"
        fill="#FDD663"
        stroke="#F9AB00"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function GoogleColoredGIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, verticalAlign: 'middle' }}>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  )
}

function BookmarkFavicon({
  url,
  faviconCache,
  isIconOnly,
}: {
  url: string
  faviconCache?: Record<string, string>
  isIconOnly?: boolean
}) {
  const [loadError, setLoadError] = useState(false)

  // 100% 对齐 Chrome 原生规范：按 Origin 读取本地已有缓存，绝不向外发包，绝不跨 Tab 借用
  let faviconUrl: string | undefined
  if (url && faviconCache) {
    try {
      const origin = new URL(url).origin
      faviconUrl = faviconCache[origin]
    } catch {}
  }

  const mr = isIconOnly ? 0 : 4

  if (faviconUrl && !loadError) {
    return (
      <img
        src={faviconUrl}
        alt=""
        className="arc-bm-favicon"
        onError={() => setLoadError(true)}
        style={{
          width: 14,
          height: 14,
          borderRadius: 2,
          flexShrink: 0,
          marginRight: mr,
          objectFit: 'contain',
          verticalAlign: 'middle',
        }}
      />
    )
  }

  // 官方 Chrome 原版书签默认白纸折角纯 SVG 图标 (零网络请求，纯本地绘制)
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, marginRight: mr, verticalAlign: 'middle' }}
    >
      <path
        d="M3.5 2C2.67 2 2 2.67 2 3.5V12.5C2 13.33 2.67 14 3.5 14H12.5C13.33 14 14 13.33 14 12.5V5.5L10.5 2H3.5Z"
        fill="#FFFFFF"
        stroke="#70757A"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M10 2V5.5H13.5"
        fill="#DADCE0"
        stroke="#70757A"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function GroupWorkspaceInner() {
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [isEditingUrl, setIsEditingUrl] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [isDragOverShared, setIsDragOverShared] = useState(false)
  const [isDragOverProfile, setIsDragOverProfile] = useState(false)
  const [draggedBookmarkIndex, setDraggedBookmarkIndex] = useState<{ idx: number; scope: 'shared' | 'profile' } | null>(null)
  const [contextMenu, setContextMenu] = useState<BookmarkContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    bookmark: null,
    scope: 'shared',
  })
  const [editModal, setEditModal] = useState<EditBookmarkModalState>({
    open: false,
    isNew: false,
    oldUrl: '',
    name: '',
    url: '',
    scope: 'shared',
  })
  const omniboxInputRef = useRef<HTMLInputElement>(null)
  const activeTab = workspace?.tabs.find((t) => t.id === workspace.activeTabId)
  const activeTabRef = useRef(activeTab)
  activeTabRef.current = activeTab

  function focusAndSelectOmnibox(clear = false) {
    void window.profileBrowser?.workspaceFocusWindow?.()
    setIsEditingUrl(true)
    if (clear) {
      setUrlInput('')
    } else {
      const cur = activeTabRef.current
      if (cur?.url && cur.url !== 'about:blank') {
        setUrlInput(cur.url)
      } else {
        setUrlInput('')
      }
    }
    // 立即执行 focus 和 select，确保第一时间内按键不丢失
    omniboxInputRef.current?.focus()
    if (!clear) {
      omniboxInputRef.current?.select()
    }
    // 在下一次动画帧与微延时中再次强化确保获焦
    requestAnimationFrame(() => {
      omniboxInputRef.current?.focus()
      if (!clear) omniboxInputRef.current?.select()
    })
    setTimeout(() => {
      omniboxInputRef.current?.focus()
      if (!clear) omniboxInputRef.current?.select()
    }, 20)
  }

  useEffect(() => {
    // 初始获取工作台状态
    void window.profileBrowser?.workspaceGetState().then((state) => {
      if (state) {
        setWorkspace(state)
        const active = state.tabs.find((t) => t.id === state.activeTabId)
        if (active) {
          setUrlInput(active.url === 'about:blank' ? '' : active.url)
        }
      }
    })

    // 监听广播更新
    const unsubscribe = window.profileBrowser?.onWorkspaceState((state) => {
      setWorkspace(state)
    })

    // 监听原生右键菜单触发的动作
    const unsubTrigger = window.profileBrowser?.onTriggerBookmarkAction?.((payload) => {
      const curTab = activeTabRef.current
      if (payload.action === 'open' && payload.url) {
        if (!curTab) return
        setUrlInput(payload.url)
        setIsEditingUrl(false)
        void window.profileBrowser?.workspaceNavigate(curTab.id, payload.url)
      } else if (payload.action === 'new-tab' && payload.url) {
        if (curTab) void window.profileBrowser?.workspaceNewTab(curTab.profileId, payload.url)
      } else if (payload.action === 'rename' && payload.bookmark) {
        handleOpenRenameModal(payload.bookmark, payload.scope || 'shared')
      } else if (payload.action === 'edit' && payload.bookmark) {
        handleOpenEditModal(payload.bookmark, payload.scope || 'shared')
      } else if (payload.action === 'add') {
        handleOpenEditModal(null, payload.scope || 'shared')
      }
    })

    // 监听主进程发出的地址栏聚焦指令 (Cmd + L / Cmd + T)
    const unsubFocus = window.profileBrowser?.onFocusOmnibox?.((payload: any) => {
      focusAndSelectOmnibox(Boolean(payload?.clear))
    })

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey
      if (cmdOrCtrl && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault()
        focusAndSelectOmnibox(false)
      } else if (cmdOrCtrl && (e.key === 't' || e.key === 'T')) {
        e.preventDefault()
        const cur = activeTabRef.current
        if (cur) {
          focusAndSelectOmnibox(true)
          void window.profileBrowser?.workspaceNewTab(cur.profileId, 'about:blank')
        }
      } else if (cmdOrCtrl && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        handleToggleBookmark()
      } else if (e.key === 'Escape') {
        if (isEditingUrl) {
          setIsEditingUrl(false)
          const cur = activeTabRef.current
          setUrlInput(cur?.url && cur.url !== 'about:blank' ? cur.url : '')
          omniboxInputRef.current?.blur()
        }
        setContextMenu({ visible: false, x: 0, y: 0, bookmark: null, scope: 'shared' })
        setEditModal({ open: false, isNew: false, isRenameOnly: false, oldUrl: '', name: '', url: '', scope: 'shared' })
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)

    return () => {
      if (unsubscribe) unsubscribe()
      if (unsubTrigger) unsubTrigger()
      if (unsubFocus) unsubFocus()
      window.removeEventListener('keydown', handleGlobalKeyDown)
    }
  }, [])

  useEffect(() => {
    if (activeTab && !isEditingUrl) {
      setUrlInput(activeTab.url === 'about:blank' ? '' : activeTab.url)
    }
  }, [activeTab?.id, activeTab?.url, isEditingUrl])

  // Extract distinct profiles in this group
  const profilesMap = new Map<string, { id: string; name: string; number: number; color: string }>()
  workspace?.tabs.forEach((tab) => {
    if (!profilesMap.has(tab.profileId)) {
      profilesMap.set(tab.profileId, {
        id: tab.profileId,
        name: tab.profileName,
        number: tab.profileNumber,
        color: tab.color,
      })
    }
  })
  const profiles = Array.from(profilesMap.values())
  const currentProfile = profiles.find((p) => p.id === activeTab?.profileId) || profiles[0]
  const theme = getArcTheme(currentProfile?.color)

  function handleSwitchTab(tabId: string) {
    setIsEditingUrl(false)
    void window.profileBrowser?.workspaceSwitchTab(tabId)
  }

  function handleCloseTab(e: React.MouseEvent, tabId: string) {
    e.stopPropagation()
    void window.profileBrowser?.workspaceCloseTab(tabId)
  }

  function handleNewTabForProfile(profileId?: string) {
    const targetPid = profileId || currentProfile?.id
    if (!targetPid) return
    focusAndSelectOmnibox(true)
    void window.profileBrowser?.workspaceNewTab(targetPid, 'about:blank')
  }

  function handleGoBack() {
    if (activeTab?.canGoBack) void window.profileBrowser?.workspaceGoBack(activeTab.id)
  }

  function handleGoForward() {
    if (activeTab?.canGoForward) void window.profileBrowser?.workspaceGoForward(activeTab.id)
  }

  function handleReload() {
    if (activeTab) void window.profileBrowser?.workspaceReload(activeTab.id)
  }

  function handleNavigate(e: React.FormEvent) {
    e.preventDefault()
    if (!activeTab) return
    const target = urlInput.trim()
    if (!target) return
    setIsEditingUrl(false)
    omniboxInputRef.current?.blur()
    void window.profileBrowser?.workspaceNavigate(activeTab.id, target)
  }

  function handlePickColor(pal: ArcPalette) {
    if (!currentProfile) return
    void window.profileBrowser?.workspaceSetProfileColor(currentProfile.id, pal.bg)
  }

  const sharedBookmarks = workspace?.sharedBookmarks || workspace?.bookmarks || []
  const profileBookmarks = (activeTab?.profileId && workspace?.profileBookmarks?.[activeTab.profileId]) || []

  const isBookmarkedInShared = Boolean(
    activeTab?.url &&
      sharedBookmarks.some((b) => b.url === activeTab.url || b.url === activeTab.url.replace(/\/$/, ''))
  )
  const isBookmarkedInProfile = Boolean(
    activeTab?.url &&
      profileBookmarks.some((b) => b.url === activeTab.url || b.url === activeTab.url.replace(/\/$/, ''))
  )
  const isBookmarked = isBookmarkedInShared || isBookmarkedInProfile

  function handleToggleBookmark() {
    if (!activeTab || !activeTab.url || activeTab.url === 'about:blank') return
    if (isBookmarkedInShared) {
      void window.profileBrowser?.workspaceRemoveBookmark(activeTab.profileId, activeTab.url, 'shared')
    } else if (isBookmarkedInProfile) {
      void window.profileBrowser?.workspaceRemoveBookmark(activeTab.profileId, activeTab.url, 'profile')
    } else {
      void window.profileBrowser?.workspaceAddBookmark(
        activeTab.profileId,
        activeTab.title || activeTab.url,
        activeTab.url,
        'shared',
        activeTab.favicon
      )
    }
  }

  // 100% 灵敏点击：直接在当前活动 Tab 中打开目标网页
  function handleBookmarkClick(url: string) {
    if (!activeTab) return
    setUrlInput(url)
    setIsEditingUrl(false)
    void window.profileBrowser?.workspaceNavigate(activeTab.id, url)
  }

  function handleRemoveBookmark(e: React.MouseEvent, url: string, scope: 'shared' | 'profile') {
    e.stopPropagation()
    if (!activeTab) return
    void window.profileBrowser?.workspaceRemoveBookmark(activeTab.profileId, url, scope)
  }

  function handleNewTabWithUrl(url: string) {
    if (!activeTab) return
    setContextMenu({ visible: false, x: 0, y: 0, bookmark: null, scope: 'shared' })
    void window.profileBrowser?.workspaceNewTab(activeTab.profileId, url)
  }

  function handleShowBookmarkContextMenu(
    e: React.MouseEvent,
    bm: { name: string; url: string } | null,
    scope: 'shared' | 'profile'
  ) {
    e.preventDefault()
    e.stopPropagation()
    if (!activeTab) return
    const x = Math.round(e.clientX)
    const y = Math.round(e.clientY)
    void window.profileBrowser?.workspaceShowBookmarkMenu?.(activeTab.profileId, bm, scope, x, y)
  }

  function handleOpenRenameModal(bm: { name: string; url: string }, scope: 'shared' | 'profile') {
    void window.profileBrowser?.workspaceSetModalActive?.(true)
    setEditModal({
      open: true,
      isNew: false,
      isRenameOnly: true,
      oldUrl: bm.url,
      name: bm.name.replace(/^[🌐\s]+/, '').trim() || bm.name,
      url: bm.url,
      scope,
    })
  }

  function handleOpenEditModal(bm: { name: string; url: string } | null, scope: 'shared' | 'profile') {
    void window.profileBrowser?.workspaceSetModalActive?.(true)
    if (bm) {
      setEditModal({
        open: true,
        isNew: false,
        isRenameOnly: false,
        oldUrl: bm.url,
        name: bm.name.replace(/^[🌐\s]+/, '').trim() || bm.name,
        url: bm.url,
        scope,
      })
    } else {
      setEditModal({
        open: true,
        isNew: true,
        isRenameOnly: false,
        oldUrl: '',
        name: activeTab?.title || '',
        url: activeTab?.url && !activeTab.url.startsWith('chrome://') ? activeTab.url : 'https://',
        scope,
      })
    }
  }

  function handleCloseEditModal() {
    void window.profileBrowser?.workspaceSetModalActive?.(false)
    setEditModal({ open: false, isNew: false, isRenameOnly: false, oldUrl: '', name: '', url: '', scope: 'shared' })
  }

  function handleSaveEditModal() {
    if (!editModal.url.trim()) return
    const cleanUrl = editModal.url.trim()
    const cleanName = editModal.name.trim() || cleanUrl
    const targetScope = editModal.scope

    if (editModal.isNew) {
      if (activeTab) {
        void window.profileBrowser?.workspaceAddBookmark(activeTab.profileId, cleanName, cleanUrl, targetScope, activeTab.favicon)
      }
    } else {
      if (activeTab) {
        void window.profileBrowser?.workspaceUpdateBookmark?.(
          activeTab.profileId,
          editModal.oldUrl,
          cleanName,
          cleanUrl,
          targetScope
        )
      }
    }
    handleCloseEditModal()
  }

  function handleMoveScope(bm: { name: string; url: string }, targetScope: 'shared' | 'profile') {
    if (!activeTab) return
    setContextMenu({ visible: false, x: 0, y: 0, bookmark: null, scope: 'shared' })
    void window.profileBrowser?.workspaceMoveBookmarkScope?.(activeTab.profileId, bm, targetScope)
  }

  function handleCopyUrl(url: string) {
    void navigator.clipboard.writeText(url)
    setContextMenu({ visible: false, x: 0, y: 0, bookmark: null, scope: 'shared' })
  }

  function handleLockDragStart(e: React.DragEvent) {
    if (!activeTab?.url || activeTab.url.startsWith('chrome://')) return
    const cleanName = activeTab.title || activeTab.url
    const dragData = {
      type: 'bookmark',
      name: cleanName,
      url: activeTab.url,
      favicon: activeTab.favicon,
    }
    e.dataTransfer.setData('text/plain', activeTab.url)
    e.dataTransfer.setData('text/uri-list', activeTab.url)
    e.dataTransfer.setData('application/json', JSON.stringify(dragData))
    e.dataTransfer.effectAllowed = 'copy'
  }

  function handleBarDrop(e: React.DragEvent, scope: 'shared' | 'profile') {
    e.preventDefault()
    setIsDragOverShared(false)
    setIsDragOverProfile(false)
    if (!activeTab) return

    try {
      const jsonStr = e.dataTransfer.getData('application/json')
      if (jsonStr) {
        const data = JSON.parse(jsonStr)
        if (data.type === 'bookmark' && data.url) {
          void window.profileBrowser?.workspaceAddBookmark(activeTab.profileId, data.name || data.url, data.url, scope, data.favicon || activeTab.favicon)
          return
        }
      }
    } catch {}

    const uri = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
    if (uri && (uri.startsWith('http://') || uri.startsWith('https://'))) {
      void window.profileBrowser?.workspaceAddBookmark(activeTab.profileId, activeTab.title || uri, uri, scope, activeTab.favicon)
    }
  }

  function handleBookmarkDragStart(e: React.DragEvent, idx: number, scope: 'shared' | 'profile') {
    setDraggedBookmarkIndex({ idx, scope })
    e.dataTransfer.setData('application/x-bm-idx', String(idx))
    e.dataTransfer.setData('application/x-bm-scope', scope)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleBookmarkDropOnIndex(e: React.DragEvent, targetIdx: number, targetScope: 'shared' | 'profile') {
    e.preventDefault()
    e.stopPropagation()
    const srcStr = e.dataTransfer.getData('application/x-bm-idx')
    const srcScope = e.dataTransfer.getData('application/x-bm-scope') as 'shared' | 'profile'
    if (srcStr !== '' && activeTab) {
      const srcIdx = Number(srcStr)
      if (srcScope === targetScope) {
        const list = targetScope === 'shared' ? [...sharedBookmarks] : [...profileBookmarks]
        if (srcIdx !== targetIdx && !Number.isNaN(srcIdx)) {
          const [item] = list.splice(srcIdx, 1)
          list.splice(targetIdx, 0, item)
          void window.profileBrowser?.workspaceReorderBookmarks?.(activeTab.profileId, list, targetScope)
        }
      }
    }
    setDraggedBookmarkIndex(null)
  }



  // 全局点击自动关闭书签右键菜单
  useEffect(() => {
    function handleClickOutside() {
      if (contextMenu.visible) {
        setContextMenu({ visible: false, x: 0, y: 0, bookmark: null, scope: 'shared' })
      }
    }
    window.addEventListener('click', handleClickOutside)
    return () => {
      window.removeEventListener('click', handleClickOutside)
    }
  }, [contextMenu.visible])

  if (!workspace) {
    return (
      <div className="arc-loading-screen" style={{ backgroundColor: '#8ee2b5' }}>
        <div className="arc-spinner" />
        <p>正在启动聚合工作台…</p>
      </div>
    )
  }

  return (
    <div
      className="arc-workspace-root"
      style={
        {
          backgroundColor: theme.bg,
          '--arc-bg': theme.bg,
          '--arc-sidebar': theme.sidebar,
          '--arc-highlight': theme.highlight,
          '--arc-text': theme.text,
          '--arc-dot': theme.dot,
        } as React.CSSProperties
      }
    >
      {/* 1. 左侧侧边栏 (260px) */}
      <aside className="arc-sidebar">
        {/* 顶部交通灯留白 */}
        <div className="arc-sidebar-top">
          <div className="arc-traffic-spacer" />
          <span className="arc-group-badge-title">{workspace.groupName}</span>
        </div>

        {/* Profile 切颜色面板 */}
        <div className="arc-color-switcher-bar">
          <div className="arc-color-header">
            <span>
              #{currentProfile?.number} {currentProfile?.name}
            </span>
            <button
              type="button"
              className="arc-color-toggle-btn"
              title="切换此账号的 Arc 主题颜色"
              onClick={() => setShowColorPicker(!showColorPicker)}
            >
              <Palette size={13} />
              <span>切颜色</span>
            </button>
          </div>

          <div className="arc-palette-dots-row">
            {ARC_PALETTES.map((pal) => {
              const isSelected = getArcTheme(currentProfile?.color).id === pal.id
              return (
                <button
                  key={pal.id}
                  type="button"
                  className={`arc-palette-dot-btn ${isSelected ? 'selected' : ''}`}
                  style={{ backgroundColor: pal.dot }}
                  title={pal.name}
                  onClick={() => handlePickColor(pal)}
                />
              )
            })}
          </div>
        </div>

        {/* 核心回归：每个 Profile 上面有它的 Profile 标题作为分割 */}
        <div className="arc-tabs-list">
          {profiles.map((p) => {
            const profileTabs = workspace.tabs.filter((t) => t.profileId === p.id)
            const pTheme = getArcTheme(p.color)
            const isProfileActive = p.id === currentProfile?.id

            return (
              <div key={p.id} className="arc-profile-section">
                {/* Profile Section Header 优雅分组标签卡片 */}
                <div
                  className={`arc-section-header ${isProfileActive ? 'active-section' : ''}`}
                  onClick={() => {
                    const firstTab = profileTabs[0]
                    if (firstTab) handleSwitchTab(firstTab.id)
                  }}
                  title={`切换到 #${p.number} ${p.name}`}
                >
                  <span className="arc-section-indicator" style={{ backgroundColor: pTheme.dot }} />
                  <span
                    className="arc-section-badge"
                    style={{ backgroundColor: `${pTheme.dot}28`, color: pTheme.highlight }}
                  >
                    #{p.number}
                  </span>
                  <span className="arc-section-name">{p.name}</span>
                  <span className="arc-section-count" title={`${profileTabs.length} 个标签页`}>
                    {profileTabs.length}
                  </span>
                  <button
                    type="button"
                    className="arc-section-add-btn"
                    title={`为 #${p.number} ${p.name} 新开标签页`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleNewTabForProfile(p.id)
                    }}
                  >
                    <Plus size={12} />
                  </button>
                </div>

                {/* 该 Profile 下的具体标签列表（带层级指引） */}
                <div className="arc-section-tabs">
                  {profileTabs.map((tab) => {
                    const isActive = tab.id === workspace.activeTabId
                    return (
                      <div
                        key={tab.id}
                        className={`arc-tab-item ${isActive ? 'active' : ''}`}
                        onClick={() => handleSwitchTab(tab.id)}
                        title={`${tab.title || tab.profileName}\n${tab.url}`}
                      >
                        <span className="arc-tab-dot" style={{ backgroundColor: pTheme.dot }} />
                        {tab.favicon ? (
                          <img
                            src={tab.favicon}
                            alt=""
                            className="arc-tab-favicon"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none'
                            }}
                          />
                        ) : (
                          <Globe size={13} className="arc-tab-default-icon" style={{ color: pTheme.highlight }} />
                        )}
                        <span className="arc-tab-title">{tab.title || tab.profileName}</span>
                        <button
                          type="button"
                          className="arc-tab-close-btn"
                          aria-label="关闭标签"
                          onClick={(e) => handleCloseTab(e, tab.id)}
                        >
                          <X size={11} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* 侧边栏底栏 */}
        <div className="arc-sidebar-bottom">
          <small className="arc-isolation-note" title="各 Profile 独立持久化 Partition，严格物理隔离不串号">
            <ShieldCheck size={13} /> 物理隔离 · 绝对零串号
          </small>
          <button
            type="button"
            className="arc-bottom-new-btn"
            title="在当前激活账号下新建标签页"
            onClick={() => handleNewTabForProfile(currentProfile?.id)}
          >
            <Plus size={14} />
            <span>New Tab</span>
          </button>
        </div>
      </aside>

      {/* 2. 右侧界面：采用 Google Chrome 官方原版风格 (Toolbar + Bookmarks Bar) */}
      <main className="arc-main-area">
        {/* 第一行：官方 Chrome 原版导航栏与地址栏 (高 42px) */}
        <header className="arc-chrome-toolbar official-chrome-toolbar">
          <div className="arc-chrome-nav">
            <button
              type="button"
              className="arc-chrome-btn"
              disabled={!activeTab?.canGoBack}
              onClick={handleGoBack}
              title="后退"
            >
              <ArrowLeft size={16} />
            </button>
            <button
              type="button"
              className="arc-chrome-btn"
              disabled={!activeTab?.canGoForward}
              onClick={handleGoForward}
              title="前进"
            >
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              className={`arc-chrome-btn ${activeTab?.loading ? 'spin-icon' : ''}`}
              onClick={handleReload}
              title="刷新"
            >
              <RotateCw size={15} />
            </button>
          </div>

          {/* 官方原版 Chrome 药丸形地址栏 */}
          <form className="arc-chrome-omnibox-form" onSubmit={handleNavigate}>
            {(() => {
              const isBlankOmnibox = !urlInput.trim() || activeTab?.url === 'about:blank'
              return (
                <div
                  className={`arc-chrome-omnibox official-chrome-omnibox ${
                    isBlankOmnibox ? 'is-blank-page' : 'has-url-page'
                  }`}
                >
                  {isBlankOmnibox ? (
                    <div className="arc-chrome-g-handle" title="在 Google 上搜索，或输入网址">
                      <GoogleColoredGIcon />
                    </div>
                  ) : (
                    <div
                      className="arc-chrome-lock-handle"
                      draggable={Boolean(activeTab?.url && !activeTab.url.startsWith('chrome://'))}
                      onDragStart={handleLockDragStart}
                      title="拖拽此小锁到书签栏可直接收藏"
                    >
                      <Lock size={13} className="arc-lock-icon" />
                    </div>
                  )}
                  <input
                    ref={omniboxInputRef}
                    type="text"
                    className="arc-chrome-input official-chrome-input"
                    value={urlInput}
                    onFocus={() => {
                      setIsEditingUrl(true)
                      void window.profileBrowser?.workspaceFocusWindow?.()
                    }}
                    onBlur={() => setIsEditingUrl(false)}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder={isBlankOmnibox ? '在 Google 上搜索，或输入网址' : '输入网址或 Google 搜索 (⌘L)…'}
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className={`arc-omnibox-star-btn ${isBookmarked ? 'bookmarked' : ''}`}
                    onClick={handleToggleBookmark}
                    title={isBookmarked ? '已收藏（点击取消）' : '收藏此页面到书签栏 (⌘D)'}
                  >
                    <Star size={14} className={isBookmarked ? 'star-filled' : 'star-outline'} />
                  </button>
                </div>
              )
            })()}
          </form>

          {/* 当前环境身份徽章 */}
          {activeTab && (
            <div
              className="arc-chrome-profile-badge"
              style={{
                borderColor: `${theme.highlight}44`,
                backgroundColor: 'rgba(255, 255, 255, 0.85)',
              }}
              title={`当前环境：${activeTab.profileName}（独立 Cookie，隔离运行）`}
            >
              <span className="arc-badge-dot" style={{ backgroundColor: theme.highlight }} />
              <span className="arc-badge-text">
                #{activeTab.profileNumber} {activeTab.profileName}
              </span>
            </div>
          )}
        </header>

        {/* 第二行：官方 Chrome 原版书签栏 (高 30px，分两种：🌐公共收藏 + 👤本号专属收藏) */}
        <div className="arc-chrome-bookmarks-bar official-chrome-bookmarks-bar">
          {/* 1. 公共收藏区 (所有环境共用) */}
          <div
            className={`arc-bookmarks-zone arc-shared-zone ${isDragOverShared ? 'drag-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
              if (!isDragOverShared) setIsDragOverShared(true)
            }}
            onDragLeave={() => setIsDragOverShared(false)}
            onDrop={(e) => handleBarDrop(e, 'shared')}
            onContextMenu={(e) => handleShowBookmarkContextMenu(e, null, 'shared')}
            title="公共收藏区：组内所有号共用。拖拽小锁至此可添加公共书签"
          >
            <div className="arc-bookmark-pill official-bookmark-pill arc-folder-item" title="公共收藏夹（所有环境共用）">
              <ChromeFolderIcon />
              <span className="arc-bm-name">公共收藏</span>
            </div>
            {sharedBookmarks.length > 0 ? (
              sharedBookmarks.map((bm, idx) => {
                const cleanName = bm.name.replace(/^[🌐\s]+/, '').trim() || bm.name
                const isHideTitle = Boolean(bm.hideTitle)
                const isItemDragging =
                  draggedBookmarkIndex?.scope === 'shared' && draggedBookmarkIndex.idx === idx
                return (
                  <div
                    key={`${bm.url}-${idx}`}
                    className={`arc-bookmark-pill official-bookmark-pill ${isHideTitle ? 'icon-only' : ''} ${isItemDragging ? 'is-dragging' : ''}`}
                    draggable
                    onDragStart={(e) => handleBookmarkDragStart(e, idx, 'shared')}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    onDrop={(e) => handleBookmarkDropOnIndex(e, idx, 'shared')}
                    onClick={() => handleBookmarkClick(bm.url)}
                    onContextMenu={(e) => handleShowBookmarkContextMenu(e, bm, 'shared')}
                    title={`${cleanName}\n${bm.url}\n（🌐公共收藏 · 右键可设置仅显示图标）`}
                    role="button"
                    tabIndex={0}
                  >
                    <BookmarkFavicon url={bm.url} faviconCache={workspace?.faviconCache} isIconOnly={isHideTitle} />
                    {!isHideTitle && <span className="arc-bm-name">{cleanName}</span>}
                  </div>
                )
              })
            ) : (
              <span className="arc-zone-empty-tip">拖入 🔒 存为公共</span>
            )}
          </div>

          {/* 中间区隔竖线 */}
          <div className="arc-bookmarks-section-divider" />

          {/* 2. 本号专属收藏区 (仅当前号独享，切号自动跟随切换) */}
          {activeTab && (
            <div
              className={`arc-bookmarks-zone arc-profile-zone ${isDragOverProfile ? 'drag-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
                if (!isDragOverProfile) setIsDragOverProfile(true)
              }}
              onDragLeave={() => setIsDragOverProfile(false)}
              onDrop={(e) => handleBarDrop(e, 'profile')}
              onContextMenu={(e) => handleShowBookmarkContextMenu(e, null, 'profile')}
              title={`专属收藏区：仅 #${activeTab.profileNumber} ${activeTab.profileName} 独享`}
            >
              <div className="arc-bookmark-pill official-bookmark-pill arc-folder-item arc-profile-folder-item" title={`专属收藏区：仅 #${activeTab.profileNumber} ${activeTab.profileName} 独享`}>
                <ChromeFolderIcon />
                <span className="arc-bm-name">专属收藏</span>
              </div>
              {profileBookmarks.length > 0 ? (
                profileBookmarks.map((bm, idx) => {
                  const cleanName = bm.name.replace(/^[🌐\s]+/, '').trim() || bm.name
                  const isHideTitle = Boolean(bm.hideTitle)
                  const isItemDragging =
                    draggedBookmarkIndex?.scope === 'profile' && draggedBookmarkIndex.idx === idx
                  return (
                    <div
                      key={`${bm.url}-${idx}`}
                      className={`arc-bookmark-pill official-bookmark-pill arc-profile-bm-pill ${isHideTitle ? 'icon-only' : ''} ${isItemDragging ? 'is-dragging' : ''}`}
                      draggable
                      onDragStart={(e) => handleBookmarkDragStart(e, idx, 'profile')}
                      onDragOver={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                      }}
                      onDrop={(e) => handleBookmarkDropOnIndex(e, idx, 'profile')}
                      onClick={() => handleBookmarkClick(bm.url)}
                      onContextMenu={(e) => handleShowBookmarkContextMenu(e, bm, 'profile')}
                      title={`${cleanName}\n${bm.url}\n（👤#${activeTab.profileNumber}专属 · 右键可设置仅显示图标）`}
                      role="button"
                      tabIndex={0}
                    >
                      <BookmarkFavicon url={bm.url} faviconCache={workspace?.faviconCache} isIconOnly={isHideTitle} />
                      {!isHideTitle && <span className="arc-bm-name">{cleanName}</span>}
                    </div>
                  )
                })
              ) : (
                <span className="arc-zone-empty-tip">拖入 🔒 存为本号专属</span>
              )}
            </div>
          )}
        </div>

        {/* 加载进度指示条 */}
        {activeTab?.loading && (
          <div className="arc-chrome-progress-bar">
            <div className="arc-chrome-progress-inner" style={{ backgroundColor: theme.highlight }} />
          </div>
        )}
      </main>

      {/* 编辑/重命名书签模态对话框 (Modal) - 原生居中无遮挡 */}
      {editModal.open && (
        <div className="arc-modal-overlay" onClick={handleCloseEditModal}>
          <div className="arc-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="arc-modal-header">
              <span className="arc-modal-title">
                {editModal.isRenameOnly ? '重命名书签' : editModal.isNew ? '添加书签' : '编辑书签'}
              </span>
              <button
                type="button"
                className="arc-modal-close"
                onClick={handleCloseEditModal}
              >
                ×
              </button>
            </div>
            <div className="arc-modal-body">
              {/* 仅在完整编辑/新增模式下展示归属分类 */}
              {!editModal.isRenameOnly && (
                <div className="arc-modal-field">
                  <span className="arc-field-label">收藏类型</span>
                  <div className="arc-scope-selector">
                    <button
                      type="button"
                      className={`arc-scope-option ${editModal.scope === 'shared' ? 'active' : ''}`}
                      onClick={() => setEditModal({ ...editModal, scope: 'shared' })}
                    >
                      <Globe size={13} />
                      <span>🌐 公共收藏（所有号可见）</span>
                    </button>
                    <button
                      type="button"
                      className={`arc-scope-option ${editModal.scope === 'profile' ? 'active' : ''}`}
                      onClick={() => setEditModal({ ...editModal, scope: 'profile' })}
                    >
                      <User size={13} />
                      <span>👤 #{activeTab?.profileNumber} 专属（仅本环境可见）</span>
                    </button>
                  </div>
                </div>
              )}

              <label className="arc-modal-field">
                <span className="arc-field-label">名称</span>
                <input
                  type="text"
                  className="arc-field-input"
                  value={editModal.name}
                  onChange={(e) => setEditModal({ ...editModal, name: e.target.value })}
                  placeholder="书签名称"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveEditModal()
                  }}
                />
              </label>

              {!editModal.isRenameOnly && (
                <label className="arc-modal-field">
                  <span className="arc-field-label">网址</span>
                  <input
                    type="text"
                    className="arc-field-input"
                    value={editModal.url}
                    onChange={(e) => setEditModal({ ...editModal, url: e.target.value })}
                    placeholder="https://…"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEditModal()
                    }}
                  />
                </label>
              )}
            </div>
            <div className="arc-modal-footer">
              <button
                type="button"
                className="arc-modal-btn btn-secondary"
                onClick={handleCloseEditModal}
              >
                取消
              </button>
              <button
                type="button"
                className="arc-modal-btn btn-primary"
                onClick={handleSaveEditModal}
                disabled={!editModal.name.trim() || (!editModal.isRenameOnly && !editModal.url.trim())}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

class WorkspaceErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[WorkspaceErrorBoundary] Caught workspace render error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: 'system-ui', color: '#333' }}>
          <h3>工作区遇到渲染异常，正在自动恢复…</h3>
          <p style={{ color: '#666', fontSize: 13 }}>{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              background: '#1a73e8',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            重新加载界面
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export function GroupWorkspace() {
  return (
    <WorkspaceErrorBoundary>
      <GroupWorkspaceInner />
    </WorkspaceErrorBoundary>
  )
}
