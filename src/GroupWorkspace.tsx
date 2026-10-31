import React, { useEffect, useState, useRef } from 'react'
import type { WorkspaceState, WorkspaceTab } from './types'
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Plus,
  X,
  Globe,
  Search,
  Lock,
  Compass,
  ChevronRight,
  Folder,
  Layers,
  Sparkles,
} from 'lucide-react'

export const ARC_THEMES: Record<string, { bg: string; sidebar: string; highlight: string; text: string; searchPill: string }> = {
  '#8ee2b5': { bg: '#8ee2b5', sidebar: '#76d8a3', highlight: '#3f986d', text: '#133e29', searchPill: 'rgba(255, 255, 255, 0.45)' },
  '#c9baf7': { bg: '#c9baf7', sidebar: '#b6a2f2', highlight: '#7352d9', text: '#261754', searchPill: 'rgba(255, 255, 255, 0.45)' },
  '#fbb39d': { bg: '#fbb39d', sidebar: '#f99e83', highlight: '#e25c38', text: '#43190f', searchPill: 'rgba(255, 255, 255, 0.45)' },
  '#8fd5fa': { bg: '#8fd5fa', sidebar: '#72c7f5', highlight: '#218ec7', text: '#0e3449', searchPill: 'rgba(255, 255, 255, 0.45)' },
  '#fde047': { bg: '#fde047', sidebar: '#facc15', highlight: '#ca8a04', text: '#422006', searchPill: 'rgba(255, 255, 255, 0.45)' },
  '#f9a8d4': { bg: '#f9a8d4', sidebar: '#f472b6', highlight: '#db2777', text: '#500724', searchPill: 'rgba(255, 255, 255, 0.45)' },
  '#7de2d1': { bg: '#7de2d1', sidebar: '#61d4c1', highlight: '#0f947e', text: '#09362e', searchPill: 'rgba(255, 255, 255, 0.45)' },
  '#a3e635': { bg: '#a3e635', sidebar: '#8fd622', highlight: '#65a30d', text: '#1a2e05', searchPill: 'rgba(255, 255, 255, 0.45)' },
}

