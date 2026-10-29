import { readFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
// Verify the pinned installation. Never silently switch a Profile to stock Chrome.
const config = JSON.parse(await readFile(new URL('../resources/native/engine.json', import.meta.url), 'utf8'))
if (config.engine !== 'Fingerprint Chromium' || !/^[a-f0-9]{64}$/.test(config.sha256 || '')) throw new Error('缺少已验证的指纹内核清单')
const source = process.env.PRISM_CHROME_BUNDLE || (config.installRelativePath ? join(homedir(), 'Library/Application Support', config.installRelativePath) : config.bundlePath)
const plist = join(source, 'Contents/Info.plist')
const read = key => execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print ${key}`, plist], {encoding:'utf8'}).trim()
if (read('CFBundleExecutable') !== 'Chromium' || read('CFBundleShortVersionString') !== config.version) throw new Error('内核版本不匹配')
const hash = createHash('sha256')
for await (const chunk of createReadStream(join(source, 'Contents/MacOS/Chromium'))) hash.update(chunk)
if (hash.digest('hex') !== config.sha256) throw new Error('内核完整性不匹配')
console.log(`Verified pinned Fingerprint Chromium ${config.version}; configuration unchanged`)
