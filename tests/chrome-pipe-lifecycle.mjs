import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { ChromePipe } from '../dist-electron/chrome-pipe.js'
const child = new EventEmitter()
child.stdio = [null,null,null,new PassThrough(),new PassThrough()]
child.stdio[3].resume()
const pipe = new ChromePipe(child)
const emit = (method,params) => child.stdio[4].write(JSON.stringify({method,params})+'\0')
for(let i=0;i<1000;i++) {
  emit('Target.attachedToTarget',{targetInfo:{targetId:`page-${i}`},sessionId:`session-${i}`})
  assert.equal(pipe.sessions.size,1)
  emit('Target.detachedFromTarget',{sessionId:`session-${i}`})
  assert.equal(pipe.sessions.size,0)
}
emit('Target.attachedToTarget',{targetInfo:{targetId:'destroyed'},sessionId:'last'})
emit('Target.targetDestroyed',{targetId:'destroyed'})
assert.equal(pipe.sessions.size,0)
let received = false
pipe.on('unused',()=>{received=true})
const pending = pipe.send('Pending.command')
child.emit('exit',0)
await assert.rejects(pending,/已关闭/)
await assert.rejects(pipe.send('After.close'),/已关闭/)
assert.equal(pipe.sessions.size,0)
assert.equal(pipe.eventNames().length,0)
assert.equal(received,false)
child.stdio[3].destroy();child.stdio[4].destroy()
console.log('PASS 1000 target attach/detach cycles retain no sessions; close releases listeners and pending requests')
