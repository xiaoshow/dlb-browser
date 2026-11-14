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

  const wallpapers = [
    "official_mv_img1.jpg",
    "official_mv_img2.jpg",
    "official_mv_img3.jpg",
    "official_mv_img4.jpg",
    "official_ogimage.png",
    "still_01_01_01m16s_天道小靡_樱花走廊校服定妆.jpg",
    "still_02_02_01m25s_天道小靡_教室窗边撩发特写.jpg",
    "still_04_05_08m38s_女乱马_纯白棚拍写真_白T百褶裙.jpg",
    "still_05_06_08m42s_女乱马_纯白棚拍写真_粉针织衫甜笑.jpg",
    "still_06_07_08m46s_女乱马_纯白棚拍写真_黑衣街头酷飒.jpg",
    "still_07_08_08m50s_女乱马_纯白棚拍写真_鹅黄连衣裙.jpg",
    "still_08_09_09m16s_女乱马_漫天樱花黑衣练功服正脸.jpg",
    "still_09_10_11m52s_女乱马_樱花道嫣然一笑特写.jpg",
    "still_10_11_13m02s_九能小太刀_樱花校门哥特体操服定妆.jpg",
    "still_11_12_14m12s_珊璞_猫饭店紫金刺绣旗袍定妆.jpg",
    "still_12_13_15m19s_女乱马_木格窗白衬衫粉裙甜笑定妆.jpg",
    "still_13_14_15m23s_小茜与女乱马_甜品店双美举杯合照.jpg",
    "still_14_15_15m26s_珊璞_书店灰针织衫持书定妆.jpg",
    "still_15_16_15m27s_珊璞与女乱马与小靡_书店三美合照.jpg",
    "still_16_17_15m31s_小茜与珊璞_夕阳咖啡馆门前双美合照.jpg",
    "still_17_18_15m43s_小茜与女乱马与珊璞_街头便服三美合照.jpg",
    "still_18_19_15m56s_天道小茜_教室窗边逆光长发校服定妆.jpg",
    "still_19_20_16m10s_天道小茜_河畔清爽短发回眸定妆.jpg",
    "still_20_21_16m19s_天道小茜_怀抱小黑猪P酱治愈微笑.jpg",
    "still_21_22_16m47s_小茜与女乱马与小靡_校服街头三人并排.jpg",
    "still_22_23_16m57s_久远寺右京_大阪烧店服黄发带定妆.jpg",
    "still_23_24_19m48s_天道小霞_海风回眸绝美颜值特写.jpg",
    "still_24_25_19m56s_珊璞_海风紫发头饰绝美颜值特写.jpg",
    "still_25_26_20m03s_女乱马_海风红发冷艳颜值特写.jpg",
    "still_26_27_21m53s_九能小太刀_海风黑发红丝带颜值特写.jpg",
    "still_27_28_26m35s_女乱马_街头吃冰淇淋俏皮微笑特写.jpg",
    "still_ep06_01_00-00-56.183_天道茜_教室窗边校服.jpg",
    "still_ep06_02_00-01-16.499_短发棕发少女_校园走廊校服定妆.jpg",
    "still_ep06_03_00-01-45.134_短发棕发少女_教室拿书.jpg",
    "still_ep06_04_00-05-01.683_老年女性_街巷指路.jpg",
    "still_ep06_05_00-08-38.950_女乱马_白墙辫子定妆.jpg",
    "still_ep06_06_00-11-49.801_女乱马_樱花下黑衣整理辫子.jpg",
    "still_ep06_07_00-13-10.000_黑发红缎带少女_樱花特写.jpg",
    "still_ep06_08_00-15-39.950_女乱马_白蕾丝上衣定妆.jpg",
    "still_ep06_09_00-16-52.100_女乱马_校服店内.jpg",
    "still_ep06_10_00-16-57.250_久遠寺右京_お好み焼き店烹饪.jpg",
    "still_ep06_11_00-18-41.584_女性主持人_舞台西装.jpg",
    "still_ep06_12_00-26-37.750_女乱马_街头冰淇淋.jpg",
    "still_ep06_13_00-28-15.717_天道茜_日落片尾定妆.jpg"
  ]
  const wallpapersJson = JSON.stringify(wallpapers)

  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob: file:;"><title>🔴 #${number}${aliasText ? ` · ${escape(aliasText)}` : ''} · ${escape(profile.name)}</title><style>
