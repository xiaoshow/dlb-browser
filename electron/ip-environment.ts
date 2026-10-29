import { isIP } from 'node:net'

export interface ExitLocation {
  ip: string
  timezone: string
  locale: string
  latitude: number
  longitude: number
  country: string
  city: string
}

export function parseExitLocation(data: any): ExitLocation {
  if (!data || data.error || !isIP(data.ip)) throw new Error('IP 查询服务没有返回有效出口地址')
  if (typeof data.timezone !== 'string' || !data.timezone) throw new Error('出口时区缺失')
  new Intl.DateTimeFormat('en', { timeZone: data.timezone }).format()
  const locale = Intl.getCanonicalLocales(String(data.languages || '').split(',')[0].trim())[0]
  if (!locale) throw new Error('出口地区语言缺失')
  const { latitude, longitude } = data
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('出口坐标无效')
  return { ip: data.ip, timezone: data.timezone, locale, latitude, longitude, country: String(data.country_name || ''), city: String(data.city || '') }
}

// Use only the already configured Profile session: never global fetch or a direct fallback.
export async function lookupExitLocation(ses: Pick<Electron.Session, 'fetch'>): Promise<ExitLocation> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await ses.fetch('https://ipapi.co/json/', { signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error', headers: { accept: 'application/json' } })
    if (!response.ok) throw new Error(`IP 地理查询 HTTP ${response.status}`)
    return parseExitLocation(await response.json())
  } finally { clearTimeout(timeout) }
}

export async function resolveIPEnvironment(profile: any, ses: Pick<Electron.Session, 'fetch'>) {
  if (profile.timezone !== 'auto' && profile.locale !== 'auto' && profile.fingerprint?.geolocationMode !== 'ip') return profile
  let location: ExitLocation
  try { location = await lookupExitLocation(ses) }
  catch { throw new Error('无法通过当前代理解析出口地区，已停止启动；请检测节点或改为手动地区设置') }
  return {
    ...profile,
    exitLocation: location,
    timezone: profile.timezone === 'auto' ? location.timezone : profile.timezone,
    locale: profile.locale === 'auto' ? location.locale : profile.locale,
    fingerprint: { ...profile.fingerprint, ...(profile.fingerprint?.geolocationMode === 'ip' ? { geolocation: { latitude: location.latitude, longitude: location.longitude, accuracy: 50000 } } : {}) },
  }
}
