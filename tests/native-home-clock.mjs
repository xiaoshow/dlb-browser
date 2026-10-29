import assert from 'node:assert/strict'
import { runInNewContext } from 'node:vm'
import { nativeHome } from '../dist-electron/native-home.js'
const documentListeners={},windowListeners={},timers=new Set(),clock={textContent:''}
const document={hidden:false,getElementById:()=>clock,addEventListener:(name,fn)=>{documentListeners[name]=fn}}
const window={addEventListener:(name,fn)=>{windowListeners[name]=fn}}
const html=nativeHome({id:'clock',name:'clock',timezone:'Asia/Tokyo'},1,{kind:'direct'},undefined,'Chromium')
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1]
runInNewContext(script,{document,window,navigator:{userAgent:'test'},Date,String,setInterval:fn=>{timers.add(fn);return fn},clearInterval:fn=>timers.delete(fn)})
assert.equal(timers.size,1)
document.hidden=true;documentListeners.visibilitychange();assert.equal(timers.size,0)
document.hidden=false;documentListeners.visibilitychange();assert.equal(timers.size,1)
windowListeners.pagehide();assert.equal(timers.size,0)
windowListeners.pageshow();assert.equal(timers.size,1)
console.log('PASS start page clock stops when hidden or unloaded and resumes without duplicate timers')
