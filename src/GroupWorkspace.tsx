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

export function GroupWorkspace() {
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

  useEffect(() => {
    // 初始获取工作台状态
    void window.profileBrowser?.workspaceGetState().then((state) => {
      if (state) {
        setWorkspace(state)
        const active = state.tabs.find((t) => t.id === state.activeTabId)
        if (active) setUrlInput(active.url)
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
      } else if (payload.action === 'edit' && payload.bookmark) {
        handleOpenEditModal(payload.bookmark, payload.scope || 'shared')
      } else if (payload.action === 'add') {
        handleOpenEditModal(null, payload.scope || 'shared')
      }
    })

    return () => {
      if (unsubscribe) unsubscribe()
      if (unsubTrigger) unsubTrigger()
    }
  }, [])

  useEffect(() => {
    if (activeTab && !isEditingUrl) {
      setUrlInput(activeTab.url)
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
    setIsEditingUrl(false)
    void window.profileBrowser?.workspaceNewTab(targetPid, 'https://www.google.com')
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
    if (isBookmarkedInProfile) {
      void window.profileBrowser?.workspaceRemoveBookmark(activeTab.profileId, activeTab.url, 'profile')
    } else if (isBookmarkedInShared) {
      void window.profileBrowser?.workspaceRemoveBookmark(activeTab.profileId, activeTab.url, 'shared')
    } else {
      void window.profileBrowser?.workspaceAddBookmark(
        activeTab.profileId,
        activeTab.title || activeTab.url,
        activeTab.url,
        'profile'
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
    void window.profileBrowser?.workspaceShowBookmarkMenu?.(activeTab.profileId, bm, scope)
  }

  function handleOpenEditModal(bm: { name: string; url: string } | null, scope: 'shared' | 'profile') {
    void window.profileBrowser?.workspaceSetModalActive?.(true)
    if (bm) {
      setEditModal({
        open: true,
        isNew: false,
        oldUrl: bm.url,
        name: bm.name.replace(/^[🌐\s]+/, '').trim() || bm.name,
        url: bm.url,
        scope,
      })
    } else {
      setEditModal({
        open: true,
        isNew: true,
        oldUrl: '',
        name: activeTab?.title || '',
        url: activeTab?.url && !activeTab.url.startsWith('chrome://') ? activeTab.url : 'https://',
        scope,
      })
    }
  }

  function handleCloseEditModal() {
    void window.profileBrowser?.workspaceSetModalActive?.(false)
    setEditModal({ open: false, isNew: false, oldUrl: '', name: '', url: '', scope: 'shared' })
  }

  function handleSaveEditModal() {
    if (!editModal.url.trim()) return
    const cleanUrl = editModal.url.trim()
    const cleanName = editModal.name.trim() || cleanUrl
    const targetScope = editModal.scope

    if (editModal.isNew) {
      if (activeTab) {
        void window.profileBrowser?.workspaceAddBookmark(activeTab.profileId, cleanName, cleanUrl, targetScope)
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
          void window.profileBrowser?.workspaceAddBookmark(activeTab.profileId, data.name || data.url, data.url, scope)
          return
        }
      }
    } catch {}

    const uri = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
    if (uri && (uri.startsWith('http://') || uri.startsWith('https://'))) {
      void window.profileBrowser?.workspaceAddBookmark(activeTab.profileId, activeTab.title || uri, uri, scope)
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

  // 快捷键支持 (Cmd+L 聚焦地址栏 / Cmd+D 加收藏)
  useEffect(() => {
    const unsub = window.profileBrowser?.onFocusOmnibox?.(() => {
      omniboxInputRef.current?.focus()
      omniboxInputRef.current?.select()
    })

    function handleKeyDown(e: KeyboardEvent) {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey
      if (isCmdOrCtrl && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        omniboxInputRef.current?.focus()
        omniboxInputRef.current?.select()
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        handleToggleBookmark()
      } else if (e.key === 'Escape') {
        if (contextMenu.visible) {
          setContextMenu({ visible: false, x: 0, y: 0, bookmark: null })
        }
        if (editModal.open) {
          setEditModal({ open: false, isNew: false, oldUrl: '', name: '', url: '' })
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      unsub?.()
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeTab, isBookmarked, contextMenu.visible, editModal.open])

  // 全局点击自动关闭书签右键菜单
  useEffect(() => {
    function handleClickOutside() {
      if (contextMenu.visible) {
        setContextMenu({ visible: false, x: 0, y: 0, bookmark: null })
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
                {/* Profile Section Header 标题分割栏 */}
                <div className={`arc-section-header ${isProfileActive ? 'active-section' : ''}`}>
                  <span className="arc-section-dot" style={{ backgroundColor: pTheme.dot }} />
                  <span className="arc-section-name">
                    #{p.number} {p.name}
                  </span>
                  <span className="arc-section-count">{profileTabs.length}</span>
                  <button
                    type="button"
                    className="arc-section-add-btn"
                    title={`为 #${p.number} ${p.name} 新开标签页`}
                    onClick={() => handleNewTabForProfile(p.id)}
                  >
                    <Plus size={13} />
                  </button>
                </div>

                {/* 该 Profile 下的具体标签列表 */}
                <div className="arc-section-tabs">
                  {profileTabs.map((tab) => {
                    const isActive = tab.id === workspace.activeTabId
                    return (
                      <div
                        key={tab.id}
                        className={`arc-tab-item ${isActive ? 'active' : ''}`}
                        onClick={() => handleSwitchTab(tab.id)}
                        title={`${tab.profileName} · ${tab.title || tab.url}`}
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
                        <span className="arc-tab-title">
                          <strong>#{tab.profileNumber}</strong> {tab.title || tab.profileName}
                        </span>
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
            <div className="arc-chrome-omnibox official-chrome-omnibox">
              <div
                className="arc-chrome-lock-handle"
                draggable={Boolean(activeTab?.url && !activeTab.url.startsWith('chrome://'))}
                onDragStart={handleLockDragStart}
                title="拖拽此小锁到书签栏可直接收藏"
              >
                <Lock size={13} className="arc-lock-icon" />
              </div>
              <input
                ref={omniboxInputRef}
                type="text"
                className="arc-chrome-input official-chrome-input"
                value={urlInput}
                onFocus={() => setIsEditingUrl(true)}
                onBlur={() => setIsEditingUrl(false)}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="输入网址或 Google 搜索 (⌘L)…"
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
            <span className="arc-shared-badge">
              <Globe size={11} /> 公共收藏
            </span>
            {sharedBookmarks.length > 0 ? (
              sharedBookmarks.map((bm, idx) => {
                const cleanName = bm.name.replace(/^[🌐\s]+/, '').trim() || bm.name
                const isItemDragging =
                  draggedBookmarkIndex?.scope === 'shared' && draggedBookmarkIndex.idx === idx
                return (
                  <div
                    key={`${bm.url}-${idx}`}
                    className={`arc-bookmark-pill official-bookmark-pill ${isItemDragging ? 'is-dragging' : ''}`}
                    draggable
                    onDragStart={(e) => handleBookmarkDragStart(e, idx, 'shared')}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    onDrop={(e) => handleBookmarkDropOnIndex(e, idx, 'shared')}
                    onClick={() => handleBookmarkClick(bm.url)}
                    onContextMenu={(e) => handleShowBookmarkContextMenu(e, bm, 'shared')}
                    title={`${cleanName}\n${bm.url}\n（🌐公共收藏 · 右键可转为本号专属）`}
                    role="button"
                    tabIndex={0}
                  >
                    <Globe size={12} className="arc-bm-icon" />
                    <span className="arc-bm-name">{cleanName}</span>
                    <button
                      type="button"
                      className="arc-bm-del"
                      title="删除此公共收藏"
                      onClick={(e) => handleRemoveBookmark(e, bm.url, 'shared')}
                    >
                      ×
                    </button>
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
              <span
                className="arc-profile-bm-badge"
                style={{
                  borderColor: `${theme.highlight}55`,
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                }}
              >
                <span className="arc-profile-bm-dot" style={{ backgroundColor: theme.highlight }} />
                <User size={11} />
                <span>#{activeTab.profileNumber} 专属</span>
              </span>
              {profileBookmarks.length > 0 ? (
                profileBookmarks.map((bm, idx) => {
                  const cleanName = bm.name.replace(/^[🌐\s]+/, '').trim() || bm.name
                  const isItemDragging =
                    draggedBookmarkIndex?.scope === 'profile' && draggedBookmarkIndex.idx === idx
                  return (
                    <div
                      key={`${bm.url}-${idx}`}
                      className={`arc-bookmark-pill official-bookmark-pill arc-profile-bm-pill ${isItemDragging ? 'is-dragging' : ''}`}
                      draggable
                      onDragStart={(e) => handleBookmarkDragStart(e, idx, 'profile')}
                      onDragOver={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                      }}
                      onDrop={(e) => handleBookmarkDropOnIndex(e, idx, 'profile')}
                      onClick={() => handleBookmarkClick(bm.url)}
                      onContextMenu={(e) => handleShowBookmarkContextMenu(e, bm, 'profile')}
                      title={`${cleanName}\n${bm.url}\n（👤#${activeTab.profileNumber}专属 · 右键可转为公共）`}
                      role="button"
                      tabIndex={0}
                    >
                      <span className="arc-item-mini-dot" style={{ backgroundColor: theme.highlight }} />
                      <span className="arc-bm-name">{cleanName}</span>
                      <button
                        type="button"
                        className="arc-bm-del"
                        title="删除此专属收藏"
                        onClick={(e) => handleRemoveBookmark(e, bm.url, 'profile')}
                      >
                        ×
                      </button>
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

      {/* 编辑书签模态对话框 (Modal) - 原生居中无遮挡 */}
      {editModal.open && (
        <div className="arc-modal-overlay" onClick={handleCloseEditModal}>
          <div className="arc-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="arc-modal-header">
              <span className="arc-modal-title">{editModal.isNew ? '添加书签' : '编辑书签'}</span>
              <button
                type="button"
                className="arc-modal-close"
                onClick={handleCloseEditModal}
              >
                ×
              </button>
            </div>
            <div className="arc-modal-body">
              {/* 收藏分类选择：公共 vs 本号专属 */}
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

              <label className="arc-modal-field">
                <span className="arc-field-label">名称</span>
                <input
                  type="text"
                  className="arc-field-input"
                  value={editModal.name}
                  onChange={(e) => setEditModal({ ...editModal, name: e.target.value })}
                  placeholder="书签名称"
                  autoFocus
                />
              </label>
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
            </div>
            <div className="arc-modal-footer">
              <button
                type="button"
                className="arc-modal-btn btn-secondary"
                onClick={() =>
                  setEditModal({ open: false, isNew: false, oldUrl: '', name: '', url: '', scope: 'shared' })
                }
              >
                取消
              </button>
              <button
                type="button"
                className="arc-modal-btn btn-primary"
                onClick={handleSaveEditModal}
                disabled={!editModal.url.trim()}
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
