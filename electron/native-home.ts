export function nativeHome(profile: any, number: number, proxy: any, location: any, version: string) {
  const escape = (value: unknown) => String(value ?? '未检测').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
  const tz = profile.timezone === 'local' ? 'System' : (location?.timezone || profile.timezone || 'Auto')
  const locText = location ? `${location.country}${location.city ? ` / ${location.city}` : ''}` : 'Direct / System Network'
  const proxyLabel = !proxy || proxy.kind === 'direct'
    ? 'Direct (No Proxy)'
    : proxy.kind === 'system'
      ? 'System Proxy (跟随系统代理)'
      : `${proxy.name} · ${proxy.kind.toUpperCase()}${proxy.host ? ` (${proxy.host}:${proxy.port})` : ''}`
  const aliasText = (profile.alias || '').trim()
  const tags: string[] = Array.from(new Set(aliasText.split(/[,，]/).map((t: string) => t.trim()).filter((t: string) => Boolean(t))))
  const TAG_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    gray: { bg: 'rgba(227,226,224,0.7)', text: '#1e293b', border: 'rgba(213,212,210,0.8)' },
    brown: { bg: 'rgba(238,224,218,0.7)', text: '#442a1e', border: 'rgba(226,207,199,0.8)' },
    orange: { bg: 'rgba(250,222,201,0.7)', text: '#49290e', border: 'rgba(245,204,169,0.8)' },
    yellow: { bg: 'rgba(253,236,200,0.7)', text: '#402c1b', border: 'rgba(251,226,163,0.8)' },
    green: { bg: 'rgba(219,237,219,0.7)', text: '#1c3829', border: 'rgba(195,225,195,0.8)' },
    blue: { bg: 'rgba(211,229,239,0.7)', text: '#183347', border: 'rgba(183,213,230,0.8)' },
    purple: { bg: 'rgba(232,222,238,0.7)', text: '#412454', border: 'rgba(218,202,227,0.8)' },
    pink: { bg: 'rgba(245,224,233,0.7)', text: '#4c2337', border: 'rgba(236,204,219,0.8)' },
    red: { bg: 'rgba(255,226,221,0.7)', text: '#5d1715', border: 'rgba(250,208,200,0.8)' },
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

  const basicRows: [string, string][] = [
    ['Profile ID', `#${number}`],
    ['Tags / 标签用途', tags.length ? tags.join(', ') : '—'],
    ['Name', profile.name],
    ['Proxy', proxyLabel],
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
    "still_ep06_10_00-16-57.250_久远寺右京_お好み焼き店烹饪.jpg",
    "still_ep06_11_00-18-41.584_女性主持人_舞台西装.jpg",
    "still_ep06_12_00-26-37.750_女乱马_街头冰淇淋.jpg",
    "still_ep06_13_00-28-15.717_天道茜_日落片尾定妆.jpg"
  ]
  const wallpapersJson = JSON.stringify(wallpapers)

  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob: file:;"><title>🔴 #${number}${aliasText ? ` · ${escape(aliasText)}` : ''} · ${escape(profile.name)}</title><style>
*{box-sizing:border-box}
body{
  margin:0;
  padding:28px 20px;
  min-height:100vh;
  font:13.5px/1.45 -apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif;
  color:#0f172a;
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
main{
  position:relative;
  z-index:1;
  width:100%;
  max-width:700px;
  margin:0 auto;
  background:rgba(255,255,255,0.28);
  backdrop-filter:blur(24px) saturate(180%);
  -webkit-backdrop-filter:blur(24px) saturate(180%);
  padding:22px 28px 24px;
  border-radius:20px;
  box-shadow:0 16px 40px rgba(0,0,0,0.22), 0 1px 2px rgba(255,255,255,0.5) inset;
  border:1.5px solid rgba(255,255,255,0.45);
  transition:all 0.3s ease-in-out;
}
main.collapsed{
  max-width:540px;
  padding:14px 20px;
}
.top-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.ip-block{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.profile-badge{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  height:34px;
  padding:0 13px;
  border-radius:8px;
  background:linear-gradient(135deg,#ef4444,#dc2626);
  color:#fff;
  font-size:17px;
  font-weight:900;
  letter-spacing:-.02em;
  font-variant-numeric:tabular-nums;
  box-shadow:0 3px 10px rgba(220,38,38,.28);
}
.tags-row{display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap}
.notion-tag-pill{
  display:inline-flex;
  align-items:center;
  height:24px;
  padding:0 8px;
  border-radius:5px;
  font-size:12px;
  font-weight:700;
  border:1px solid;
  letter-spacing:-.01em;
  user-select:none;
  backdrop-filter:blur(6px);
}
h1{
  color:#1d4ed8;
  font-size:30px;
  font-weight:900;
  letter-spacing:-.03em;
  margin:0;
  line-height:1.1;
  font-variant-numeric:tabular-nums;
  text-shadow:0 1px 2px rgba(255,255,255,0.8);
}
time{
  color:#b91c1c;
  font:800 15px/1.2 "SF Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing:.02em;
  background:rgba(254,242,242,0.65);
  padding:5px 10px;
  border-radius:7px;
  border:1px solid rgba(254,202,202,0.8);
  backdrop-filter:blur(6px);
}
.meta-strip{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:10px;
  margin:12px 0 14px;
  padding:9px 14px;
  background:rgba(255,255,255,0.35);
  border:1px solid rgba(255,255,255,0.5);
  border-radius:10px;
  font-size:12.5px;
  color:#334155;
  backdrop-filter:blur(8px);
}
.meta-strip strong{color:#0f172a;font-weight:700;margin-left:4px}
.section-title{
  font-size:12.5px;
  font-weight:800;
  color:#0f172a;
  margin:12px 0 8px;
  letter-spacing:0.02em;
}
.info-list{display:grid;gap:4px}
.info-row{
  display:grid;
  grid-template-columns:140px minmax(0,1fr);
  align-items:center;
  padding:7px 12px;
  border-radius:7px;
  font-size:13px;
}
.info-row:nth-child(odd){background:rgba(255,255,255,0.3)}
.info-label{color:#475569;font-weight:600}
.info-value{color:#0f172a;font-weight:600;overflow-wrap:anywhere}

.collapsible-content{
  transition:all 0.25s ease-in-out;
}
main.collapsed .collapsible-content{
  display:none;
}

.bottom-bar{
  position:fixed;
  bottom:16px;
  right:20px;
  z-index:2;
  display:flex;
  align-items:center;
  gap:10px;
}
.btn-toggle{
  display:inline-flex;
  align-items:center;
  gap:5px;
  font-size:12px;
  font-weight:700;
  color:rgba(255,255,255,0.95);
  background:rgba(0,0,0,0.45);
  padding:5px 12px;
  border-radius:8px;
  backdrop-filter:blur(8px);
  border:1px solid rgba(255,255,255,0.3);
  cursor:pointer;
  user-select:none;
  transition:all 0.15s ease-in-out;
}
.btn-toggle:hover{
  background:rgba(0,0,0,0.65);
  transform:scale(1.03);
}
.wallpaper-credit{
  font-size:11.5px;
  font-weight:700;
  color:rgba(255,255,255,0.9);
  background:rgba(0,0,0,0.4);
  padding:5px 12px;
  border-radius:8px;
  backdrop-filter:blur(8px);
  user-select:none;
  border:1px solid rgba(255,255,255,0.25);
  box-shadow:0 3px 10px rgba(0,0,0,0.2);
}
</style><main id="mainCard">
  <div class="top-bar">
    <div class="ip-block">
      <span class="profile-badge">#${number}</span>
      ${tagsHtml}
      <h1>${escape(location?.ip || '出口 IP 未检测')}</h1>
    </div>
    <time id="clock">--:--:--</time>
  </div>
  <div class="collapsible-content">
    <div class="meta-strip">
      <div>Location: <strong>${escape(locText)}</strong></div>
      <div>Timezone: <strong>${escape(tz)}</strong></div>
    </div>
    <div class="section-title"><span>Basic Information</span></div>
    <div class="info-list">
      ${basicRows.map(([k, v]) => `<div class="info-row"><span class="info-label">${escape(k)}</span><span class="info-value">${escape(v)}</span></div>`).join('')}
    </div>
  </div>
</main>
<div class="bottom-bar">
  <button class="btn-toggle" id="toggleBtn" onclick="toggleCollapse()">
    <span id="toggleIcon">👁</span> <span id="toggleText">只看乱马</span>
  </button>
  <div class="wallpaper-credit" id="wallpaperTitle">らんま1/2 · 4K</div>
</div>
<script>
var wallpapers = ${wallpapersJson};
var chosen = wallpapers[Math.floor(Math.random() * wallpapers.length)];
document.body.style.backgroundImage = 'url("' + encodeURI(chosen) + '")';

var titleElem = document.getElementById('wallpaperTitle');
if (titleElem) {
  var isOfficial = chosen.indexOf('official') === 0;
  titleElem.textContent = isOfficial ? 'らんま1/2 (2024) 官方主视觉' : 'らんま1/2 · 4K 原画精选';
}

function toggleCollapse(){
  var card = document.getElementById('mainCard');
  var btnText = document.getElementById('toggleText');
  var isCollapsed = card.classList.toggle('collapsed');
  btnText.textContent = isCollapsed ? '展开信息' : '只看乱马';
  try {
    localStorage.setItem('dlb_start_collapsed', isCollapsed ? '1' : '0');
  } catch(e){}
}

try {
  if (localStorage.getItem('dlb_start_collapsed') === '1') {
    document.getElementById('mainCard').classList.add('collapsed');
    document.getElementById('toggleText').textContent = '展开信息';
  }
} catch(e){}

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
