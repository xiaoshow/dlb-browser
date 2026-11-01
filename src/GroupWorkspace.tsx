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

  // 100% 灵敏点击：直接在当前活动 Tab 中打开目标网页
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
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      unsub?.()
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeTab, isBookmarked])

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
              <Lock size={13} className="arc-lock-icon" />
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

        {/* 第二行：官方 Chrome 原版书签栏 (高 30px，紧贴在顶栏下方，点击 100% 灵敏秒开) */}
        <div className="arc-chrome-bookmarks-bar official-chrome-bookmarks-bar">
          <div className="arc-bookmarks-items-row">
            <span className="arc-shared-badge" title="当前聚合窗口中所有环境共用此套收藏夹">
              <Star size={11} /> 共用收藏
            </span>
            {workspace?.bookmarks && workspace.bookmarks.length > 0 ? (
              workspace.bookmarks.map((bm) => (
                <div
                  key={bm.url}
                  className="arc-bookmark-pill official-bookmark-pill"
                  onClick={() => handleBookmarkClick(bm.url)}
                  title={`${bm.name}\n${bm.url}（点击打开）`}
                  role="button"
                  tabIndex={0}
                >
                  <Globe size={12} className="arc-bm-icon" />
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
              <div className="arc-bookmarks-empty-hint">
                <Star size={12} />
                <span>在地址栏右侧点击 ⭐ 即可添加收藏（所有环境共用）</span>
              </div>
            )}
          </div>
        </div>

        {/* 加载进度指示条 */}
        {activeTab?.loading && (
          <div className="arc-chrome-progress-bar">
            <div className="arc-chrome-progress-inner" style={{ backgroundColor: theme.highlight }} />
          </div>
        )}
      </main>
    </div>
  )
}
