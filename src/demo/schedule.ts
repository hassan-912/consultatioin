import type { ScheduleRules } from '../domain/availability'
import type { Format } from '../domain/types'
import { addDays } from '../domain/time'
import { todayIn } from '../store/useAppStore'

// DEMO schedules — real hours, breaks, leave and limits are pending decisions.
const h = (hh: number, mm = 0) => hh * 60 + mm
const day = (start: number, end: number) => [{ start, end }]
const rel = (n: number) => addDays(todayIn('Africa/Cairo'), n)

const egyptWeek = (sat = false): ScheduleRules['weekly'] => ({
  0: day(h(10), h(18)), 1: day(h(10), h(18)), 2: day(h(10), h(18)), 3: day(h(10), h(18)), 4: day(h(10), h(18)),
  5: [], 6: sat ? day(h(10), h(16)) : [],
})
const dubaiWeek: ScheduleRules['weekly'] = {
  0: [], 1: day(h(10), h(18)), 2: day(h(10), h(18)), 3: day(h(10), h(18)), 4: day(h(10), h(18)), 5: day(h(10), h(13)), 6: [],
}

const BOTH: Format[] = ['online', 'in-person']
const lunch = [{ start: h(13), end: h(13, 30) }]

const rule = (consultantId: string, weekly: ScheduleRules['weekly'], extra: Partial<ScheduleRules> = {}): ScheduleRules => ({
  consultantId, weekly, breaks: lunch, holidays: [], leave: [], unavailable: [], formats: BOTH, maxPerDay: 10, ...extra,
})

export function buildScheduleRules(): ScheduleRules[] {
  const companyHoliday = rel(9)
  return [
    rule('mohamed-gamal', egyptWeek(true), { holidays: [companyHoliday] }),
    rule('ahmed-salama', egyptWeek(), { holidays: [companyHoliday] }),
    rule('ahmed-khalil', egyptWeek(), { holidays: [companyHoliday], formats: ['online'] }),
    rule('mohamed-esmail', egyptWeek(true), { holidays: [companyHoliday], unavailable: [rel(1)] }),
    rule('ahmed-tarek', egyptWeek(), { holidays: [companyHoliday], leave: [{ from: rel(2), to: rel(4) }] }),
    rule('mohamed-salah', egyptWeek(true), { holidays: [companyHoliday], formats: ['in-person'] }),
    rule('mohamed-abdelaziz', dubaiWeek),
  ]
}
