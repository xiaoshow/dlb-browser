import assert from 'node:assert/strict'
import {mkdtemp,rm,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import { NativeBrowsers } from '../dist-electron/native-browser.js'
const root=await mkdtemp(join(tmpdir(),'prism-avatar-regression-'))
const manager=new NativeBrowsers(root,resolve('resources'),()=>{},()=>{})
try {
 for(const number of [0,1,9,10,20]) {
  const profile={id:`profile-${number}`,name:`Profile ${number}`,timezone:'Asia/Tokyo',locale:'ja-JP',fingerprint:{seed:'seed-a',canvas:'noise',audio:'noise',webGL:'noise'},webRTCPolicy:'proxy-only'}
  await manager.open(profile,number,'direct',{kind:'direct'},undefined,true)
  const pipe=manager.connection(profile.id)
  const version=await pipe.send('Browser.getVersion')
  assert.ok(version.product)
  const prefs=JSON.parse(await readFile(join(root,'native-profiles',profile.id,'Default/Preferences'),'utf8'))
  assert.equal(prefs.profile.avatar_index,0)
  await manager.close(profile.id)
 }
 console.log('PASS default-device Profile startup for numbers 0, 1, 9, 10, 20, including original crashing seed/number')
} finally {await manager.closeAll();await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:200})}
