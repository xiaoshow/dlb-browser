export function nativeHome(profile: any, number: number, proxy: any, location: any, version: string) {
  const escape = (value: unknown) => String(value ?? '未检测').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
  const kernelNum = version.match(/\/(\d+)/)?.[1] || version
  const tz = profile.timezone === 'local' ? 'System' : (location?.timezone || profile.timezone || 'Auto')
  const locText = location ? `${location.country}${location.city ? ` / ${location.city}` : ''}` : 'Direct / System Network'
  const latLon = location && typeof location.latitude === 'number' && typeof location.longitude === 'number'
    ? `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`
    : (profile.fingerprint?.geolocation ? `${profile.fingerprint.geolocation.latitude}, ${profile.fingerprint.geolocation.longitude}` : 'Auto')
  const proxyLabel = !proxy || proxy.kind === 'direct'
    ? 'Direct (No Proxy)'
    : proxy.kind === 'system'
      ? 'System Proxy (跟随本机系统代理)'
      : `${proxy.name} · ${proxy.kind.toUpperCase()}${proxy.host ? ` (${proxy.host}:${proxy.port})` : ''}`
  const aliasText = (profile.alias || '').trim()
  const tags: string[] = Array.from(new Set(aliasText.split(/[,，]/).map((t: string) => t.trim()).filter((t: string) => Boolean(t))))
  const TAG_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    gray: { bg: '#e3e2e0', text: '#32302c', border: '#d5d4d2' },
    brown: { bg: '#eee0da', text: '#442a1e', border: '#e2cfc7' },
    orange: { bg: '#fadec9', text: '#49290e', border: '#f5cca9' },
    yellow: { bg: '#fdecc8', text: '#402c1b', border: '#fbe2a3' },
    green: { bg: '#dbeddb', text: '#1c3829', border: '#c3e1c3' },
    blue: { bg: '#d3e5ef', text: '#183347', border: '#b7d5e6' },
    purple: { bg: '#e8deee', text: '#412454', border: '#dacae3' },
    pink: { bg: '#f5e0e9', text: '#4c2337', border: '#ecccdb' },
    red: { bg: '#ffe2dd', text: '#5d1715', border: '#fad0c8' },
  }
  const COLOR_KEYS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']
  const tagColor = (t: string) => {
    let h = 0
    for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0
    return TAG_COLORS[COLOR_KEYS[h % COLOR_KEYS.length]]
  }
  const tagsHtml = tags.length
    ? `<div class="tags-row">${tags.map((t) => {
        const c = tagColor(t)
        return `<span class="notion-tag-pill" style="background:${c.bg};color:${c.text};border-color:${c.border};">${escape(t)}</span>`
      }).join('')}</div>`
    : ''
  const basicRows = [
    ['Profile ID', `#${number}`],
    ['Tags / 标签用途', tags.length ? tags.join(', ') : '— (可在主面板「别名 / 用途」列直接添加 Notion 标签)'],
    ['Name', profile.name],
    ['Proxy', proxyLabel],
    ['Notes', profile.notes?.trim() || '—'],
  ]
  const envRows = [
    ['Kernel Version', `${kernelNum} (${version})`],
    ['Fingerprint Mode', 'Smart · C++ Kernel Seed + Worker Isolation'],
    ['Sync Data', 'Cookies, Bookmarks Bar, Extensions & LocalStorage'],
    ['Operating System', 'macOS (Apple Silicon ARM64)'],
    ['Language', profile.locale || 'en-US'],
  ]
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:"><title>🔴 #${number}${aliasText ? ` · ${escape(aliasText)}` : ''} · ${escape(profile.name)}</title><style>
*{box-sizing:border-box}
body{background:#f3f5f9;color:#1e293b;font:14px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif;margin:0;padding:36px 20px;-webkit-font-smoothing:antialiased}
main{max-width:780px;margin:0 auto;background:#ffffff;padding:34px 40px 38px;border-radius:18px;box-shadow:0 10px 40px rgba(15,23,42,.06),0 1px 3px rgba(15,23,42,.04)}
.top-bar{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
.ip-block{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.profile-badge{display:inline-flex;align-items:center;justify-content:center;height:40px;padding:0 16px;border-radius:10px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;font-size:20px;font-weight:900;letter-spacing:-.02em;font-variant-numeric:tabular-nums;box-shadow:0 4px 14px rgba(220,38,38,.28)}
.tags-row{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}
.notion-tag-pill{display:inline-flex;align-items:center;height:28px;padding:0 10px;border-radius:6px;font-size:13px;font-weight:600;border:1px solid;letter-spacing:-.01em;user-select:none}
.alias-badge{display:inline-flex;align-items:center;height:36px;padding:0 13px;border-radius:9px;background:#fef2f2;border:1.5px solid #fecaca;color:#dc2626;font-size:14px;font-weight:700}
h1{color:#2563eb;font-size:36px;font-weight:800;letter-spacing:-.03em;margin:0;line-height:1.1;font-variant-numeric:tabular-nums}
time{color:#dc2626;font:700 18px/1.2 "SF Mono",ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em;background:#fef2f2;padding:7px 12px;border-radius:8px}
.meta-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:20px 0 24px;padding:13px 16px;background:#f8fafc;border:1px solid #eef2f6;border-radius:11px;font-size:13px;color:#64748b}
.meta-strip strong{color:#0f172a;font-weight:600;margin-left:4px}
.section-title{font-size:13px;font-weight:700;color:#0f172a;margin:22px 0 10px;padding-top:18px;border-top:1px solid #eef2f6;display:flex;align-items:center;justify-content:space-between}
.section-title:first-of-type{border-top:0;padding-top:4px;margin-top:0}
.info-list{display:grid;gap:4px}
.info-row{display:grid;grid-template-columns:160px minmax(0,1fr);align-items:center;padding:10px 14px;border-radius:8px;font-size:13.5px}
.info-row:nth-child(odd){background:#f8fafc}
.info-label{color:#64748b;font-weight:500}
.info-value{color:#0f172a;font-weight:500;overflow-wrap:anywhere}
.tools{display:inline-flex;flex-wrap:wrap;gap:14px}
.tools a{display:inline-flex;align-items:center;gap:6px;color:#2563eb;text-decoration:none;font-weight:600;padding:3px 9px;border-radius:6px;background:#eff6ff;transition:background .15s}
.tools a:hover{background:#dbeafe;text-decoration:underline}
.tools i{display:inline-grid;place-items:center;width:16px;height:16px;border-radius:4px;font-style:normal;font-size:10px;font-weight:800;color:#fff}
.tools .t-ping0{background:#059669}
.tools .t-creep{background:#e11d48}
.tools .t-leaks{background:#475569}
.tools .t-ip{background:#0284c7}
.tools .t-pixel{background:#7c3aed}
</style><main>
  <div class="top-bar">
    <div class="ip-block">
      <span class="profile-badge">#${number}</span>
      ${tagsHtml}
      <h1>${escape(location?.ip || '出口 IP 未检测')}</h1>
    </div>
    <time id="clock">--:--:--</time>
  </div>
  <div class="meta-strip">
    <div>Location: <strong>${escape(locText)}</strong></div>
    <div>Lat/Lon: <strong>${escape(latLon)}</strong></div>
    <div>Timezone: <strong>${escape(tz)}</strong></div>
  </div>
  <div class="section-title"><span>Basic Information</span></div>
  <div class="info-list">
    ${basicRows.map(([k, v]) => `<div class="info-row"><span class="info-label">${escape(k)}</span><span class="info-value">${escape(v)}</span></div>`).join('')}
  </div>
  <div class="section-title"><span>Environment Information</span></div>
  <div class="info-list">
    <div class="info-row">
      <span class="info-label">Testing Tool</span>
      <span class="info-value tools">
        <a href="https://ip.ping0.cc/"><i class="t-ping0">P0</i>ping0.cc</a>
        <a href="https://abrahamjuliot.github.io/creepjs/"><i class="t-creep">C</i>CreepJS</a>
        <a href="https://browserleaks.com/"><i class="t-leaks">B</i>BrowserLeaks</a>
        <a href="https://ipinfo.io/"><i class="t-ip">IP</i>IPInfo</a>
        <a href="https://pixelscan.net/"><i class="t-pixel">P</i>Pixelscan</a>
      </span>
    </div>
    ${envRows.map(([k, v]) => `<div class="info-row"><span class="info-label">${escape(k)}</span><span class="info-value">${escape(v)}</span></div>`).join('')}
    <div class="info-row"><span class="info-label">UserAgent</span><span class="info-value" id="observed"></span></div>
  </div>
</main><script>
document.getElementById('observed').textContent = navigator.userAgent;
function pad(n){return String(n).padStart(2,'0')}
function tick(){
  var d = new Date();
  document.getElementById('clock').textContent = pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds())+' '+pad(d.getDate())+'/'+pad(d.getMonth()+1)+'/'+d.getFullYear();
}
var clockTimer;
function updateClockActivity(){
  clearInterval(clockTimer);
  if (!document.hidden) { tick(); clockTimer = setInterval(tick, 1000); }
}
document.addEventListener('visibilitychange', updateClockActivity);
window.addEventListener('pagehide', function(){ clearInterval(clockTimer); });
window.addEventListener('pageshow', updateClockActivity);
updateClockActivity();
</script></html>`
}