*{box-sizing:border-box}
body{
  margin:0;
  padding:36px 20px;
  min-height:100vh;
  font:14px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif;
  color:#1e293b;
  -webkit-font-smoothing:antialiased;
  background-color:#0f172a;
  background-size:cover;
  background-position:center center;
  background-repeat:no-repeat;
  background-attachment:fixed;
  transition:background-image 0.5s ease-in-out;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
}
.bg-overlay{
  position:fixed;
  top:0;left:0;right:0;bottom:0;
  background:rgba(15,23,42,0.38);
  backdrop-filter:blur(3px);
  -webkit-backdrop-filter:blur(3px);
  z-index:0;
}
main{
  position:relative;
  z-index:1;
  width:100%;
  max-width:820px;
  margin:0 auto;
  background:rgba(255,255,255,0.92);
  backdrop-filter:blur(16px);
  -webkit-backdrop-filter:blur(16px);
  padding:34px 40px 38px;
  border-radius:20px;
  box-shadow:0 20px 50px rgba(0,0,0,0.35),0 2px 6px rgba(0,0,0,0.1);
  border:1px solid rgba(255,255,255,0.6);
}
.top-bar{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
.ip-block{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.profile-badge{display:inline-flex;align-items:center;justify-content:center;height:40px;padding:0 16px;border-radius:10px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;font-size:20px;font-weight:900;letter-spacing:-.02em;font-variant-numeric:tabular-nums;box-shadow:0 4px 14px rgba(220,38,38,.28)}
.tags-row{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}
.notion-tag-pill{display:inline-flex;align-items:center;height:28px;padding:0 10px;border-radius:6px;font-size:13px;font-weight:600;border:1px solid;letter-spacing:-.01em;user-select:none}
.alias-badge{display:inline-flex;align-items:center;height:36px;padding:0 13px;border-radius:9px;background:#fef2f2;border:1.5px solid #fecaca;color:#dc2626;font-size:14px;font-weight:700}
h1{color:#2563eb;font-size:36px;font-weight:800;letter-spacing:-.03em;margin:0;line-height:1.1;font-variant-numeric:tabular-nums}
time{color:#dc2626;font:700 18px/1.2 "SF Mono",ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em;background:rgba(254,242,242,0.9);padding:7px 12px;border-radius:8px;border:1px solid #fecaca}
.meta-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:20px 0 24px;padding:13px 16px;background:rgba(248,250,252,0.85);border:1px solid #eef2f6;border-radius:11px;font-size:13px;color:#64748b}
.meta-strip strong{color:#0f172a;font-weight:600;margin-left:4px}
.section-title{font-size:13px;font-weight:700;color:#0f172a;margin:22px 0 10px;padding-top:18px;border-top:1px solid #eef2f6;display:flex;align-items:center;justify-content:space-between}
.section-title:first-of-type{border-top:0;padding-top:4px;margin-top:0}
.info-list{display:grid;gap:4px}
.info-row{display:grid;grid-template-columns:160px minmax(0,1fr);align-items:center;padding:10px 14px;border-radius:8px;font-size:13.5px}
.info-row:nth-child(odd){background:rgba(248,250,252,0.75)}
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
.wallpaper-credit{
  position:fixed;
  bottom:12px;
  right:16px;
  z-index:2;
  font-size:12px;
  font-weight:600;
  color:rgba(255,255,255,0.75);
  background:rgba(0,0,0,0.4);
  padding:4px 10px;
  border-radius:6px;
  backdrop-filter:blur(4px);
  user-select:none;
  letter-spacing:0.02em;
}
</style><div class="bg-overlay"></div><main>
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
</main>
<div class="wallpaper-credit" id="wallpaperTitle">らんま1/2 · 4K</div>
<script>
document.getElementById('observed').textContent = navigator.userAgent;

var wallpapers = ${wallpapersJson};
var chosen = wallpapers[Math.floor(Math.random() * wallpapers.length)];
document.body.style.backgroundImage = 'url("' + encodeURI(chosen) + '")';

var titleElem = document.getElementById('wallpaperTitle');
if (titleElem) {
  var isOfficial = chosen.indexOf('official') === 0;
  titleElem.textContent = isOfficial ? 'らんま1/2 (2024) 官方主视觉' : 'らんま1/2 · 4K 原画精选';
}

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
