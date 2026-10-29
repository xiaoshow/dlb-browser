import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export type Release = { version: string; notes: string; publishedAt: string; url: string; sha256: string }
export function validateManifest(value: any): { app?: Release; kernel?: Release } {
  if (!value || value.schemaVersion !== 1) throw new Error('不支持的更新清单格式')
  const result: { app?: Release; kernel?: Release } = {}
  for (const key of ['app', 'kernel'] as const) {
    const item = value[key]
    if (!item) continue
    if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(item.version) || !/^[a-f0-9]{64}$/i.test(item.sha256) || typeof item.notes !== 'string' || item.notes.length > 20000 || !Number.isFinite(Date.parse(item.publishedAt))) throw new Error('更新条目信息无效')
    const url = new URL(item.url)
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('更新下载地址必须为 HTTPS')
    result[key] = { version: item.version, notes: item.notes, publishedAt: item.publishedAt, url: url.href, sha256: item.sha256.toLowerCase() }
  }
  return result
}

export async function updateStatus(resources: string, appVersion: string, check = false) {
  const engine = await readFile(join(resources, 'native/engine.json'), 'utf8').then(JSON.parse).catch(() => null)
  // A signed release service will supply this setting when the product is distributed.
  const manifestURL = process.env.PRISM_UPDATE_MANIFEST_URL
  const base = { appVersion, kernelVersion: engine?.version || '未安装', kernelName: engine?.engine || 'Chromium', configured: !!manifestURL, installEnabled: false, status: 'not-configured', message: '更新通道尚未配置。已预留应用与内核独立更新；当前不会下载或替换文件。' }
  if (!manifestURL || !check) return { ...base, status: manifestURL ? 'idle' : base.status, message: manifestURL ? '更新通道已配置，可查询发布信息。安装功能尚未启用。' : base.message }
  const url = new URL(manifestURL)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('更新清单地址必须为 HTTPS')
  const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error' })
  if (!response.ok) throw new Error(`更新服务 HTTP ${response.status}`)
  const body = await response.text()
  if (body.length > 100000) throw new Error('更新清单过大')
  const releases = validateManifest(JSON.parse(body))
  return { ...base, status: 'checked', checkedAt: new Date().toISOString(), releases, message: '已获取发布信息。签名验证与安装器尚未接入，因此暂不提供安装。' }
}
