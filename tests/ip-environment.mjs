import assert from 'node:assert/strict'
import { parseExitLocation, lookupExitLocation, resolveIPEnvironment } from '../dist-electron/ip-environment.js'
const data = { ip: '203.0.113.1', timezone: 'Asia/Tokyo', languages: 'ja-JP,en', latitude: 35.6, longitude: 139.6, country_name: 'Japan', city: 'Tokyo' }
let calls = 0
const ses = { async fetch(url, options) { calls++; assert.equal(url, 'https://ipapi.co/json/'); assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store'); return Response.json(data) } }
const profile = { id: 'test', timezone: 'auto', locale: 'auto', fingerprint: { seed: 'stable', geolocationMode: 'ip' } }
const result = await resolveIPEnvironment(profile, ses)
assert.equal(result.timezone, 'Asia/Tokyo'); assert.equal(result.locale, 'ja-JP'); assert.equal(result.fingerprint.seed, 'stable'); assert.equal(result.fingerprint.geolocation.latitude, 35.6)
assert.equal(profile.timezone, 'auto'); assert.equal(profile.fingerprint.geolocation, undefined)
const manual = { timezone: 'Europe/London', locale: 'en-GB' }
assert.equal(await resolveIPEnvironment(manual, ses), manual); assert.equal(calls, 1)
for (const bad of [{ ip: 'html' }, { timezone: 'Bad/Zone' }, { languages: '' }, { latitude: null }, { longitude: 181 }]) assert.throws(() => parseExitLocation({ ...data, ...bad }))
await assert.rejects(resolveIPEnvironment(profile, { fetch: async () => { throw new Error('proxy down') } }), /停止启动/)
await assert.rejects(lookupExitLocation({ fetch: async () => new Response('', { status: 429 }) }), /429/)
console.log('PASS: proxy-session-only IP lookup, validation, immutable seed, manual overrides, fail closed')
