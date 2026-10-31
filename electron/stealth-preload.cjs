// Stealth preload script for WebContentsView in Group Workspace.
// Strips Electron artifacts and mimics authentic Google Chrome environment to pass Cloudflare Turnstile & Botguard.

try {
  // 1. Remove navigator.webdriver
  Object.defineProperty(Navigator.prototype, 'webdriver', {
    get: () => undefined,
    configurable: true,
    enumerable: true,
  })
} catch {}

try {
  // 2. Clean User-Agent on navigator
  const rawUa = navigator.userAgent || ''
  const cleanUa = rawUa.replace(/\s*Electron\/[0-9.]+/gi, '')
  if (cleanUa !== rawUa) {
    Object.defineProperty(Navigator.prototype, 'userAgent', {
      get: () => cleanUa,
      configurable: true,
      enumerable: true,
    })
    Object.defineProperty(Navigator.prototype, 'appVersion', {
      get: () => cleanUa.replace(/^Mozilla\//i, ''),
      configurable: true,
      enumerable: true,
    })
  }
} catch {}

try {
  // 3. Clean navigator.userAgentData & getHighEntropyValues
  if (navigator.userAgentData) {
    const brands = [
      { brand: 'Google Chrome', version: '130' },
      { brand: 'Chromium', version: '130' },
      { brand: 'Not?A_Brand', version: '24' },
    ]
    Object.defineProperty(navigator.userAgentData, 'brands', {
      get: () => brands,
      configurable: true,
      enumerable: true,
    })
    Object.defineProperty(navigator.userAgentData, 'platform', {
      get: () => 'macOS',
      configurable: true,
      enumerable: true,
    })
    Object.defineProperty(navigator.userAgentData, 'mobile', {
      get: () => false,
      configurable: true,
      enumerable: true,
    })
    if (navigator.userAgentData.getHighEntropyValues) {
      navigator.userAgentData.getHighEntropyValues = async () => ({
        architecture: 'arm',
        bitness: '64',
        brands: brands,
        fullVersionList: [
          { brand: 'Google Chrome', version: '130.0.6723.116' },
          { brand: 'Chromium', version: '130.0.6723.116' },
          { brand: 'Not?A_Brand', version: '24.0.0.0' },
        ],
        mobile: false,
        model: '',
        platform: 'macOS',
        platformVersion: '15.0.0',
      })
    }
  }
} catch {}

try {
  // 4. Mock native window.chrome API
  if (!window.chrome) {
    window.chrome = {}
  }
  if (!window.chrome.app) {
    window.chrome.app = {
      isInstalled: false,
      InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
      RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
    }
  }
  if (!window.chrome.csi) {
    window.chrome.csi = function () {
      return { startE: Date.now(), onloadT: Date.now(), pageT: 120, tran: 15 }
    }
  }
  if (!window.chrome.loadTimes) {
    window.chrome.loadTimes = function () {
      return {
        requestTime: Date.now() / 1000,
        startLoadTime: Date.now() / 1000,
        commitLoadTime: Date.now() / 1000,
        finishDocumentLoadTime: Date.now() / 1000,
        finishLoadTime: Date.now() / 1000,
        firstPaintTime: Date.now() / 1000,
        firstPaintAfterLoadTime: 0,
        navigationType: 'Other',
        wasFetchedViaSpdy: true,
        wasNpnNegotiated: true,
        npnNegotiatedProtocol: 'h2',
        wasAlternateProtocolAvailable: false,
        connectionInfo: 'h2',
      }
    }
  }
} catch {}

try {
  // 5. Mock plugins & mimeTypes
  if (navigator.plugins && navigator.plugins.length === 0) {
    const mockPlugins = [
      { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
    ]
    Object.defineProperty(navigator, 'plugins', {
      get: () => mockPlugins,
      configurable: true,
      enumerable: true,
    })
  }
} catch {}

try {
  // 6. Mock notification permissions
  if (navigator.permissions && navigator.permissions.query) {
    const origQuery = navigator.permissions.query.bind(navigator.permissions)
    navigator.permissions.query = (param) =>
      param && param.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission || 'default' })
        : origQuery(param)
  }
} catch {}
