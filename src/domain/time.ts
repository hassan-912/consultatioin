import type { Lang } from './types'

const locale = (lang: Lang) => (lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB')

/** Offset of `tz` from UTC in minutes at instant `ms`. */
export function tzOffsetMinutes(tz: string, ms: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms))
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000)
}

/** Wall-clock `minutes` after midnight on `date` in `tz` → UTC ISO string. */
export function zonedDateTimeToIso(date: string, minutes: number, tz: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d, 0, minutes)
  let ms = guess - tzOffsetMinutes(tz, guess) * 60000
  ms = guess - tzOffsetMinutes(tz, ms) * 60000 // second pass settles DST edges
  return new Date(ms).toISOString()
}

export function dateInZone(iso: string | number, tz: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: tz })
}

export function minutesInZone(iso: string | number, tz: string): number {
  const ms = new Date(iso).getTime()
  const local = ms + tzOffsetMinutes(tz, ms) * 60000
  const d = new Date(local)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

export function weekday(date: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6
}

type Style = 'full' | 'date' | 'time' | 'short' | 'weekday'

const styles: Record<Style, Intl.DateTimeFormatOptions> = {
  full: { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' },
  date: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  time: { hour: '2-digit', minute: '2-digit' },
  short: { day: 'numeric', month: 'short' },
  weekday: { weekday: 'short' },
}

export function formatInZone(iso: string | number, tz: string, lang: Lang, style: Style = 'full'): string {
  return new Intl.DateTimeFormat(locale(lang), { timeZone: tz, hour12: lang === 'en' ? false : true, ...styles[style] })
    .format(new Date(iso))
}

/** Formats a plain YYYY-MM-DD date (no zone shift). */
export function formatDate(date: string, lang: Lang, style: 'date' | 'short' | 'weekday' = 'date'): string {
  return formatInZone(`${date}T12:00:00Z`, 'UTC', lang, style)
}

const zoneNames: Record<string, Record<Lang, string>> = {
  'Africa/Cairo': { en: 'Cairo time', ar: 'بتوقيت القاهرة' },
  'Asia/Dubai': { en: 'Dubai time', ar: 'بتوقيت دبي' },
}

export function gmtLabel(tz: string, ms = Date.now()): string {
  const off = tzOffsetMinutes(tz, ms)
  const h = Math.trunc(off / 60)
  const m = Math.abs(off % 60)
  return `GMT${off >= 0 ? '+' : '-'}${Math.abs(h)}${m ? `:${String(m).padStart(2, '0')}` : ''}`
}

export function zoneLabel(tz: string, lang: Lang, ms = Date.now()): string {
  const name = zoneNames[tz]?.[lang] ?? tz
  return `${name} (${gmtLabel(tz, ms)})`
}

export function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** The same instant in the viewer's zone, and whether it lands on a different calendar day. */
export function localEquivalent(iso: string, sourceTz: string, viewerTz: string, lang: Lang) {
  return {
    text: formatInZone(iso, viewerTz, lang, 'full'),
    zone: viewerTz,
    same: tzOffsetMinutes(sourceTz, Date.parse(iso)) === tzOffsetMinutes(viewerTz, Date.parse(iso)),
    differentDay: dateInZone(iso, sourceTz) !== dateInZone(iso, viewerTz),
  }
}
