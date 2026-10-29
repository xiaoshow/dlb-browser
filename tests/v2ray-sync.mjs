import assert from 'node:assert/strict'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { readV2rayNodes, mergeV2rayFavorites, convertV2rayNode } from '../dist-electron/v2ray-sync.js'
import { buildConfig } from '../dist-electron/xray.js'
const row={IndexId:'fixture',ConfigType:5,Address:'2001:db8::1',Port:443,Password:'8f1e7777-bbbb-4ccc-8ddd-123456789abc',Network:'raw',StreamSecurity:'reality',PublicKey:'45I9t1RfZrF-pcnACtvUB0rA6Nu9jDJc9hb8R7uqM3M',Remarks:'Node #1',ProtoExtra:JSON.stringify({Flow:'xtls-rprx-vision',VlessEncryption:'none'})}
const node=convertV2rayNode(row);assert.equal(node.flow,'xtls-rprx-vision');assert.equal(node.transport,'tcp');assert.equal(node.name,'Node #1')
assert.throws(()=>convertV2rayNode({...row,Finalmask:'advanced'}))
const existing=[{...node,id:'keep-my-id',favorite:true,name:'old'}, {id:'manual',kind:'direct'}]
const merged=mergeV2rayFavorites(existing,[{...node,name:'new'}],['fixture'])
assert.equal(merged.proxies[0].id,'keep-my-id');assert.equal(merged.proxies[0].name,'new');assert.equal(existing[0].name,'old')
const unfav=mergeV2rayFavorites(merged.proxies,[node],[]);assert.equal(unfav.proxies[0].favorite,false);assert.equal(unfav.proxies.length,2)
assert.equal(mergeV2rayFavorites(merged.proxies,[],[]).proxies[0].id,'keep-my-id')
assert.throws(()=>mergeV2rayFavorites(existing,[node],['unknown']))
console.log('PASS VLESS conversion, selection only, stable binding IDs, unfavorite retention, removed-source retention')
const actual=await readV2rayNodes(join(homedir(),'Library/Application Support'))
const root=await mkdtemp(join(tmpdir(),'prism-sync-test-'))
try {
 for(let i=0;i<actual.nodes.length;i++) {const file=join(root,`${i}.json`);await writeFile(file,JSON.stringify(buildConfig(actual.nodes[i].shareUrl,18000)),{mode:0o600});execFileSync('resources/bin/xray',['run','-test','-c',file],{stdio:'pipe'})}
 console.log(`PASS read-only local scan: ${actual.nodes.length} VLESS; ${actual.skipped} skipped; every imported configuration accepted by Xray; no nodes imported into user state`)
} finally {await rm(root,{recursive:true,force:true})}
