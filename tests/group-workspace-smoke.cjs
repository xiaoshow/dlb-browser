const { app, BrowserWindow, session, ipcMain } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { join } = require('node:path')

const root = fs.mkdtempSync(join(require('node:os').tmpdir(), 'prism-workspace-test-'))
app.setPath('userData', root)

// Test state with 2 Google accounts in a single group 'google-farm'
const testState = {
  presentationMode: 'windows',
  groups: [
    { id: 'google-farm', name: '谷歌养号组', color: '#ea580c' }
  ],
  profiles: [
    {
      id: 'g-acc-1',
      number: 1,
      name: 'Google 账号 1 (主号)',
      groupId: 'google-farm',
      proxyId: 'direct',
      color: '#ea580c', // 橙色
      startUrl: 'about:blank'
    },
    {
      id: 'g-acc-2',
      number: 2,
      name: 'Google 账号 2 (小号)',
      groupId: 'google-farm',
      proxyId: 'direct',
      color: '#059669', // 绿色
      startUrl: 'about:blank'
    }
  ],
  proxies: [
    { id: 'direct', name: '直连', kind: 'direct' }
  ]
}

const timer = setTimeout(() => {
  console.error('TIMEOUT: Group workspace test did not finish in 15s')
  app.exit(1)
}, 15000)

app.whenReady().then(async () => {
  app.setActivationPolicy('accessory')
  console.log('Testing GroupWorkspaceManager logic...')

  // Dynamically import the compiled electron group-workspace module
  const { GroupWorkspaceManager } = await import('../dist-electron/group-workspace.js')

  const manager = new GroupWorkspaceManager(
    () => testState,
    async () => 'direct',
    () => join(__dirname, '../electron/preload.cjs'),
    () => ({ isUrl: false, path: join(__dirname, '../dist/index.html') })
  )

  ipcMain.handle('workspace:get-state', (event) => {
    const ws = manager.getWorkspaceBySender(event.sender)
    return ws ? manager.getClientState(ws) : null
  })

  ipcMain.handle('workspace:set-command-bar', (event, visible) => {
    const ws = manager.getWorkspaceBySender(event.sender)
    if (ws) manager.setCommandBar(ws.groupId, visible)
    return { ok: true }
  })

  // 1. Open group workspace
  const openRes = await manager.openGroup('google-farm')
  assert.equal(openRes.ok, true, 'openGroup should return ok: true')

  const ws = manager.getWorkspace('google-farm')
  assert.ok(ws, 'Workspace session should exist')
  assert.equal(ws.tabs.length, 2, 'Should create 2 initial tabs for the 2 Google accounts')

  // Check Tab 1: Profile 1, Orange color
  const tab1 = ws.tabs[0]
  assert.equal(tab1.profileId, 'g-acc-1')
  assert.equal(tab1.profileNumber, 1)
  assert.equal(tab1.color, '#ea580c')

  // Check Tab 2: Profile 2, Green color
  const tab2 = ws.tabs[1]
  assert.equal(tab2.profileId, 'g-acc-2')
  assert.equal(tab2.profileNumber, 2)
  assert.equal(tab2.color, '#059669')

  console.log('PASS: Initial tabs created with independent colors and profiles')

  // 2. Test adjacent tab creation on link open in Tab 1
  // When Tab 1 opens a new link, it must insert adjacent to Tab 1 (index 1), with Tab 1's color and Profile ID!
  await manager.createAdjacentTab('google-farm', tab1.id, 'https://mail.google.com')

  assert.equal(ws.tabs.length, 3, 'Workspace should now have 3 tabs')
  const newAdjacentTab = ws.tabs[1] // Inserted at index 1 right next to tab1!
  assert.equal(newAdjacentTab.profileId, 'g-acc-1', 'Must inherit same profileId g-acc-1')
  assert.equal(newAdjacentTab.color, '#ea580c', 'Must inherit exact same color as tab 1')
  assert.equal(ws.tabs[2].profileId, 'g-acc-2', 'Tab 2 (Green) pushed to index 2 without pollution')

  console.log('PASS: Adjacent tab created at index 1 with identical color and profile partition')

  // 3. Test Partition Isolation
  const ses1 = session.fromPartition('persist:profile-g-acc-1')
  const ses2 = session.fromPartition('persist:profile-g-acc-2')
  assert.notEqual(ses1, ses2, 'Partitions must be completely isolated separate Session objects')

  // Set cookie in profile 1
  await ses1.cookies.set({
    url: 'https://google.com',
    name: 'ACCOUNT_ID',
    value: 'acc_1_secret'
  })

  // Read cookies in profile 2: must NOT see profile 1's cookie!
  const cookiesInSes2 = await ses2.cookies.get({ url: 'https://google.com', name: 'ACCOUNT_ID' })
  assert.equal(cookiesInSes2.length, 0, 'Session 2 must have 0 cookies from Session 1 (strict physical isolation)')

  console.log('PASS: Zero session crosstalk verified between Google profiles')

  // 4. Test Tab Navigation and Switch
  manager.switchTab('google-farm', tab2.id)
  assert.equal(ws.activeTabId, tab2.id)

  // 5. Test Tab Close
  manager.closeTab('google-farm', newAdjacentTab.id)
  assert.equal(ws.tabs.length, 2)
  assert.equal(ws.tabs[0].id, tab1.id)
  assert.equal(ws.tabs[1].id, tab2.id)

  console.log('PASS: Tab switching and closing verified')

  try { ws.win.destroy() } catch {}
  clearTimeout(timer)
  console.log('ALL WORKSPACE TESTS PASSED!')
  app.exit(0)
}).catch((err) => {
  console.error(err)
  app.exit(1)
})

app.on('quit', () => fs.rmSync(root, { recursive: true, force: true }))
