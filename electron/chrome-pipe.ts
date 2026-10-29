import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'

/** Private inherited pipes: no debugging port exposed to other local pages. */
export class ChromePipe extends EventEmitter {
  readonly sessions = new Map<string, string>()
  private closed = false
  private sequence = 0
  private buffer = ''
  private pending = new Map<number, { resolve: (result: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  constructor(private child: ChildProcess) {
    super()
    ;(child.stdio[4] as Readable).setEncoding('utf8').on('data', (chunk: string) => {
      this.buffer += chunk
      let end: number
      while ((end = this.buffer.indexOf('\0')) >= 0) {
        const text = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1)
        if (!text) continue
        const message = JSON.parse(text)
        if (message.method === 'Target.attachedToTarget') this.sessions.set(message.params.targetInfo.targetId, message.params.sessionId)
        if (message.method === 'Target.detachedFromTarget') {
          for (const [target, sid] of this.sessions) if (sid === message.params.sessionId) this.sessions.delete(target)
        }
        if (message.method === 'Target.targetDestroyed') this.sessions.delete(message.params.targetId)
        const pending = this.pending.get(message.id)
        if (pending) { clearTimeout(pending.timer); this.pending.delete(message.id); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result) }
        else if (message.method) this.emit(message.method, message.params, message.sessionId)
      }
    })
    const close = () => { this.closed = true; this.sessions.clear(); this.buffer = ''; this.removeAllListeners(); for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('浏览器已关闭')) }; this.pending.clear() }
    child.once('exit', close); child.once('error', close)
    ;(child.stdio[3] as Writable).on('error', close)
  }
  send(method: string, params: object = {}, sessionId?: string): Promise<any> {
    if (this.closed) return Promise.reject(new Error('浏览器已关闭'))
    return new Promise((resolve, reject) => {
      const id = ++this.sequence
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`浏览器指令超时：${method}`)) }, 12000)
      this.pending.set(id, { resolve, reject, timer })
      ;(this.child.stdio[3] as Writable).write(JSON.stringify({ id, method, params, sessionId }) + '\0', error => { if (error) { clearTimeout(timer); this.pending.delete(id); reject(error) } })
    })
  }
}
