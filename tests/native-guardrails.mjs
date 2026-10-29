import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { NativeBrowsers } from '../dist-electron/native-browser.js'
const root = await mkdtemp(join(tmpdir(), 'prism-guards-'))
try {
  const resources = join(root, 'resources')
  await mkdir(join(resources, 'native'), { recursive: true })
  const config = JSON.parse(await readFile('resources/native/engine.json', 'utf8'))
  const manifest = join(resources, 'native/engine.json')
  const manager = new NativeBrowsers(join(root, 'data'), resources, () => {}, () => {})
  const profile = { id: 'guard', fingerprint: { seed: 'guard' } }
  await writeFile(manifest, JSON.stringify({ ...config, sha256: '0'.repeat(64) }))
  await assert.rejects(manager.open(profile, 1, 'direct', {kind:'direct'}, undefined, true), /完整性不匹配/)
  await writeFile(manifest, JSON.stringify(config))
  await assert.rejects(manager.open({ ...profile, fingerprint: {deviceMemory:2} }, 1, 'direct', {kind:'direct'}, undefined, true), /deviceMemory/)
  await assert.rejects(manager.open({ ...profile, fingerprint: {webRTC:'disabled'} }, 1, 'direct', {kind:'direct'}, undefined, true), /webRTC/)
  assert.equal(manager.size, 0)
  console.log('PASS tampered kernel and unsupported settings fail before browser spawn')
} finally { await rm(root, { recursive: true, force: true }) }
