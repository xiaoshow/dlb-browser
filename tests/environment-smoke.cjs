const { app, BrowserWindow, session } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')
const root = mkdtempSync(join(tmpdir(), 'orbit-environment-'))
app.setPath('userData', root)
const timer = setTimeout(() => { console.error('Environment smoke test timed out'); app.exit(1) }, 45000)
app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.setActivationPolicy('accessory')
  const { applyProfileEnvironment } = await import(pathToFileURL(join(__dirname, '../dist-electron/environment.js')))
  const windows = []
  const server = require('node:http').createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<script>window.firstMemory=navigator.deviceMemory</script>') })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const localURL = `http://127.0.0.1:${server.address().port}`
  try {
    const first = session.fromPartition('persist:smoke-a')
    const second = session.fromPartition('persist:smoke-b')
    await first.cookies.set({ url: 'https://example.com', name: 'account', value: 'a' })
    assert.equal((await second.cookies.get({ name: 'account' })).length, 0)
    await first.setProxy({ proxyRules: 'socks5://127.0.0.1:18001' })
    await second.setProxy({ proxyRules: 'socks5://127.0.0.1:18002' })
    assert.match(await first.resolveProxy('https://example.com'), /18001/)
    assert.match(await second.resolveProxy('https://example.com'), /18002/)
    for (const [ses, timezone, locale, cores, width] of [[first, 'Asia/Tokyo', 'ja-JP', 4, 1280], [second, 'America/Los_Angeles', 'en-US', 8, 1440]]) {
      const win = new BrowserWindow({ show: false, webPreferences: { session: ses, sandbox: true } })
      windows.push(win)
      await win.loadURL('about:blank')
      await applyProfileEnvironment(win.webContents, { timezone, locale, hardwareConcurrency: cores, resolution: { width, height: 900 }, webRTCPolicy: 'proxy-only' })
      await win.loadURL('data:text/html,<title>Environment test</title>')
      const observed = await win.webContents.executeJavaScript('({timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,locale:navigator.language,cores:navigator.hardwareConcurrency,width:screen.width})')
      assert.equal(observed.timezone, timezone)
      assert.equal(observed.locale, locale)
      assert.equal(observed.cores, cores)
      assert.equal(observed.width, width)
      assert.equal(win.webContents.getWebRTCIPHandlingPolicy(), 'disable_non_proxied_udp')
    }
    // Page scripts must see stable results on first execution, after reload and in frames.
    async function fingerprintRun(seed) {
      const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
      win.webContents.session.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'geolocation'))
      win.webContents.session.setPermissionCheckHandler((_contents, permission) => permission === 'geolocation')
      windows.push(win)
      await win.loadURL('about:blank')
      await applyProfileEnvironment(win.webContents, { id: 'test', fingerprint: {
        seed, canvas: 'noise', audio: 'noise', webGL: 'noise', mediaDevices: 'blocked', geolocation: { latitude: 35.6762, longitude: 139.6503, accuracy: 100 }, deviceMemory: 4, maxTouchPoints: 5,
        webRTC: 'disabled', plugins: 'empty', webGPU: 'disabled', fonts: 'restricted',
        speech: 'hidden', battery: 'hidden', connection: 'hidden', doNotTrack: 'on',
        colorScheme: 'dark', reducedMotion: 'reduce', webGLVendor: 'Test vendor', webGLRenderer: 'Test renderer',
      } })
      await win.loadURL(localURL)
      const read = () => win.webContents.executeJavaScript(`(async () => {
        const c = document.createElement('canvas'); c.width = 12; c.height = 12;
        const ctx = c.getContext('2d'); ctx.fillStyle = 'rgb(100,120,140)'; ctx.fillRect(0,0,12,12);
        const pixels = Array.from(ctx.getImageData(0,0,12,12).data);
        const url = c.toDataURL(); const repeat = c.toDataURL();
        const blob = await new Promise(resolve => c.toBlob(resolve));
        const blobUrl = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob) });
        const buffer = new AudioBuffer({ length: 20, numberOfChannels: 1, sampleRate: 44100 });
        const audio = Array.from(buffer.getChannelData(0)); const copied = new Float32Array(20); buffer.copyFromChannel(copied,0);
        const frame = document.createElement('iframe'); document.body.append(frame); await new Promise(resolve => setTimeout(resolve, 50));
        const gl = document.createElement('canvas').getContext('webgl');
        let vendor = null; if (gl && gl.getExtension('WEBGL_debug_renderer_info')) vendor = gl.getParameter(37445);
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mediaBlocked = await navigator.mediaDevices.getUserMedia({ audio: true }).then(() => false, e => e.name === 'NotAllowedError');
        const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(p => resolve([p.coords.latitude, p.coords.longitude]), reject));
        const writeBuffer = new AudioBuffer({ length: 20, numberOfChannels: 1, sampleRate: 44100 });
        writeBuffer.getChannelData(0)[0] = 0.5; const writeCopy = new Float32Array(20); writeBuffer.copyFromChannel(writeCopy, 0);
        return { devices: devices.length, mediaBlocked, position, writeValue: writeCopy[0], first: window.firstMemory, memory: navigator.deviceMemory, touch: navigator.maxTouchPoints,
          rtc: typeof RTCPeerConnection, gpu: typeof navigator.gpu, fonts: typeof queryLocalFonts,
          dnt: navigator.doNotTrack, dark: matchMedia('(prefers-color-scheme: dark)').matches,
          motion: matchMedia('(prefers-reduced-motion: reduce)').matches,
          pixels, url, repeat, blobUrl, audio, copied: Array.from(copied), frameMemory: frame.contentWindow.navigator.deviceMemory, vendor };
      })()`)
      const result = await read()
      assert.equal(result.devices, 0); assert.equal(result.mediaBlocked, true); assert.deepEqual(result.position, [35.6762, 139.6503]); assert.equal(result.writeValue, 0.5)
      assert.equal(result.first, 4); assert.equal(result.memory, 4); assert.equal(result.frameMemory, 4)
      assert.equal(result.touch, 5); assert.equal(result.rtc, 'undefined'); assert.equal(result.gpu, 'undefined')
      assert.equal(result.fonts, 'undefined'); assert.equal(result.dnt, '1'); assert.equal(result.dark, true); assert.equal(result.motion, true)
      assert.equal(result.url, result.repeat); assert.equal(result.url, result.blobUrl)
      assert.deepEqual(result.audio, result.copied)
      if (result.vendor !== null) assert.equal(result.vendor, 'Test vendor')
      await win.webContents.reload(); await new Promise(resolve => win.webContents.once('did-finish-load', resolve))
      const after = await read(); assert.equal(after.url, result.url); assert.deepEqual(after.audio, result.audio)
      return result
    }
    const a = await fingerprintRun('stable-a'); const a2 = await fingerprintRun('stable-a'); const b = await fingerprintRun('stable-b')
    assert.equal(a.url, a2.url); assert.deepEqual(a.audio, a2.audio)
    assert.notEqual(a.url, b.url); assert.notDeepEqual(a.audio, b.audio)
    await assert.rejects(() => applyProfileEnvironment(windows[0].webContents, { fingerprint: { geolocation: { latitude: 200, longitude: 0, accuracy: 10 } } }), /地理位置/)
    console.log('PASS: first-script and iframe injection, stable Canvas PNG/blob and AudioBuffer, distinct seeds, hardware/API controls, CSS preferences and validation')
    await assert.rejects(() => applyProfileEnvironment(windows[0].webContents, { resolution: { width: -1, height: 900 } }), /分辨率/)
    console.log('PASS: session cookies, distinct proxies, timezone, language, resolution, concurrency, WebRTC and validation')
  } finally {
    for (const win of windows) win.destroy()
    await new Promise(resolve => server.close(resolve))
    clearTimeout(timer)
  }
}).then(() => { app.exit(0) }).catch((error) => { console.error(error); app.exit(1) })
app.on('quit', () => rmSync(root, { recursive: true, force: true }))