export function GroupWorkspace() {
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null)
  const [commandBarOpen, setCommandBarOpen] = useState(false)
  const [commandInput, setCommandInput] = useState('')
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const commandInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Initial fetch
    void window.profileBrowser?.workspaceGetState().then((state) => {
      if (state) {
        setWorkspace(state)
        const active = state.tabs.find((t) => t.id === state.activeTabId)
        if (active) setSelectedProfileId(active.profileId)
      }
    })

    // Listen for broadcast updates
    const unsubscribe = window.profileBrowser?.onWorkspaceState((state) => {
      setWorkspace(state)
      const active = state.tabs.find((t) => t.id === state.activeTabId)
      if (active && !selectedProfileId) {
        setSelectedProfileId(active.profileId)
      }
    })

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [selectedProfileId])

  // Sync command bar visibility with Electron WebContentsView
  useEffect(() => {
    void window.profileBrowser?.workspaceSetCommandBar(commandBarOpen)
    if (commandBarOpen) {
      setTimeout(() => commandInputRef.current?.focus(), 50)
    }
  }, [commandBarOpen])

  // Global hotkeys (Cmd+T / Cmd+L / Escape)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 't' || e.key === 'l')) {
        e.preventDefault()
        const active = workspace?.tabs.find((t) => t.id === workspace.activeTabId)
        setCommandInput(active?.url && active.url !== 'about:blank' ? active.url : '')
        setCommandBarOpen(true)
      } else if (e.key === 'Escape' && commandBarOpen) {
        e.preventDefault()
        setCommandBarOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [commandBarOpen, workspace])

  const activeTab = workspace?.tabs.find((t) => t.id === workspace.activeTabId)

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
  const currentProfile = profiles.find((p) => p.id === (selectedProfileId || activeTab?.profileId)) || profiles[0]

  // Active theme based on current profile's Arc color
  const theme = ARC_THEMES[currentProfile?.color] || ARC_THEMES['#8ee2b5']

  function openCommandBar(defaultText = '') {
    setCommandInput(defaultText)
    setCommandBarOpen(true)
  }

  function handleSwitchTab(tabId: string) {
    const tab = workspace?.tabs.find((t) => t.id === tabId)
    if (tab) setSelectedProfileId(tab.profileId)
    setCommandBarOpen(false)
    void window.profileBrowser?.workspaceSwitchTab(tabId)
  }

  function handleCloseTab(e: React.MouseEvent, tabId: string) {
    e.stopPropagation()
    void window.profileBrowser?.workspaceCloseTab(tabId)
  }

  function handleNewTab() {
    openCommandBar('')
  }

  function handleCommandSubmit(e: React.FormEvent) {
    e.preventDefault()
    const target = commandInput.trim()
    if (!target) return
    setCommandBarOpen(false)

    if (activeTab) {
      void window.profileBrowser?.workspaceNavigate(activeTab.id, target)
    } else {
      void window.profileBrowser?.workspaceNewTab(currentProfile?.id, target)
    }
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
          '--arc-pill': theme.searchPill,
        } as React.CSSProperties
      }
    >
      {/* 1. Left Arc Sidebar (250px) */}
      <aside className="arc-sidebar">
        {/* Top Header: Traffic light padding + Navigation controls */}
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

        {/* Omnibox / Search Pill (Arc Signature) */}
        <div className="arc-search-pill-wrapper">
          <button
            type="button"
            className="arc-search-pill"
            onClick={() => openCommandBar(activeTab?.url && activeTab.url !== 'about:blank' ? activeTab.url : '')}
          >
            <Search size={14} className="arc-search-icon" />
            <span className="arc-search-placeholder">
              {activeTab?.url && activeTab.url !== 'about:blank'
                ? activeTab.url.replace(/^https?:\/\//i, '').slice(0, 24)
                : 'Search or Enter URL...'}
            </span>
          </button>
        </div>

        {/* Current Active Profile / Space Indicator */}
        <div className="arc-profile-header">
          <span className="arc-profile-dot" style={{ backgroundColor: theme.highlight }} />
          <span className="arc-profile-name">
            #{currentProfile?.number} {currentProfile?.name}
          </span>
          <span className="arc-group-badge">{workspace.groupName}</span>
        </div>

        {/* Vertical Tabs List */}
        <div className="arc-tabs-list">
          {workspace.tabs.map((tab) => {
            const isActive = tab.id === workspace.activeTabId
            return (
              <div
                key={tab.id}
                className={`arc-tab-item ${isActive ? 'active' : ''}`}
                onClick={() => handleSwitchTab(tab.id)}
                title={`${tab.profileName} · ${tab.title || tab.url}`}
              >
                {/* Profile Color Dot */}
                <span
                  className="arc-tab-dot"
                  style={{
                    backgroundColor: tab.color,
                  }}
                  title={`账号 #${tab.profileNumber} (${tab.profileName})`}
                />

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
                  <Globe size={14} className="arc-tab-default-icon" style={{ color: tab.color }} />
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

          {/* New Tab Button */}
          <button type="button" className="arc-new-tab-btn" onClick={handleNewTab}>
            <Plus size={15} />
            <span>New Tab</span>
          </button>
        </div>

        {/* Bottom Spaces / Profiles Switcher Bar (Arc Style) */}
        <div className="arc-bottom-bar">
          <div className="arc-spaces-pill-group">
            {profiles.map((p) => {
              const isCurrent = p.id === currentProfile?.id
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`arc-space-btn ${isCurrent ? 'active' : ''}`}
                  style={{ borderColor: isCurrent ? p.color : 'transparent' }}
                  onClick={() => {
                    setSelectedProfileId(p.id)
                    const firstTabOfProfile = workspace.tabs.find((t) => t.profileId === p.id)
                    if (firstTabOfProfile) handleSwitchTab(firstTabOfProfile.id)
                  }}
                  title={`切换到 #${p.number} ${p.name}`}
                >
                  <span className="arc-space-dot" style={{ backgroundColor: p.color }} />
                  <span className="arc-space-num">#{p.number}</span>
                </button>
              )
            })}
          </div>

          <button
            type="button"
            className="arc-space-add-btn"
            title="在此账号下新开相邻标签页 (Cmd+T)"
            onClick={() => void window.profileBrowser?.workspaceNewTab(currentProfile?.id)}
          >
            <Plus size={15} />
          </button>
        </div>
      </aside>

      {/* 2. Arc Floating Command Bar (Spotlight Palette - Image 2) */}
      {commandBarOpen && (
        <div className="arc-command-palette-backdrop" onClick={() => setCommandBarOpen(false)}>
          <div className="arc-command-card" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleCommandSubmit} className="arc-command-form">
              <div className="arc-command-input-row">
                <Globe size={18} className="arc-command-globe" />
                <input
                  ref={commandInputRef}
                  type="text"
                  className="arc-command-input"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  placeholder="Search or Enter URL..."
                  spellCheck={false}
                />
                <span className="arc-command-info-pill">ESC 关闭</span>
              </div>

              <div className="arc-command-suggestions">
                {commandInput.trim() ? (
                  <>
                    <button type="submit" className="arc-suggestion-item primary-highlight">
                      <Globe size={16} />
                      <span className="arc-sugg-text">
                        {commandInput.startsWith('http') || commandInput.includes('.')
                          ? `前往网址：${commandInput}`
                          : `Google 搜索：${commandInput}`}
                      </span>
                      <span className="arc-sugg-badge">↵ 回车</span>
                    </button>
                    <button
                      type="button"
                      className="arc-suggestion-item"
                      onClick={() => {
                        setCommandBarOpen(false)
                        void window.profileBrowser?.workspaceNewTab(
                          currentProfile?.id,
                          `https://www.google.com/search?q=${encodeURIComponent(commandInput)}`
                        )
                      }}
                    >
                      <Search size={16} />
                      <span className="arc-sugg-text">新开 Tab 搜索：{commandInput}</span>
                      <span className="arc-sugg-badge">新标签</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="arc-suggestion-item primary-highlight"
                      onClick={() => {
                        setCommandBarOpen(false)
                        void window.profileBrowser?.workspaceNavigate(activeTab?.id || '', 'https://www.google.com')
                      }}
                    >
                      <Globe size={16} />
                      <span className="arc-sugg-text">Google 首页</span>
                      <span className="arc-sugg-badge">google.com</span>
                    </button>
                    <button
                      type="button"
                      className="arc-suggestion-item"
                      onClick={() => {
                        setCommandBarOpen(false)
                        void window.profileBrowser?.workspaceNavigate(activeTab?.id || '', 'https://mail.google.com')
                      }}
                    >
                      <Layers size={16} />
                      <span className="arc-sugg-text">Gmail 邮箱</span>
                      <span className="arc-sugg-badge">mail.google.com</span>
                    </button>
                    <button
                      type="button"
                      className="arc-suggestion-item"
                      onClick={() => {
                        setCommandBarOpen(false)
                        void window.profileBrowser?.workspaceNavigate(activeTab?.id || '', 'https://www.youtube.com')
                      }}
                    >
                      <Sparkles size={16} />
                      <span className="arc-sugg-text">YouTube</span>
                      <span className="arc-sugg-badge">youtube.com</span>
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
