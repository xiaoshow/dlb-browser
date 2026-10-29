import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { join,resolve } from 'node:path'
import { homedir,tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readV2rayNodes } from '../dist-electron/v2ray-sync.js'
import { startXray,stopAllXray } from '../dist-electron/xray.js'
const exec=promisify(execFile),appData=join(homedir(),'Library/Application Support')
const state=JSON.parse(await readFile(join(appData,'prism-fingerprint-browser/workspace.json'),'utf8'))
const nodes=(await readV2rayNodes(appData)).nodes
const root=await mkdtemp(join(tmpdir(),'prism-network-diagnose-'))
try{
 const runtime=JSON.parse(await readFile(join(appData,'v2rayN/binConfigs/config.json'),'utf8'));const active=runtime.outbounds.find(n=>n.type==='vless');const matching=nodes.find(n=>{const u=new URL(n.shareUrl);return u.hostname===active?.server && decodeURIComponent(u.username)===active?.uuid});
 const used=[...new Set([...state.profiles.map(p=>p.proxyId),...(matching?[matching.id]:[])])]
 for(const id of used){const stored=state.proxies.find(n=>n.id===id),node=nodes.find(n=>n.sourceId===stored?.sourceId)||nodes.find(n=>n.id===id);if(!node)continue
 const port=await startXray('diagnose',node.shareUrl,root,resolve('resources/bin/xray'))
 console.log('Test selected Profile node:',node.name,node.transport,node.security)
 for(const endpoint of ['https://api64.ipify.org']){
  const started=Date.now();try{const r=await exec('/usr/bin/curl',['--silent','--show-error','--fail','--connect-timeout','8','--max-time','12','--noproxy','','--socks5-hostname',`127.0.0.1:${port}`,endpoint]);console.log({via:'Prism Xray',endpoint,ok:true,ms:Date.now()-started,response:r.stdout.trim().slice(0,180)})}catch(e){console.log({via:'Prism Xray',endpoint,ok:false,code:e.code,detail:String(e.stderr).slice(0,200)})}
 }
 }
}finally{stopAllXray();await rm(root,{recursive:true,force:true})}
