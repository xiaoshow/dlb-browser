import { useEffect, useState } from 'react'
import type { UpdateCenterStatus } from './types'

export function UpdateCenter({ onClose, isPage }: { onClose: () => void; isPage?: boolean }) {
  const [status, setStatus] = useState<UpdateCenterStatus>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function read(check = false) {
    setBusy(true)
    setError('')
    try {
      setStatus(await window.profileBrowser!.getUpdateStatus(check))
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法读取更新信息')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { void read() }, [])

  const content = (
    <>
      <header className="page-header" style={{ marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 650, margin: '0 0 6px', color: '#1e293b' }}>更新中心</h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>应用与浏览器内核分别更新 · 保留旧内核隔离运行</p>
        </div>
        <button className="primary" disabled={busy || !status?.configured} onClick={() => void read(true)}>
          {busy ? '正在检查' : status?.configured ? '检查更新' : '更新通道待配置'}
        </button>
      </header>

      <div style={{ background: '#fff', borderRadius: 12, padding: 24, border: '1px solid #e2e8f0', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {status && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            {([
              { key: 'app', name: 'DLB Browser 应用', current: status.appVersion },
              { key: 'kernel', name: status.kernelName, current: status.kernelVersion },
            ] as const).map(item => {
              const release = status.releases?.[item.key]
              return (
                <article className="update-card" key={item.key} style={{ padding: 18, border: '1px solid #f1f5f9', borderRadius: 10, background: '#f8fafc' }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: 15, color: '#1e293b' }}>{item.name}</h3>
                  <p style={{ margin: '0 0 8px', fontSize: 13, color: '#475569' }}>当前版本 <strong>{item.current}</strong></p>
                  {release && (
                    <>
                      <p style={{ margin: '0 0 6px', fontSize: 12, color: '#2563eb' }}>发布版本 {release.version} · {new Date(release.publishedAt).toLocaleDateString()}</p>
                      <p style={{ margin: 0, fontSize: 12, color: '#64748b', whiteSpace: 'pre-wrap' }}>{release.notes}</p>
                    </>
                  )}
                  <small style={{ display: 'block', marginTop: 10, color: '#94a3b8' }}>{release ? '安装功能尚未启用' : '尚未获取发布版本'}</small>
                </article>
              )
            })}
          </div>
        )}
        {status?.message && <p role="status" style={{ marginTop: 16, color: '#475569', fontSize: 13 }}>{status.message}</p>}
        {error && <p className="error" role="alert" style={{ marginTop: 16 }}>{error}</p>}
        <p className="field-hint" style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid #f1f5f9', color: '#94a3b8', fontSize: 12 }}>
          内核升级会影响安全修复、网站与扩展兼容性，也可能改变指纹表现。更新设计为保留旧内核、验证新版本，并在 Profile 停止后切换。
        </p>
      </div>
    </>
  )

  if (isPage) {
    return <div className="profile-manager updates-page-container" style={{ position: 'absolute', inset: '56px 20px 18px 248px', display: 'flex', flexDirection: 'column' }}>{content}</div>
  }

  return (
    <div className="modal-backdrop higher">
      <section className="sheet update-center">
        <header>
          <div><h2>更新中心</h2><p>应用与浏览器内核分别更新</p></div>
          <button className="secondary" onClick={onClose}>关闭</button>
        </header>
        <div className="sheet-body">
          {status && (
            <>
              {([
                { key: 'app', name: 'Prism 应用', current: status.appVersion },
                { key: 'kernel', name: status.kernelName, current: status.kernelVersion },
              ] as const).map(item => {
                const release = status.releases?.[item.key]
                return (
                  <article className="update-card" key={item.key}>
                    <h3>{item.name}</h3>
                    <p>当前版本 <strong>{item.current}</strong></p>
                    {release && (
                      <>
                        <p>发布版本 {release.version} · {new Date(release.publishedAt).toLocaleDateString()}</p>
                        <p style={{ whiteSpace: 'pre-wrap' }}>{release.notes}</p>
                      </>
                    )}
                    <small>{release ? '安装功能尚未启用' : '尚未获取发布版本'}</small>
                  </article>
                )
              })}
              <p role="status">{status.message}</p>
            </>
          )}
          <p className="field-hint">内核升级会影响安全修复、网站与扩展兼容性，也可能改变指纹表现。更新设计为保留旧内核、验证新版本，并在 Profile 停止后切换。</p>
          {error && <p className="error" role="alert">{error}</p>}
        </div>
        <footer>
          <button className="primary" disabled={busy || !status?.configured} onClick={() => void read(true)}>{busy ? '正在检查' : status?.configured ? '检查更新' : '更新通道待配置'}</button>
        </footer>
      </section>
    </div>
  )
}
