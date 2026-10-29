import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const typed = readFileSync(join(root, 'electron/preload.ts'), 'utf8')
const packaged = readFileSync(join(root, 'electron/preload.cjs'), 'utf8')

function bridgeKeys(source) {
  const start = source.indexOf("contextBridge.exposeInMainWorld('profileBrowser', {")
  if (start < 0) throw new Error('profileBrowser bridge not found')
  return new Set([...source.slice(start).matchAll(/^\s{2}([A-Za-z_$][\w$]*):/gm)].map((match) => match[1]))
}

const typedKeys = bridgeKeys(typed)
const packagedKeys = bridgeKeys(packaged)
const missing = [...typedKeys].filter((key) => !packagedKeys.has(key))
const extra = [...packagedKeys].filter((key) => !typedKeys.has(key))

if (missing.length || extra.length) {
  if (missing.length) console.error(`electron/preload.cjs is missing: ${missing.join(', ')}`)
  if (extra.length) console.error(`electron/preload.cjs has extra keys: ${extra.join(', ')}`)
  process.exit(1)
}

console.log(`preload bridge verified (${typedKeys.size} methods)`)
