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
  Pin,
  Folder,
  ChevronRight,
  ChevronDown,
  Palette,
  Star,
  ShieldCheck,
} from 'lucide-react'

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
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null)
  const [dragTargetId, setDragTargetId] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const omniboxInputRef = useRef<HTMLInputElement>(null)

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
      const active = state.tabs.find((t) => t.id === state.activeTabId)
      if (active && !isEditingUrl) {
        setUrlInput(active.url)
      }
    })

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [isEditingUrl])

  const activeTab = workspace?.tabs.find((t) => t.id === workspace.activeTabId)

  useEffect(() => {
    if (activeTab && !isEditingUrl) {
      setUrlInput(activeTab.url)
    }
  }, [activeTab?.id, activeTab?.url, isEditingUrl])

  // Distinct profiles in this group
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

  const isBookmarked = Boolean(
    activeTab?.url &&
      workspace?.bookmarks?.some((b) => b.url === activeTab.url || b.url === activeTab.url.replace(/\/$/, ''))
  )

  function handleToggleBookmark() {
    if (!activeTab || !activeTab.url || activeTab.url === 'about:blank') return
    if (isBookmarked) {
      void window.profileBrowser?.workspaceRemoveBookmark(activeTab.profileId, activeTab.url)
    } else {
      void window.profileBrowser?.workspaceAddBookmark(
        activeTab.profileId,
        activeTab.title || activeTab.url,
        activeTab.url
      )
    }
  }

  // 100% 保证可点击：直接在当前活动 Tab 中打开收藏网址
  function handleBookmarkClick(url: string) {
    if (!activeTab) return
    setUrlInput(url)
    setIsEditingUrl(false)
    void window.profileBrowser?.workspaceNavigate(activeTab.id, url)
  }

  function handleRemoveBookmark(e: React.MouseEvent, url: string) {
    e.stopPropagation()
    if (!activeTab) return
    void window.profileBrowser?.workspaceRemoveBookmark(activeTab.profileId, url)
  }

  // 快捷键支持 (Cmd+L / Cmd+D)
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
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      unsub?.()
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeTab, isBookmarked])

  // 拖拽常驻/收藏
  const handleDropToPinned = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const sourceTabId = e.dataTransfer.getData('text/plain') || draggingTabId
    if (sourceTabId) {
      void window.profileBrowser?.workspaceMoveTab?.(sourceTabId, undefined, true)
    }
    setDraggingTabId(null)
    setDragTargetId(null)
  }

  // 拖拽到指定分级分组
  const handleDropToGroup = (e: React.DragEvent, targetGroupId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const sourceTabId = e.dataTransfer.getData('text/plain') || draggingTabId
    if (sourceTabId) {
      void window.profileBrowser?.workspaceMoveTab?.(sourceTabId, targetGroupId, false)
    }
    setDraggingTabId(null)
    setDragTargetId(null)
  }

  const toggleGroupCollapse = (grpId: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [grpId]: !prev[grpId] }))
  }

  if (!workspace) {
    return (
      <div className="arc-loading-screen" style={{ backgroundColor: '#8ee2b5' }}>
        <div className="arc-spinner" />
        <p>正在启动聚合工作台…</p>
      </div>
    )
  }

  // 分离出常驻标签与分组标签
  const pinnedTabs = workspace.tabs.filter((t) => t.pinned)
  const unpinnedTabs = workspace.tabs.filter((t) => !t.pinned)

  // 按分组聚合
  const groupMap = new Map<string, { id: string; name: string; tabs: WorkspaceTab[] }>()
  unpinnedTabs.forEach((tab) => {
    const grpId = tab.groupId || 'default'
    const grpName = tab.groupName || '默认分组'
    if (!groupMap.has(grpId)) {
      groupMap.set(grpId, { id: grpId, name: grpName, tabs: [] })
    }
    groupMap.get(grpId)!.tabs.push(tab)
  })
  const tabGroups = Array.from(groupMap.values())

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
      {/* 左侧全功能侧边栏：260px 宽度，所有点击与拖拽 100% 丝滑无遮挡 */}
      <aside className="arc-sidebar">
        {/* 顶部交通灯安全边距 + 导航控制器 */}
        <div className="arc-sidebar-top">
          <div className="arc-traffic-spacer" />
          <div className="arc-nav-controls">
            <button
              type="button"
              className="arc-nav-btn"
              disabled={!activeTab?.canGoBack}
              onClick={handleGoBack}
              title="后退"
            >
              <ArrowLeft size={15} />
            </button>
            <button
              type="button"
              className="arc-nav-btn"
              disabled={!activeTab?.canGoForward}
              onClick={handleGoForward}
              title="前进"
            >
              <ArrowRight size={15} />
            </button>
            <button
              type="button"
              className={`arc-nav-btn ${activeTab?.loading ? 'spin-icon' : ''}`}
              onClick={handleReload}
              title="刷新"
            >
              <RotateCw size={14} />
            </button>
          </div>
        </div>

        {/* 左侧原生地址栏 / 搜索框 */}
        <div className="arc-search-pill-wrapper">
          <form className="arc-sidebar-omnibox-form" onSubmit={handleNavigate}>
            <div className="arc-sidebar-omnibox">
              <Lock size={12} className="arc-lock-icon" />
              <input
                ref={omniboxInputRef}
                type="text"
                className="arc-sidebar-omnibox-input"
                value={urlInput}
                onFocus={() => setIsEditingUrl(true)}
                onBlur={() => setIsEditingUrl(false)}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="输入网址或回车搜索 (⌘L)…"
                spellCheck={false}
              />
              <button
                type="button"
                className={`arc-sidebar-star-btn ${isBookmarked ? 'bookmarked' : ''}`}
                onClick={handleToggleBookmark}
                title={isBookmarked ? '已收藏（点击取消）' : '收藏此页到共用收藏夹 (⌘D)'}
              >
                <Star size={13} className={isBookmarked ? 'star-filled' : 'star-outline'} />
              </button>
            </div>
          </form>
        </div>

        {/* ⭐ 共用收藏夹栏（放在左侧侧边栏内，绝对不被 WebContentsView 遮盖，100% 能够点击秒开！） */}
        <div className="arc-sidebar-bookmarks-box">
          <div className="arc-sidebar-box-header">
            <span className="arc-box-title">
              <Star size={12} /> 共用收藏夹
            </span>
            <small>{workspace.bookmarks?.length || 0} 个</small>
          </div>
          <div className="arc-sidebar-bookmarks-pills">
            {workspace.bookmarks && workspace.bookmarks.length > 0 ? (
              workspace.bookmarks.map((bm) => (
                <div
                  key={bm.url}
                  className="arc-bookmark-pill"
                  onClick={() => handleBookmarkClick(bm.url)}
                  title={`${bm.name}\n${bm.url}（点击在当前环境打开）`}
                  role="button"
                  tabIndex={0}
                >
                  <Globe size={11} className="arc-bm-icon" />
                  <span className="arc-bm-name">{bm.name}</span>
                  <button
                    type="button"
                    className="arc-bm-del"
                    title="删除此收藏"
                    onClick={(e) => handleRemoveBookmark(e, bm.url)}
                  >
                    ×
                  </button>
                </div>
              ))
            ) : (
              <div className="arc-bookmarks-empty-tip">
                <span>在地址栏按 ⭐ 可收藏网址</span>
              </div>
            )}
          </div>
        </div>

        {/* 📌 常驻 / 拖拽收藏区（Pinned Tabs） */}
        <div
          className={`arc-pinned-section ${dragTargetId === '__pinned__' ? 'drag-over' : ''}`}
          onDragOver={(e) => {
            if (draggingTabId) {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDragTargetId('__pinned__')
            }
          }}
          onDragLeave={() => setDragTargetId(null)}
          onDrop={handleDropToPinned}
        >
          <div className="arc-section-title">
            <Pin size={12} />
            <span>常驻收藏 · 已放 {pinnedTabs.length} 个</span>
            <small style={{ fontSize: 10, opacity: 0.7 }}>可拖拽标签至此固定</small>
          </div>
          <div className="arc-pinned-items-grid">
            {pinnedTabs.map((tab) => {
              const isActive = tab.id === workspace.activeTabId
              return (
                <div
                  key={tab.id}
                  draggable
                  className={`arc-tab-item pinned-tab ${isActive ? 'active' : ''}`}
                  onClick={() => handleSwitchTab(tab.id)}
                  title={`[常驻] ${tab.profileName} · ${tab.title || tab.url}`}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', tab.id)
                    e.dataTransfer.effectAllowed = 'move'
                    setDraggingTabId(tab.id)
                  }}
                  onDragEnd={() => {
                    setDraggingTabId(null)
                    setDragTargetId(null)
                  }}
                >
                  <span className="arc-tab-dot" style={{ backgroundColor: tab.color }} />
                  {tab.favicon ? (
                    <img src={tab.favicon} alt="" className="arc-tab-favicon" onError={(e) => (e.currentTarget.style.display = 'none')} />
                  ) : (
                    <Globe size={13} className="arc-tab-default-icon" style={{ color: tab.color }} />
                  )}
                  <span className="arc-tab-title">{tab.title || tab.profileName}</span>
                  <button type="button" className="arc-tab-close-btn" aria-label="关闭标签" onClick={(e) => handleCloseTab(e, tab.id)}>
                    <X size={11} />
                  </button>
                </div>
              )
            })}
            {pinnedTabs.length === 0 && (
              <div className="arc-pinned-placeholder">拖拽下方环境标签到这里常驻</div>
            )}
          </div>
        </div>

        {/* 📁 分级标签分组区（Hierarchical Tab Groups） */}
        <div className="arc-tabs-list">
          {tabGroups.map((grp) => {
            const isCollapsed = Boolean(collapsedGroups[grp.id])
            const isDropTarget = dragTargetId === grp.id

            return (
              <div
                key={grp.id}
                className={`arc-profile-section ${isDropTarget ? 'drag-over' : ''}`}
                onDragOver={(e) => {
                  if (draggingTabId) {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDragTargetId(grp.id)
                  }
                }}
                onDragLeave={() => setDragTargetId(null)}
                onDrop={(e) => handleDropToGroup(e, grp.id)}
              >
                {/* 分组头部：带折叠展开箭头、分组名称、数量统计 */}
                <div className="arc-section-header" onClick={() => toggleGroupCollapse(grp.id)}>
                  <button type="button" className="arc-group-toggle-btn" title={isCollapsed ? '展开分组' : '收起分组'}>
                    {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  </button>
                  <Folder size={13} style={{ opacity: 0.8 }} />
                  <span className="arc-section-name">{grp.name}</span>
                  <span className="arc-section-count">{grp.tabs.length}</span>
                </div>

                {/* 分组内部的标签列表 */}
                {!isCollapsed && (
                  <div className="arc-section-tabs">
                    {grp.tabs.map((tab) => {
                      const isActive = tab.id === workspace.activeTabId
                      return (
                        <div
                          key={tab.id}
                          draggable
                          className={`arc-tab-item ${isActive ? 'active' : ''} ${draggingTabId === tab.id ? 'dragging' : ''}`}
                          onClick={() => handleSwitchTab(tab.id)}
                          title={`${tab.profileName} · ${tab.title || tab.url}`}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', tab.id)
                            e.dataTransfer.effectAllowed = 'move'
                            setDraggingTabId(tab.id)
                          }}
                          onDragEnd={() => {
                            setDraggingTabId(null)
                            setDragTargetId(null)
                          }}
                        >
                          <span className="arc-tab-dot" style={{ backgroundColor: tab.color }} />
                          {tab.favicon ? (
                            <img src={tab.favicon} alt="" className="arc-tab-favicon" onError={(e) => (e.currentTarget.style.display = 'none')} />
                          ) : (
                            <Globe size={13} className="arc-tab-default-icon" style={{ color: tab.color }} />
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
                )}
              </div>
            )
          })}
        </div>

        {/* 侧边栏底栏：状态与新建标签 */}
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

      {/* 右侧主区域：由 WebContentsView 满屏原生渲染（无顶部横条遮挡） */}
      <main className="arc-main-area">
        {activeTab?.loading && (
          <div className="arc-chrome-progress-bar">
            <div className="arc-chrome-progress-inner" style={{ backgroundColor: theme.highlight }} />
          </div>
        )}
      </main>
    </div>
  )
}
