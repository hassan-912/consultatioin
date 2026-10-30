import { getSlots, nextAvailable, busyFromBookings, type ScheduleRules } from './availability'
import { zonedDateTimeToIso } from './time'
import type { Booking } from './types'

const TZ = 'Africa/Cairo'
const DATE = '2026-11-02' // Monday
const at = (min: number, date = DATE) => zonedDateTimeToIso(date, min, TZ)
const hm = (h: number, m = 0) => h * 60 + m

const rules: ScheduleRules = {
  consultantId: 'c1',
  weekly: { 0: [{ start: hm(10), end: hm(18) }], 1: [{ start: hm(10), end: hm(18) }], 2: [{ start: hm(10), end: hm(18) }], 3: [], 4: [], 5: [], 6: [] },
  breaks: [{ start: hm(13), end: hm(13, 30) }],
  holidays: ['2026-11-03'],
  leave: [{ from: '2026-11-08', to: '2026-11-08' }],
  unavailable: [],
  formats: ['online', 'in-person'],
}

const base = { rules, durationMin: 30, tz: TZ, bufferMin: 0, stepMin: 15, nowMs: Date.parse('2026-11-01T00:00:00Z') }

const starts = (s: { startIso: string }[]) => s.map(x => x.startIso)

test('in-person booking blocks overlapping online slots (single timeline)', () => {
  const busy = [{ startIso: at(hm(11)), endIso: at(hm(11, 45)) }]
  const slots = getSlots({ ...base, date: DATE, format: 'online', busy })
  expect(starts(slots)).not.toContain(at(hm(11, 30)))
  expect(starts(slots)).toContain(at(hm(11, 45)))
})

test('buffer pushes the next slot away', () => {
  const busy = [{ startIso: at(hm(11)), endIso: at(hm(11, 45)) }]
  const slots = getSlots({ ...base, bufferMin: 10, date: DATE, format: 'online', busy })
  expect(starts(slots)).not.toContain(at(hm(11, 45)))
  expect(starts(slots)).toContain(at(hm(12)))
})

test('no slot overlaps the break; slots end within working hours', () => {
  const slots = getSlots({ ...base, date: DATE, format: 'online', busy: [] })
  expect(starts(slots)).not.toContain(at(hm(12, 45)))
  expect(starts(slots)).not.toContain(at(hm(13)))
  expect(starts(slots)).toContain(at(hm(13, 30)))
  expect(starts(slots).at(-1)).toBe(at(hm(17, 30)))
})

test('holiday, leave and unsupported format give no slots', () => {
  expect(getSlots({ ...base, date: '2026-11-03', format: 'online', busy: [] })).toEqual([])
  expect(getSlots({ ...base, date: '2026-11-08', format: 'online', busy: [] })).toEqual([])
  const onlineOnly = { ...rules, formats: ['online' as const] }
  expect(getSlots({ ...base, rules: onlineOnly, date: DATE, format: 'in-person', busy: [] })).toEqual([])
})

test('slots in the past are excluded', () => {
  const nowMs = Date.parse(at(hm(15)))
  const slots = getSlots({ ...base, nowMs, date: DATE, format: 'online', busy: [] })
  expect(Date.parse(slots[0].startIso)).toBeGreaterThanOrEqual(nowMs)
})

test('daily limit', () => {
  const busy = [{ startIso: at(hm(10)), endIso: at(hm(10, 30)) }, { startIso: at(hm(16)), endIso: at(hm(16, 30)) }]
  expect(getSlots({ ...base, rules: { ...rules, maxPerDay: 2 }, date: DATE, format: 'online', busy })).toEqual([])
})

test('nextAvailable skips holiday to next working day', () => {
  const nowMs = Date.parse(at(hm(18), DATE))
  const slot = nextAvailable({ ...base, nowMs, fromDate: DATE, format: 'online', busy: [], horizonDays: 30 })
  // Tuesday 3rd is a holiday, Wed–Sat closed, Sunday 8th is leave → Monday 9th
  expect(slot!.startIso).toBe(at(hm(10), '2026-11-09'))
})

test('busyFromBookings releases expired holds and ignores cancelled', () => {
  const b = (status: Booking['status'], holdExpiresAt: number, start: number) =>
    ({ consultantId: 'c1', status, holdExpiresAt, startIso: at(start), endIso: at(start + 30) }) as Booking
  const now = Date.parse('2026-11-02T00:00:00Z')
  const busy = busyFromBookings(
    [b('reserved', now - 1, hm(10)), b('reserved', now + 60000, hm(11)), b('cancelled', 0, hm(12)), b('on-hold', 0, hm(14)), b('confirmed', 0, hm(15))],
    'c1',
    now,
  )
  expect(busy.map(x => x.startIso)).toEqual([at(hm(11)), at(hm(14)), at(hm(15))])
})
