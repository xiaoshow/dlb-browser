import { useEffect, useState } from 'react'
import type { AppState, ProxyNode } from './types'

export function V2raySync({ state, onSaved, onClose, isPage }: { state: AppState; onSaved: (s: AppState) => void; onClose: () => void; isPage?: boolean }) {
  const [nodes, setNodes] = useState<ProxyNode[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function scan() {
    setBusy(true)
    try {
      const result = await window.profileBrowser!.scanV2ray()
      setNodes(result.nodes)
      setSelected(result.nodes.filter(n => state.proxies.some(p => p.source === 'v2rayn' && p.sourceId === n.sourceId && p.favorite)).map(n => n.sourceId!))
      setMessage(`可同步 ${result.nodes.length} 个 VLESS，跳过 ${result.skipped} 个其他或暂不支持的节点。`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '扫描失败')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { void scan() }, [])

  async function save() {
    setBusy(true)
    try {
      const result = await window.profileBrowser!.syncV2ray(selected)
      onSaved(result.state)
      onClose()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '同步失败')
    } finally {
      setBusy(false)
    }
  }

  if (isPage) {
    return (
      <div className="profile-manager v2ray-page-container" style={{ position: 'absolute', inset: '56px 20px 18px 248px', display: 'flex', flexDirection: 'column' }}>
        <header className="page-header" style={{ marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 21, fontWeight: 650, margin: '0 0 6px', color: '#1e293b' }}>v2rayN 收藏同步</h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>单向读取本机 v2rayN 数据库，只同步你勾选的 Fav 节点</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="secondary" disabled={busy} onClick={() => void scan()}>重新扫描</button>
            <button className="primary" disabled={busy || !nodes.length} onClick={() => void save()}>
              {busy ? '处理中' : `保存收藏并同步 (${selected.length})`}
            </button>
          </div>
        </header>

        <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottom: '1px solid #f1f5f9' }}>
            <span style={{ fontSize: 13, color: '#334155', fontWeight: 500 }} role="status">{message || '正在扫描...'}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="secondary" style={{ height: 30, fontSize: 12, padding: '0 10px' }} disabled={busy} onClick={() => setSelected(nodes.map(n => n.sourceId!))}>全选 Fav</button>
              <button className="secondary" style={{ height: 30, fontSize: 12, padding: '0 10px' }} disabled={busy} onClick={() => setSelected([])}>清空选择</button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', marginTop: 12 }}>
            {nodes.map(n => (
              <label key={n.sourceId} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 8, cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}>
                <input type="checkbox" disabled={busy} checked={selected.includes(n.sourceId!)} onChange={e => setSelected(ids => e.target.checked ? [...ids, n.sourceId!] : ids.filter(id => id !== n.sourceId))} />
                <span>
                  <strong style={{ fontSize: 13, color: '#1e293b' }}>★ {n.name}</strong>
                  <small style={{ display: 'block', color: '#64748b', fontSize: 11, marginTop: 2 }}>{n.host}:{n.port} · {n.transport} / {n.security}</small>
                </span>
              </label>
            ))}
            {nodes.length === 0 && !busy && (
              <div style={{ padding: '60px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>暂未扫描到可用的 v2rayN 节点</div>
            )}
          </div>

          <p style={{ margin: '14px 0 0', color: '#94a3b8', fontSize: 12, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
            提示：取消 Fav 只停止更新，保留已导入节点和 Profile 绑定。来源删除节点也不会在 Prism 自动删除。凭据仅保存在本机。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-backdrop higher">
      <section className="sheet">
        <header>
          <div><h2>v2rayN 收藏同步</h2><p>单向读取，只同步你勾选的 Fav 节点</p></div>
          <button className="secondary" onClick={onClose}>关闭</button>
        </header>
        <div className="sheet-body">
          <p role="status">{message}</p>
          <div className="header-actions">
            <button className="secondary" disabled={busy} onClick={() => setSelected(nodes.map(n => n.sourceId!))}>全选 Fav</button>
            <button className="secondary" disabled={busy} onClick={() => setSelected([])}>清空选择</button>
            <button className="secondary" disabled={busy} onClick={() => void scan()}>重新扫描</button>
          </div>
          <div style={{ maxHeight: '50vh', overflow: 'auto' }}>
            {nodes.map(n => (
              <label key={n.sourceId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #eee' }}>
                <input type="checkbox" disabled={busy} checked={selected.includes(n.sourceId!)} onChange={e => setSelected(ids => e.target.checked ? [...ids, n.sourceId!] : ids.filter(id => id !== n.sourceId))} />
                <span><strong>★ {n.name}</strong><small style={{ display: 'block' }}>{n.host}:{n.port} · {n.transport} / {n.security}</small></span>
              </label>
            ))}
          </div>
          <p className="field-hint">取消 Fav 只停止更新，保留已导入节点和 Profile 绑定。来源删除节点也不会在 Prism 自动删除。凭据仅保存在本机。</p>
        </div>
        <footer>
          <button className="primary" disabled={busy || !nodes.length} onClick={() => void save()}>{busy ? '处理中' : `保存收藏并同步（${selected.length}）`}</button>
        </footer>
      </section>
    </div>
  )
}
