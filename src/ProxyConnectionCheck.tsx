import { useEffect, useRef, useState } from 'react'
import { Check, RefreshCw, X } from 'lucide-react'
import type { ProxyNode, ProxyTestResult } from './types'
import { timezoneLabel } from './timezones'

/** Checks the unsaved selection without changing the running Profile or its binding. */
export function ProxyConnectionCheck({ proxy }: { proxy?: ProxyNode }) {
  const [result, setResult] = useState<ProxyTestResult>()
  const [busy, setBusy] = useState(false)
  const sequence = useRef(0)
  const identity = JSON.stringify([proxy?.id, proxy?.shareUrl, proxy?.host, proxy?.port])
  useEffect(() => { sequence.current++; setResult(undefined); setBusy(false); return () => { sequence.current++ } }, [identity])
  async function check() {
    if (!proxy || busy) return
    const request = ++sequence.current
    setBusy(true); setResult(undefined)
    try {
      const response = await window.profileBrowser!.testProxy(proxy)
      if (request === sequence.current) setResult(response)
    } catch { if (request === sequence.current) setResult({ ok: false, error: '连接检查失败，请重试' }) }
    finally { if (request === sequence.current) setBusy(false) }
  }
  return <div className="proxy-connection-check">
    <button type="button" className="secondary" disabled={!proxy || busy} onClick={() => void check()}><RefreshCw size={15} className={busy ? 'spin' : ''}/>{busy ? '检查中…' : '检查连接'}</button>
    <div aria-live="polite" role="status">{busy && <small>通过所选节点检查 HTTPS 连接和出口地区…</small>}{result && <div className={`connection-result ${result.ok ? 'success' : 'failure'}`}>
      <strong>{result.ok ? <Check size={16}/> : <X size={16}/>} {result.ok ? '连接成功' : '连接失败'}</strong>
      {result.ok ? <><span>出口 IP：{result.ip} · 耗时 {result.latency} ms</span>{result.location && <><span>{result.location.country} / {result.location.city}</span><span>时区：{timezoneLabel(result.location.timezone)}</span><span>地区默认语言：{result.location.locale}</span></>}{result.locationWarning && <span>{result.locationWarning}</span>}<small>检测结果仅代表当前连接，不会自动更改已保存的环境设置。</small></> : <span>{result.error || '未取得有效出口 IP'}</span>}
    </div>}</div>
  </div>
}
