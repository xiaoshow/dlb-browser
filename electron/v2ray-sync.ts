import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { parseVlessUrl } from './vless.js'
const exec = promisify(execFile)
const extra = (value: any) => { if (!value) return {}; const parsed = JSON.parse(value); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('unsupported'); return parsed }

export function convertV2rayNode(row: any) {
  if (row.ConfigType !== 5 || !row.IndexId) throw new Error('unsupported')
  const proto = extra(row.ProtoExtra), transport = extra(row.TransportExtra)
  for (const key of ['Mldsa65Verify', 'Cert', 'CertSha', 'EchConfigList', 'Finalmask', 'VerifyPeerCertByName', 'Extra']) if (row[key]) throw new Error('unsupported advanced parameters')
  const header = transport.RawHeaderType || transport.KcpHeaderType || row.HeaderType
  if (header && String(header).toLowerCase() !== 'none') throw new Error('unsupported transport header')
  const uuid = row.Password || row.Id
  const host = String(row.Address || '').replace(/^\[|\]$/g, '')
  const url = new URL(`vless://${encodeURIComponent(uuid)}@${host.includes(':') ? `[${host}]` : host}:${row.Port}`)
  const set = (key: string, value: any) => { if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value)) }
  set('type', row.Network || 'tcp'); set('security', row.StreamSecurity || 'none')
  set('encryption', proto.VlessEncryption || row.Security || 'none')
  if (url.searchParams.get('encryption')?.toLowerCase() === 'none') url.searchParams.set('encryption','none')
  set('flow', proto.Flow || row.Flow); set('sni',row.Sni); set('fp',row.Fingerprint)
  set('pbk',row.PublicKey); set('sid',row.ShortId); set('spx',row.SpiderX)
  set('host',transport.Host || row.RequestHost); set('path',transport.Path || row.Path)
  if (row.Network === 'grpc') { set('serviceName',transport.Path || row.Path); if (transport.GrpcMode && transport.GrpcMode !== 'gun') throw new Error('unsupported grpc mode') }
  if (row.Network === 'xhttp') set('mode',transport.XhttpMode)
  set('alpn',row.Alpn)
  if (String(row.AllowInsecure).toLowerCase() === 'true' || String(row.AllowInsecure) === '1') set('allowInsecure','1')
  url.hash = row.Remarks || 'VLESS'
  const node = parseVlessUrl(url.href)
  return { ...node, id: `v2rayn-${row.IndexId}`, source: 'v2rayn' as const, sourceId: String(row.IndexId), favorite: true }
}

export async function readV2rayNodes(appData: string) {
  const database = join(appData, 'v2rayN/guiConfigs/guiNDB.db')
  let rows: any[]
  try {
    const result = await exec('/usr/bin/sqlite3', ['-readonly','-json',database,'SELECT * FROM ProfileItem;'], { maxBuffer: 8 * 1024 * 1024, timeout: 5000 })
    rows = JSON.parse(result.stdout || '[]')
  } catch { throw new Error('无法只读访问 v2rayN 节点库，请确认已安装并保存节点') }
  const nodes = []; let skipped = 0
  for (const row of rows) { try { nodes.push(convertV2rayNode(row)) } catch { skipped++ } }
  return { nodes, skipped, total: rows.length }
}

export function mergeV2rayFavorites(existing: any[], available: any[], selected: string[]) {
  if (!Array.isArray(selected) || selected.length > 10000 || selected.some(id => typeof id !== 'string')) throw new Error('收藏选择无效')
  const wanted = new Set(selected), present = new Set(available.map(n => n.sourceId))
  if ([...wanted].some(id => !present.has(id))) throw new Error('节点列表已变化，请重新扫描后选择')
  const next = existing.map(node => ({ ...node }))
  let added = 0, updated = 0
  for (const node of next) if (node.source === 'v2rayn' && present.has(node.sourceId)) node.favorite = wanted.has(node.sourceId)
  for (const node of available.filter(n => wanted.has(n.sourceId))) {
    const index = next.findIndex(n => n.source === 'v2rayn' && n.sourceId === node.sourceId)
    if (index >= 0) { next[index] = { ...node, id: next[index].id, favorite: true }; updated++ }
    else { next.push(node); added++ }
  }
  return { proxies: next, added, updated }
}
