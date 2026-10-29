import { useEffect, useState } from 'react'
import type { UpdateCenterStatus } from './types'
export function UpdateCenter({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<UpdateCenterStatus>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function read(check = false) {
    setBusy(true); setError('')
    try { setStatus(await window.profileBrowser!.getUpdateStatus(check)) }
    catch (e) { setError(e instanceof Error ? e.message : '无法读取更新信息') }
    finally { setBusy(false) }
  }
  useEffect(() => { void read() }, [])
  return <div className="modal-backdrop higher"><section className="sheet update-center"><header><div><h2>更新中心</h2><p>应用与浏览器内核分别更新</p></div><button className="secondary" onClick={onClose}>关闭</button></header><div className="sheet-body">
    {status && <>{([{ key: 'app', name: 'Prism 应用', current: status.appVersion }, { key: 'kernel', name: status.kernelName, current: status.kernelVersion }] as const).map(item => { const release = status.releases?.[item.key]; return <article className="update-card" key={item.key}><h3>{item.name}</h3><p>当前版本 <strong>{item.current}</strong></p>{release && <><p>发布版本 {release.version} · {new Date(release.publishedAt).toLocaleDateString()}</p><p style={{whiteSpace:'pre-wrap'}}>{release.notes}</p></>}<small>{release ? '安装功能尚未启用' : '尚未获取发布版本'}</small></article> })}<p role="status">{status.message}</p></>}
    <p className="field-hint">内核升级会影响安全修复、网站与扩展兼容性，也可能改变指纹表现。更新设计为保留旧内核、验证新版本，并在 Profile 停止后切换。</p>
    {error && <p className="error" role="alert">{error}</p>}
  </div><footer><button className="primary" disabled={busy || !status?.configured} onClick={() => void read(true)}>{busy ? '正在检查' : status?.configured ? '检查更新' : '更新通道待配置'}</button></footer></section></div>
}
