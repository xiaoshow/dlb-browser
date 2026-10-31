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
  ShieldCheck,
  Palette,
  Star,
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

  useEffect(() => {
    // Initial fetch
    void window.profileBrowser?.workspaceGetState().then((state) => {
      if (state) {
        setWorkspace(state)
        const active = state.tabs.find((t) => t.id === state.activeTabId)
        if (active) setUrlInput(active.url)
      }
    })

    // Listen for broadcast updates
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

  // Sync address bar input when active tab changes and user isn't actively editing
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

  // CRITICAL RULE 1: Theme color is determined by the active tab's profile!
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

  function handleNewTabForProfile(profileId: string) {
    void window.profileBrowser?.workspaceNewTab(profileId)
  }

  function handleNavigate(e: React.FormEvent) {
    e.preventDefault()
    if (!activeTab || !urlInput.trim()) return
    setIsEditingUrl(false)
    void window.profileBrowser?.workspaceNavigate(activeTab.id, urlInput)
  }

  function handlePickColor(palette: ArcPalette) {
    if (!currentProfile) return
    void window.profileBrowser?.workspaceSetProfileColor(currentProfile.id, palette.dot)
    setShowColorPicker(false)
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

  const isBookmarked = Boolean(
    activeTab &&
      (workspace?.bookmarks || []).some(
        (b) => b.url === activeTab.url || (activeTab.url && b.url.startsWith(activeTab.url))
      )
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

  function handleBookmarkClick(url: string) {
    if (!activeTab) return
    setIsEditingUrl(false)
    void window.profileBrowser?.workspaceNavigate(activeTab.id, url)
  }

  function handleRemoveBookmark(e: React.MouseEvent, url: string) {
    e.stopPropagation()
    if (!activeTab) return
    void window.profileBrowser?.workspaceRemoveBookmark(activeTab.profileId, url)
  }

  if (!workspace) {
    return (
      <div className="arc-loading-screen" style={{ backgroundColor: '#8ee2b5' }}>
        <div className="arc-spinner" />
        <p>正在启动 Arc 聚合工作台…</p>
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
        } as React.CSSProperties
      }
    >
      {/* 1. Left Arc Sidebar (250px) */}
      <aside className="arc-sidebar">
        {/* Top Header: Traffic light spacer */}
        <div className="arc-sidebar-top">
          <div className="arc-traffic-spacer" />
          <div className="arc-group-pill" title={`当前分组：${workspace.groupName}`}>
            <span className="arc-group-dot" style={{ backgroundColor: theme.highlight }} />
            <span className="arc-group-name">{workspace.groupName}</span>
          </div>
        </div>

        {/* Profile Color Switcher Bar ("我可以切颜色") */}
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

          {/* Color Dots Row */}
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

        {/* 2. Unified Tabs List ("两个profile放在的tab列在一起") */}
        <div className="arc-tabs-list">
          {profiles.map((p) => {
            const profileTabs = workspace.tabs.filter((t) => t.profileId === p.id)
            const pTheme = getArcTheme(p.color)
            const isProfileActive = p.id === currentProfile?.id

            return (
              <div key={p.id} className="arc-profile-section">
                {/* Profile Section Header */}
                <div className={`arc-section-header ${isProfileActive ? 'active-section' : ''}`}>
                  <span className="arc-section-dot" style={{ backgroundColor: pTheme.dot }} />
                  <span className="arc-section-name">
                    #{p.number} {p.name}
                  </span>
                  <span className="arc-section-count">{profileTabs.length}</span>
                  <button
                    type="button"
                    className="arc-section-add-btn"
                    title={`为 #${p.number} ${p.name} 新开相邻标签页`}
                    onClick={() => handleNewTabForProfile(p.id)}
                  >
                    <Plus size={13} />
                  </button>
                </div>

                {/* Tabs for this Profile */}
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
                        {/* Profile Color Dot */}
                        <span className="arc-tab-dot" style={{ backgroundColor: pTheme.dot }} />

                        {/* Favicon */}
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
                          <Globe size={14} className="arc-tab-default-icon" style={{ color: pTheme.highlight }} />
                        )}

                        {/* Title */}
                        <span className="arc-tab-title">{tab.title || tab.profileName}</span>

                        {/* Close Button */}
                        <button
                          type="button"
                          className="arc-tab-close-btn"
                          aria-label="关闭标签"
                          onClick={(e) => handleCloseTab(e, tab.id)}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Bottom Bar: Total Tabs Count & Quick Add */}
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
            <Plus size={15} />
            <span>New Tab</span>
          </button>
        </div>
      </aside>

      {/* 2. Main Content Area */}
      <main className="arc-main-area">
        {/* Chrome-Style Permanent Top Address Bar ("原版的Google Chrome一样在上面吧，不要弹出来了") */}
        <header className="arc-chrome-toolbar">
          {/* Nav Buttons */}
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

          {/* Active Profile Status Pill */}
          {activeTab && (
            <div
              className="arc-chrome-profile-badge"
              style={{
                borderColor: `${theme.highlight}44`,
                backgroundColor: 'rgba(255, 255, 255, 0.65)',
              }}
              title={`当前环境：${activeTab.profileName}（独立 Cookie，隔离运行）`}
            >
              <span className="arc-badge-dot" style={{ backgroundColor: theme.highlight }} />
              <span className="arc-badge-text">
                #{activeTab.profileNumber} {activeTab.profileName}
              </span>
            </div>
          )}

          {/* Chrome-Style Permanent Address / Omnibox Input Form */}
          <form className="arc-chrome-omnibox-form" onSubmit={handleNavigate}>
            <div className="arc-chrome-omnibox">
              <Lock size={13} className="arc-lock-icon" />
              <input
                type="text"
                className="arc-chrome-input"
                value={urlInput}
                onFocus={() => setIsEditingUrl(true)}
                onBlur={() => setIsEditingUrl(false)}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="输入网址或 Google 搜索…"
                spellCheck={false}
              />
              <button
                type="button"
                className={`arc-omnibox-star-btn ${isBookmarked ? 'bookmarked' : ''}`}
                onClick={handleToggleBookmark}
                title={isBookmarked ? '已收藏（点击取消收藏）' : '收藏此页面到书签栏'}
              >
                <Star size={14} className={isBookmarked ? 'star-filled' : 'star-outline'} />
              </button>
            </div>
          </form>
        </header>

        {/* Chrome-Style Permanent Bookmarks Bar ("shoucang一直展示") */}
        <div className="arc-chrome-bookmarks-bar">
          <div className="arc-bookmarks-items-row">
            {workspace?.bookmarks && workspace.bookmarks.length > 0 ? (
              workspace.bookmarks.map((bm) => (
                <button
                  key={bm.url}
                  type="button"
                  className="arc-bookmark-pill"
                  onClick={() => handleBookmarkClick(bm.url)}
                  title={`${bm.name}\n${bm.url}`}
                >
                  <Globe size={12} className="arc-bm-icon" />
                  <span className="arc-bm-name">{bm.name}</span>
                  <span
                    className="arc-bm-del"
                    title="删除此收藏"
                    onClick={(e) => handleRemoveBookmark(e, bm.url)}
                  >
                    ×
                  </span>
                </button>
              ))
            ) : (
              <div className="arc-bookmarks-empty-hint">
                <Star size={12} />
                <span>收藏夹栏（点击地址栏右侧 ⭐ 即可添加收藏）</span>
              </div>
            )}
          </div>
        </div>

        {/* Loading Progress Bar */}
        {activeTab?.loading && (
          <div className="arc-chrome-progress-bar">
            <div className="arc-chrome-progress-inner" style={{ backgroundColor: theme.highlight }} />
          </div>
        )}
      </main>
    </div>
  )
}
