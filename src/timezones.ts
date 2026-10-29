const cities: Record<string,string> = {
  'America/Los_Angeles':'洛杉矶','America/New_York':'纽约','Asia/Tokyo':'东京','Asia/Shanghai':'上海','Asia/Hong_Kong':'香港','Asia/Taipei':'台北','Europe/London':'伦敦','Europe/Paris':'巴黎','Europe/Berlin':'柏林','Asia/Singapore':'新加坡','Asia/Seoul':'首尔','Australia/Sydney':'悉尼','UTC':'协调世界时',
}
export function timezoneLabel(zone?: string) {
  if (!zone || zone === 'auto') return '跟随代理 IP / Follow IP'
  if (zone === 'local') return '跟随本机 / System timezone'
  if (cities[zone]) return `${cities[zone]} / ${zone}`
  try { return `${new Intl.DateTimeFormat('zh-CN',{timeZone:zone,timeZoneName:'long'}).formatToParts().find(p=>p.type==='timeZoneName')?.value || '自定义时区'} / ${zone}` } catch {return zone}
}
export const timezones = ['auto','local',...Object.keys(cities)].map(value=>({value,label:timezoneLabel(value)}))
