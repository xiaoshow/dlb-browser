const { app, BrowserWindow, session } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { pathToFileURL } = require('node:url')
const { createHash } = require('node:crypto')
const root = fs.mkdtempSync(join(tmpdir(), 'prism-audit-'))
app.setPath('userData', root)
const hash = text => createHash('sha256').update(text).digest('hex')
const report = { runtime: {}, storage: {}, fingerprint: {}, findings: [] }
let cachedCounter = 0
const workerSource = `onmessage=async()=>{const c=new OffscreenCanvas(32,32);const ctx=c.getContext('2d');ctx.fillStyle='rgb(100,120,140)';ctx.fillRect(0,0,32,32);const blob=await c.convertToBlob();const bytes=new Uint8Array(await blob.arrayBuffer());postMessage({canvas:Array.from(bytes),memory:navigator.deviceMemory,cores:navigator.hardwareConcurrency,language:navigator.language,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone})}`
const server = require('node:http').createServer((req,res)=>{
  if(req.url==='/worker.js'){res.setHeader('Content-Type','text/javascript');res.end(workerSource)}
  else if(req.url==='/sw.js'){res.setHeader('Content-Type','text/javascript');res.end("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()))")}
  else if(req.url==='/cached'){res.setHeader('Cache-Control','public, max-age=3600');res.end(String(++cachedCounter))}
  else {res.setHeader('Content-Type','text/html');res.end('<title>Temporary local audit</title>')}
})
const windows=[]
const timer=setTimeout(()=>{console.error('Audit timed out');app.exit(1)},45000)
app.whenReady().then(async()=>{
  if(process.platform==='darwin') app.setActivationPolicy('accessory')
  report.runtime={electron:process.versions.electron,chrome:process.versions.chrome,platform:process.platform}
  const {applyProfileEnvironment}=await import(pathToFileURL(join(__dirname,'../dist-electron/environment.js')))
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const origin=`http://127.0.0.1:${server.address().port}`
  async function create(id,fp={}) {
    const ses=session.fromPartition(`persist:audit-${id}`)
    const win=new BrowserWindow({show:false,webPreferences:{session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false}})
    windows.push(win)
    await win.loadURL('about:blank')
    await applyProfileEnvironment(win.webContents,{id,fingerprint:{seed:id,canvas:'noise',webGL:'noise',audio:'noise',...fp},webRTCPolicy:'proxy-only'})
    await win.loadURL(origin)
    return win
  }
  const a=await create('alpha'),b=await create('beta')
  const read=win=>win.webContents.executeJavaScript(`(async()=>{
    const c=document.createElement('canvas');c.width=32;c.height=32;const ctx=c.getContext('2d');ctx.fillStyle='rgb(100,120,140)';ctx.fillRect(0,0,32,32);
    const off=new OffscreenCanvas(32,32);const oc=off.getContext('2d');oc.fillStyle='rgb(100,120,140)';oc.fillRect(0,0,32,32);const blob=await off.convertToBlob();
    const worker=await new Promise((resolve,reject)=>{const w=new Worker('/worker.js');w.onmessage=e=>{w.terminate();resolve(e.data)};w.onerror=reject;w.postMessage(1)});
    const gl=document.createElement('canvas').getContext('webgl');let metadata=null;if(gl){gl.getExtension('WEBGL_debug_renderer_info');metadata=[gl.getParameter(37445),gl.getParameter(37446)]}
    return {canvas:c.toDataURL(),offscreen:Array.from(new Uint8Array(await blob.arrayBuffer())),worker,metadata,ua:navigator.userAgent,platform:navigator.platform,languages:navigator.languages,memory:navigator.deviceMemory,cores:navigator.hardwareConcurrency,noiseDetectable:Function.prototype.toString.call(CanvasRenderingContext2D.prototype.getImageData),fontWidth:ctx.measureText('Fingerprint audit').width,node:typeof require,bridge:typeof window.profileBrowser}
  })()`)
  const fa=await read(a),fb=await read(b),again=await read(a)
  report.fingerprint={mainCanvasDifferent:hash(fa.canvas)!==hash(fb.canvas),mainCanvasStable:hash(fa.canvas)===hash(again.canvas),offscreenSame:hash(JSON.stringify(fa.offscreen))===hash(JSON.stringify(fb.offscreen)),workerCanvasSame:hash(JSON.stringify(fa.worker.canvas))===hash(JSON.stringify(fb.worker.canvas)),defaultGPUIdentical:JSON.stringify(fa.metadata)===JSON.stringify(fb.metadata),defaultUAIdentical:fa.ua===fb.ua,defaultPlatformIdentical:fa.platform===fb.platform,defaultFontsIdentical:fa.fontWidth===fb.fontWidth,uaMentionsElectron:fa.ua.includes('Electron/'),patchedFunctionText:fa.noiseDetectable}
  assert.equal(report.fingerprint.mainCanvasDifferent,true);assert.equal(report.fingerprint.mainCanvasStable,true)
  assert.equal(fa.node,'undefined');assert.equal(fa.bridge,'undefined')
  await a.webContents.executeJavaScript(`(async()=>{document.cookie='account=alpha';localStorage.setItem('account','alpha');sessionStorage.setItem('account','alpha');const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('account',1);r.onupgradeneeded=()=>r.result.createObjectStore('values');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});await new Promise((resolve,reject)=>{const tx=db.transaction('values','readwrite');tx.objectStore('values').put('alpha','id');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();await caches.open('alpha-cache');await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready})()`)
  const stores=win=>win.webContents.executeJavaScript(`(async()=>({cookie:document.cookie,local:localStorage.getItem('account'),session:sessionStorage.getItem('account'),databases:(await indexedDB.databases()).map(d=>d.name),caches:await caches.keys(),workers:(await navigator.serviceWorker.getRegistrations()).length}))()`)
  const sa=await stores(a),sb=await stores(b)
  report.storage={cookies:!sb.cookie,localStorage:sb.local===null,sessionStorage:sb.session===null,indexedDB:!sb.databases.includes('account'),cacheStorage:!sb.caches.includes('alpha-cache'),serviceWorkers:sb.workers===0,sourceWritten:sa.local==='alpha'&&sa.workers>0}
  await b.webContents.executeJavaScript("window.received=false;window.bc=new BroadcastChannel('isolation');window.bc.onmessage=()=>window.received=true;void 0")
  await a.webContents.executeJavaScript("window.bc=new BroadcastChannel('isolation');window.bc.postMessage('alpha')")
  await new Promise(resolve=>setTimeout(resolve,250))
  report.storage.broadcastChannel=!(await b.webContents.executeJavaScript('window.received'))
  const aCache=await a.webContents.executeJavaScript("fetch('/cached').then(r=>r.text())")
  const aCacheAgain=await a.webContents.executeJavaScript("fetch('/cached').then(r=>r.text())")
  const bCache=await b.webContents.executeJavaScript("fetch('/cached').then(r=>r.text())")
  report.storage.httpCache=aCache===aCacheAgain&&aCache!==bCache
  assert.ok(Object.values(report.storage).every(Boolean))
  const custom=await create('custom',{deviceMemory:2,maxTouchPoints:5,webGPU:'disabled'})
  const customRead=await read(custom)
  report.fingerprint.customPageMemory=customRead.memory
  report.fingerprint.customWorkerMemory=customRead.worker.memory
  report.fingerprint.workerMemoryMismatch=customRead.memory!==customRead.worker.memory
  // A same-origin popup follows the exact event timing used by production.
  const popups=[];let popupApply
  custom.webContents.setWindowOpenHandler(()=>({action:'allow',overrideBrowserWindowOptions:{show:false,webPreferences:{session:custom.webContents.session,sandbox:true,contextIsolation:true,nodeIntegration:false}}}))
  custom.webContents.on('did-create-window',popup=>{popups.push(popup);popupApply=applyProfileEnvironment(popup.webContents,{id:'custom',fingerprint:{seed:'custom',deviceMemory:2,canvas:'noise'}}).catch(e=>({error:e.message}))})
  await custom.webContents.executeJavaScript(`void window.open('/?popup','_blank')`)
  for(let n=0;n<100&&!popups.length;n++)await new Promise(r=>setTimeout(r,10))
  if(popups.length){const popup=popups[0];await new Promise(r=>setTimeout(r,150));await popupApply;report.fingerprint.popupMemory=await popup.webContents.executeJavaScript('navigator.deviceMemory');for(const p of popups)p.destroy()}
  assert.ok(windows.every(w=>!w.isVisible()))
  const out=join(__dirname,'../release/audit');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(join(out,'isolation-audit.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
  for(const w of windows)w.destroy();await new Promise(r=>server.close(r));clearTimeout(timer);app.exit(0)
}).catch(error=>{console.error(error);app.exit(1)})
app.on('quit',()=>fs.rmSync(root,{recursive:true,force:true}))
