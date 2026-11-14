export function nativeHome(profile: any, number: number, proxy: any, location: any, version: string) {
  const escape = (value: unknown) => String(value ?? '未检测').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
  const tz = profile.timezone === 'local' ? 'System' : (location?.timezone || profile.timezone || 'Auto')
  const locText = location ? `${location.country}${location.city ? ` / ${location.city}` : ''}` : 'Direct / System'
  const proxyLabel = !proxy || proxy.kind === 'direct'
    ? 'Direct'
    : proxy.kind === 'system'
      ? 'System Proxy'
      : `${proxy.name} (${proxy.kind.toUpperCase()})`
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
  padding:24px;
  min-height:100vh;
  font:13px/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif;
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
  align-items:flex-start;
  justify-content:flex-end;
}
main{
  position:relative;
  z-index:1;
  background:rgba(255,255,255,0.22);
  backdrop-filter:blur(20px) saturate(180%);
  -webkit-backdrop-filter:blur(20px) saturate(180%);
  padding:14px 18px;
  border-radius:14px;
  box-shadow:0 8px 24px rgba(0,0,0,0.18), 0 1px 1px rgba(255,255,255,0.4) inset;
  border:1px solid rgba(255,255,255,0.4);
  max-width:480px;
}
.header-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.profile-badge{display:inline-flex;align-items:center;justify-content:center;height:26px;padding:0 10px;border-radius:6px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;font-size:14px;font-weight:900;letter-spacing:-.02em;font-variant-numeric:tabular-nums;box-shadow:0 2px 6px rgba(220,38,38,.28)}
.tags-row{display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap}
.notion-tag-pill{display:inline-flex;align-items:center;height:22px;padding:0 7px;border-radius:4px;font-size:11.5px;font-weight:700;border:1px solid;letter-spacing:-.01em;user-select:none;backdrop-filter:blur(6px)}
.ip-text{color:#1d4ed8;font-size:20px;font-weight:900;letter-spacing:-.02em;line-height:1;font-variant-numeric:tabular-nums;text-shadow:0 1px 2px rgba(255,255,255,0.8);margin-left:auto}
time{color:#b91c1c;font:800 13px/1.2 "SF Mono",ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em;background:rgba(254,242,242,0.65);padding:3px 7px;border-radius:5px;border:1px solid rgba(254,202,202,0.7);backdrop-filter:blur(4px)}
.details{display:flex;flex-wrap:wrap;gap:10px 16px;font-size:12.5px;color:#1e293b;font-weight:600;padding-top:6px;border-top:1px solid rgba(255,255,255,0.35)}
.details div span{color:#475569;font-weight:500;margin-right:3px}
.wallpaper-credit{
  position:fixed;
  bottom:16px;
  right:20px;
  z-index:2;
  font-size:11.5px;
  font-weight:700;
  color:rgba(255,255,255,0.9);
  background:rgba(0,0,0,0.38);
  padding:3px 10px;
  border-radius:6px;
  backdrop-filter:blur(6px);
  user-select:none;
  border:1px solid rgba(255,255,255,0.2);
}
</style><main>
  <div class="header-row">
    <span class="profile-badge">#${number}</span>
    ${tagsHtml}
    <time id="clock">--:--:--</time>
    <div class="ip-text">${escape(location?.ip || '出口 IP 未检测')}</div>
  </div>
  <div class="details">
    <div><span>账号:</span><strong>${escape(profile.name)}</strong></div>
    <div><span>位置:</span><strong>${escape(locText)}</strong></div>
    <div><span>代理:</span><strong>${escape(proxyLabel)}</strong></div>
  </div>
</main>
<div class="wallpaper-credit" id="wallpaperTitle">らんま1/2 · 4K</div>
<script>
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
  document.getElementById('clock').textContent = pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
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
