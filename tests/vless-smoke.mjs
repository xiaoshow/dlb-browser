import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseVlessUrl } from '../dist-electron/vless.js'
import { buildConfig } from '../dist-electron/xray.js'
const root = await mkdtemp(join(tmpdir(), 'orbit-vless-'))
try {
  for (const type of ['tcp', 'ws', 'grpc', 'xhttp']) {
    const link = `vless://8f1e7777-bbbb-4ccc-8ddd-123456789abc@example.com:443?type=${type}&security=tls&sni=example.com&path=%2Ftest&serviceName=test#Test`
    const node = parseVlessUrl(link)
    assert.equal(node.transport, type)
    const config = buildConfig(link, 18000)
    assert.equal(config.outbounds[0].settings.vnext[0].address, 'example.com')
    assert.equal(config.outbounds[0].streamSettings.network, type)
    const path = join(root, `${type}.json`)
    await writeFile(path, JSON.stringify(config), { mode: 0o600 })
    execFileSync(fileURLToPath(new URL('../resources/bin/xray', import.meta.url)), ['run', '-test', '-c', path], { stdio: 'pipe' })
  }
  assert.throws(() => parseVlessUrl('https://example.com'), /vless/)
  assert.throws(() => parseVlessUrl('vless://invalid@example.com:443'), /UUID/)
  console.log('PASS: VLESS parse and Xray config validation for TCP, WS, gRPC, XHTTP; invalid links rejected')
} finally { await rm(root, { recursive: true, force: true }) }
