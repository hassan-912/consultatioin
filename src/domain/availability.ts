import type { Booking, BookingStatus, Format } from './types'
import { addDays, dateInZone, weekday, zonedDateTimeToIso } from './time'

type Window = { start: number; end: number } // minutes from local midnight

export interface ScheduleRules {
  consultantId: string
  weekly: Record<0 | 1 | 2 | 3 | 4 | 5 | 6, Window[]>
  breaks: Window[]
  holidays: string[]
  leave: { from: string; to: string }[]
  unavailable: string[]
  maxPerDay?: number
  formats: Format[]
}

export interface Busy { startIso: string; endIso: string }
export interface Slot { startIso: string; endIso: string }

export interface SlotQuery {
  rules: ScheduleRules
  date: string
  durationMin: number
  format: Format
  tz: string
  busy: Busy[]
  bufferMin: number
  stepMin: number
  nowMs: number
}

const MIN = 60_000

export function isDayOff(rules: ScheduleRules, date: string): boolean {
  return (
    rules.holidays.includes(date) ||
    rules.unavailable.includes(date) ||
    rules.leave.some(l => date >= l.from && date <= l.to) ||
    rules.weekly[weekday(date)].length === 0
  )
}

export function getSlots(q: SlotQuery): Slot[] {
  const { rules, date, durationMin, tz, bufferMin, stepMin, nowMs } = q
  if (!rules.formats.includes(q.format) || isDayOff(rules, date)) return []

  const busyToday = q.busy.filter(b => dateInZone(b.startIso, tz) === date)
  if (rules.maxPerDay !== undefined && busyToday.length >= rules.maxPerDay) return []

  const blocked = [
    ...q.busy.map(b => [Date.parse(b.startIso) - bufferMin * MIN, Date.parse(b.endIso) + bufferMin * MIN]),
    ...rules.breaks.map(br => [Date.parse(zonedDateTimeToIso(date, br.start, tz)), Date.parse(zonedDateTimeToIso(date, br.end, tz))]),
  ]

  const slots: Slot[] = []
  for (const w of rules.weekly[weekday(date)]) {
    for (let m = w.start; m + durationMin <= w.end; m += stepMin) {
      const start = Date.parse(zonedDateTimeToIso(date, m, tz))
      const end = start + durationMin * MIN
      if (start < nowMs) continue
      if (blocked.some(([bs, be]) => start < be && end > bs)) continue
      slots.push({ startIso: new Date(start).toISOString(), endIso: new Date(end).toISOString() })
    }
  }
  return slots
}

export function nextAvailable(q: Omit<SlotQuery, 'date'> & { fromDate: string; horizonDays: number }): Slot | null {
  for (let i = 0; i < q.horizonDays; i++) {
    const slots = getSlots({ ...q, date: addDays(q.fromDate, i) })
    if (slots.length) return slots[0]
  }
  return null
}

const BLOCKING: BookingStatus[] = ['on-hold', 'confirmed', 'checked-in', 'completed', 'wrong-amount', 'duplicate']

/** Bookings that occupy the consultant's single timeline, across both formats. */
export function busyFromBookings(bookings: Booking[], consultantId: string, nowMs: number): Busy[] {
  return bookings
    .filter(b => b.consultantId === consultantId)
    .filter(b => BLOCKING.includes(b.status) || (b.status === 'reserved' && b.holdExpiresAt > nowMs))
    .map(b => ({ startIso: b.startIso, endIso: b.endIso }))
}
