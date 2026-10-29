const { app, BrowserWindow, session } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync, writeFileSync, rmSync, readFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')
const root = mkdtempSync(join(tmpdir(), 'prism-native-integration-'))
app.setPath('userData',root)
process.env.ORBIT_BACKGROUND_TEST='1'
const timer=setTimeout(()=>{console.error('Native integration timed out');app.exit(1)},60000)
const pause=()=>new Promise(r=>setTimeout(r,50))
async function wait(fn){for(let i=0;i<200;i++){const v=await fn();if(v)return v;await pause()}throw Error('timeout')}
;(async()=>{
 const profiles=['alpha','beta'].map(id=>({id,name:id,number:id==='alpha'?21:22,proxyId:'direct',timezone:'auto',locale:'auto',fingerprint:{seed:id,geolocationMode:'ip'},startUrl:'https://example.com',userAgentMode:'real'}))
 const state={presentationMode:'windows',profiles,proxies:[{id:'direct',kind:'direct',name:'Test'}],groups:[{id:'default',name:'Test'}],preloadOnStart:false}
 writeFileSync(join(root,'workspace.json'),JSON.stringify(state))
 await app.whenReady();app.setActivationPolicy('accessory')
 session.fromPartition('prism-net-probe').fetch=async()=>new Response(JSON.stringify({ip:'203.0.113.10',timezone:'Asia/Tokyo',languages:'ja-JP',latitude:35.6,longitude:139.6,country_name:'Japan',city:'Tokyo'}),{headers:{'content-type':'application/json'}})
 await import(pathToFileURL(join(__dirname,'../dist-electron/main.js')))
 const manager=await wait(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/dist/index.html')&&!w.webContents.isLoading()))
 const api=(method,...args)=>manager.webContents.executeJavaScript(`window.profileBrowser.${method}(...${JSON.stringify(args)})`)
 await wait(()=>manager.webContents.executeJavaScript('!!window.profileBrowser'))
 const probe=session.fromPartition('prism-net-probe'),originalFetch=probe.fetch,originalSetProxy=probe.setProxy.bind(probe)
 let activeRule=''
 probe.setProxy=async(config)=>{activeRule=config.mode||config.proxyRules;await new Promise(r=>setTimeout(r,20));return originalSetProxy(config)}
 probe.fetch=async(url)=>{const rule=activeRule;await new Promise(r=>setTimeout(r,50));assert.equal(activeRule,rule,'shared Session proxy changed during request');const ip=rule==='direct'?'203.0.113.11':'203.0.113.12';return String(url).includes('ipapi.co')?new Response(JSON.stringify({ip,timezone:'Asia/Tokyo',languages:'ja-JP',latitude:35.6,longitude:139.6})):new Response(ip)}
 const checks=await Promise.all([api('testProxy',{id:'probe-direct',kind:'direct'}),api('testProxy',{id:'probe-socks',kind:'socks5',host:'127.0.0.1',port:19999})])
 assert.deepEqual(checks.map(r=>r.ip),['203.0.113.11','203.0.113.12'])
 probe.fetch=originalFetch;probe.setProxy=originalSetProxy
 console.log('PASS concurrent proxy probes retain their selected route across all requests')
 for(const p of profiles) {const result=await api('openProfile',p,state.proxies[0]);assert.equal(result.ok,true,result.error)}
 assert.deepEqual((await api('getRunningProfiles')).sort(),['alpha','beta'])
 assert.equal(BrowserWindow.getAllWindows().length,1)
 assert.ok(!manager.isVisible())
 await api('openProfile',profiles[0],state.proxies[0]);assert.equal((await api('getRunningProfiles')).length,2)
 assert.match(readFileSync(join(root,'native-profiles/alpha/prism-start.html'),'utf8'),/203.0.113.11/)
 await api('closeProfile','alpha');assert.deepEqual(await api('getRunningProfiles'),['beta'])
 await api('closeProfile','beta');assert.deepEqual(await api('getRunningProfiles'),[])
 assert.equal((await api('loadState')).profiles[0].number,21)
 console.log('PASS unified manager → native independent processes, IP-linked startup, duplicate launch, close, safe mode switch, stable numbers; no visible windows')
 const reopened=await api('openProfile',profiles[0],state.proxies[0]);assert.equal(reopened.ok,true,reopened.error)
 app.once('will-quit',()=>{const lines=require('node:child_process').execFileSync('/bin/ps',['-axo','command='],{encoding:'utf8'}).split('\n');assert.ok(!lines.some(line=>line.includes('--user-data-dir='+join(root,'native-profiles'))&&!line.includes('--type=')));console.log('PASS close manager quits its active native Profile, no managed browser left running')})
 clearTimeout(timer);manager.close()
})().catch(e=>{console.error(e);clearTimeout(timer);app.once('will-quit',()=>app.exit(1));app.quit()})
app.on('quit',()=>rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:200}))
