const assert = require('node:assert/strict')
const { readFileSync, mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { app, session } = require('electron')

const root = mkdtempSync(join(tmpdir(), 'dlb-bsk-proxy-'))
app.setPath('userData', root)
app.whenReady().then(async () => {
  try {
    const source = readFileSync('electron/native-browser.ts', 'utf8')
    const rules = source.match(/'--proxy-bypass-list=([^']+)'/)[1]
    const isolated = session.fromPartition('bsk-proxy-regression')
    // Resolve routes only: no requests, real profiles, proxy credentials or windows.
    await isolated.setProxy({ proxyRules: 'http://127.0.0.1:9', proxyBypassRules: rules })
    for (const url of ['http://127.0.0.1:52800', 'ws://127.0.0.1:52800', 'http://localhost:52800', 'http://[::1]:52800']) {
      assert.equal(await isolated.resolveProxy(url), 'DIRECT', url)
    }
    for (const url of ['https://www.temu.com', 'http://127.0.0.1:52801', 'http://192.168.1.1']) {
      assert.match(await isolated.resolveProxy(url), /^PROXY /, url)
    }
    console.log('PASS BrowserSkill local port bypass; website and other local traffic remain proxied')
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
    catch { /* Chromium can still be flushing its disposable test cache. */ }
    finally { app.exit(process.exitCode || 0) }
  }
})
