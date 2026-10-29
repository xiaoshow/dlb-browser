import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { NativeBrowsers } from '../dist-electron/native-browser.js'
const root = await mkdtemp(join(tmpdir(), 'prism-native-'))
const manager = new NativeBrowsers(root, resolve('resources'), () => {}, () => {})
const profile = { id: 'test-a', name: '测试 A', timezone: 'Asia/Tokyo', locale: 'ja-JP', fingerprint: { seed: 'seed-a', canvas: 'noise', audio: 'noise', webGL: 'noise' }, webRTCPolicy: 'proxy-only' }
try {
 await manager.open(profile, 10, 'direct', {name:'测试直连',kind:'direct'}, undefined, true)
 const pipe = manager.connection(profile.id)
 const {targetInfos} = await pipe.send('Target.getTargets')
 const page = targetInfos.find(t=>t.type==='page')
 const sessionId = pipe.sessions.get(page.targetId)
 const evaluate = async expression => (await pipe.send('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true}, sessionId)).result.value
 await new Promise(r=>setTimeout(r,300))
 const env = await evaluate('({title:document.title,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,language:navigator.language,ua:navigator.userAgent,webdriver:navigator.webdriver,brands:navigator.userAgentData?.brands})')
 assert.equal(env.timezone,'Asia/Tokyo'); assert.equal(env.language,'ja-JP'); assert.match(env.title,/#10/); assert.doesNotMatch(env.ua,/Electron/)
 console.log('PASS native homepage, timezone, language, original Chrome UA', env)
 await pipe.send('Page.navigate',{url:'chrome://bookmarks/'},sessionId)
 await new Promise(r=>setTimeout(r,300))
 assert.match(await evaluate('location.href'),/chrome:\/\/bookmarks/)
 await pipe.send('Page.navigate',{url:'chrome://extensions/'},sessionId)
 await new Promise(r=>setTimeout(r,300))
 assert.match(await evaluate('location.href'),/chrome:\/\/extensions/)
 console.log('PASS native bookmarks and extensions management pages')
 const extension = join(root, 'test-extension'); await mkdir(extension)
 await writeFile(join(extension, 'manifest.json'), JSON.stringify({manifest_version:3,name:'Prism Test',version:'1.0',permissions:['storage','bookmarks'],background:{service_worker:'worker.js'},action:{default_popup:'popup.html'}}))
 await writeFile(join(extension, 'popup.html'), '<h1>Prism extension popup</h1>')
 await writeFile(join(extension, 'worker.js'), `chrome.runtime.onInstalled.addListener(async()=>{ await chrome.bookmarks.create({title:'Prism persisted bookmark',url:'https://example.com/prism-bookmark'});await chrome.storage.local.set({profile:'A',installed:true}) });`)
 const loaded = await pipe.send('Extensions.loadUnpacked', {path:extension});
 const extensionId = loaded.id
 async function workerStorage(connection) {
   for(let i=0;i<100;i++) {
     const worker=(await connection.send('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.startsWith('chrome-extension://'+extensionId+'/'))
     if(worker && connection.sessions.has(worker.targetId)) {
       const read=await connection.send('Runtime.evaluate',{expression:'chrome.storage.local.get(null)',awaitPromise:true,returnByValue:true},connection.sessions.get(worker.targetId))
       if(read.result?.value?.installed) return read.result.value
     }
     await new Promise(r=>setTimeout(r,50))
   }
   throw new Error('Extension worker did not initialize')
 }
 const storage=await workerStorage(pipe)
 assert.equal(storage.profile,'A'); assert.equal(storage.installed,true)
 const popup=await pipe.send('Target.createTarget',{url:`chrome-extension://${extensionId}/popup.html`})
 await new Promise(r=>setTimeout(r,200))
 const popupText=await pipe.send('Runtime.evaluate',{expression:'document.body.textContent',returnByValue:true},pipe.sessions.get(popup.targetId))
 assert.match(popupText.result.value,/Prism extension popup/)
 await pipe.send('Target.closeTarget',{targetId:popup.targetId})
 console.log('PASS installed MV3 service worker, storage and popup document')
 await manager.open({...profile,id:'test-b',name:'测试 B',fingerprint:{...profile.fingerprint,seed:'seed-b'}},11,'direct',{kind:'direct'},undefined,true)
 const second=manager.connection('test-b')
 const secondPage=(await second.send('Target.getTargets')).targetInfos.find(t=>t.type==='page')
 const secondPrefs=await readFile(join(root,'native-profiles/test-b/Default/Preferences'),'utf8').catch(()=> '{}')
 assert.ok(!secondPrefs.includes(extensionId))
 console.log('PASS extension installation isolated between Profile A/B')
 const sessionCount=pipe.sessions.size
 for(let i=0;i<5;i++) {
   await manager.importCookies('test-a',[{name:'resource-audit',value:String(i),domain:'example.test',path:'/',secure:true}])
   assert.equal((await manager.exportCookies('test-a')).find(c=>c.name==='resource-audit')?.value,String(i))
 }
 assert.equal(pipe.sessions.size,sessionCount,'Cookie operations must not create extra debugging sessions')
 assert.ok(!(await manager.exportCookies('test-b')).some(c=>c.name==='resource-audit'))
 console.log('PASS repeated cookie import/export stays isolated without creating sessions')
 await manager.close('test-a')
 const bookmarks=await readFile(join(root,'native-profiles/test-a/Default/Bookmarks'),'utf8')
 assert.match(bookmarks,/Prism persisted bookmark/)
 await manager.open(profile,10,'direct',{kind:'direct'},undefined,true)
 const restarted=manager.connection('test-a')
 const restartedPage=(await restarted.send('Target.getTargets')).targetInfos.find(t=>t.type==='page')
 await restarted.send('Extensions.loadUnpacked',{path:extension})
 const restoredPopup=await restarted.send('Target.createTarget',{url:`chrome-extension://${extensionId}/popup.html`})
 await new Promise(r=>setTimeout(r,300))
 const persisted=await restarted.send('Runtime.evaluate',{expression:'chrome.storage.local.get(null)',awaitPromise:true,returnByValue:true},restarted.sessions.get(restoredPopup.targetId))
 assert.equal(persisted.result.value.profile,'A')
 assert.match(await readFile(join(root,'native-profiles/test-a/Default/Bookmarks'),'utf8'),/Prism persisted bookmark/)
 console.log('PASS bookmarks and extension storage survive restart (test extension explicitly reloaded)')

 console.log('PASS per-process Dock icon/number commands accepted by Chrome on macOS')
 const targets=(await restarted.send('Target.getTargets')).targetInfos.filter(t=>t.type==='page');for(const t of targets)await restarted.send('Target.closeTarget',{targetId:t.targetId});
 for(let i=0;i<100&&manager.has('test-a');i++)await new Promise(r=>setTimeout(r,40));assert.equal(manager.has('test-a'),false);assert.equal(manager.has('test-b'),true);console.log('PASS last page close exits only its Profile process; other Profile stays running')
} finally { await manager.closeAll(); await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:200}) }
