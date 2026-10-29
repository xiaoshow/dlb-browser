import assert from 'node:assert/strict'
import { createServer as httpServer } from 'node:http'
import { createServer, connect } from 'node:net'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startXray, stopAllXray } from '../dist-electron/xray.js'
const exec = promisify(execFile)
const root = await mkdtemp(join(tmpdir(), 'prism-vless-test-'))
const binary = fileURLToPath(new URL('../resources/bin/xray', import.meta.url))
const uuid = '8f1e7777-bbbb-4ccc-8ddd-123456789abc'
const server = httpServer((req, res) => res.end('prism-vless-tunnel-ok'))
await new Promise(r => server.listen(0, '127.0.0.1', r))
const targetPort = server.address().port
const children = []
async function freePort() { const s = createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const port = s.address().port; await new Promise(r => s.close(r)); return port }
async function ready(port) { for (let i=0;i<100;i++) { if (await new Promise(r => { const s=connect(port,'127.0.0.1'); s.on('connect',()=>{s.destroy();r(true)});s.on('error',()=>r(false)) })) return; await new Promise(r=>setTimeout(r,30)) } throw new Error('server timeout') }
try {
  await assert.rejects(startXray('missing', `vless://${uuid}@localhost:443`, root, join(root, 'missing-xray')), /无法启动 Xray/)
  for (const network of ['tcp', 'ws', 'grpc', 'xhttp']) {
    const port = await freePort()
    const streamSettings = { network, security: 'none', ...(network === 'ws' ? { wsSettings: { path: '/test' } } : {}), ...(network === 'grpc' ? { grpcSettings: { serviceName: 'test' } } : {}), ...(network === 'xhttp' ? { xhttpSettings: { path: '/test' } } : {}) }
    const file = join(root, `server-${network}.json`)
    await writeFile(file, JSON.stringify({ log: { loglevel: 'error' }, inbounds: [{ listen:'127.0.0.1', port, protocol:'vless', settings:{ clients:[{id:uuid}], decryption:'none' }, streamSettings }], outbounds:[{protocol:'freedom'}] }))
    const child = spawn(binary, ['run','-c',file], {stdio:'ignore'}); children.push(child)
    await ready(port)
    const local = await startXray(network, `vless://${uuid}@127.0.0.1:${port}?type=${network}&security=none&path=%2Ftest&serviceName=test`, root, binary)
    const {stdout} = await exec('curl', ['--silent','--show-error','--fail','--max-time','10','--noproxy','','--socks5-hostname',`127.0.0.1:${local}`,`http://127.0.0.1:${targetPort}/`])
    assert.equal(stdout, 'prism-vless-tunnel-ok')
    console.log(`PASS: real local SOCKS → VLESS ${network} → HTTP tunnel`)
  }
} finally {
  stopAllXray(); for(const child of children) child.kill('SIGTERM')
  await new Promise(r=>server.close(r)); await rm(root,{recursive:true,force:true})
}
