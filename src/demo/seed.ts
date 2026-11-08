import type { Booking, BookingStatus, Format, ProgramId } from '../domain/types'
import type { Outcomes } from '../domain/stats'
import { consultants } from '../config/consultants'
import { branchById } from '../config/branches'
import { buildScheduleRules } from './schedule'
import { isDayOff } from '../domain/availability'
import { addDays, dateInZone, zonedDateTimeToIso } from '../domain/time'
import { makeReference, makeToken } from '../domain/ids'
import { priceFor } from '../domain/pricing'
import { demoReceipt } from '../domain/receipt'

// ---- DEMO statistics: every number here is demonstration data, not company records. ----
export interface DemoStats { kpi: number; total: number; thisMonth: number; outcomes: Outcomes }

export const demoStats: Record<string, DemoStats> = {
  'mohamed-gamal': { kpi: 9.1, total: 412, thisMonth: 23, outcomes: { approved: 18, refused: 6, pending: 7, withdrawn: 2 } },
  'ahmed-salama': { kpi: 8.4, total: 236, thisMonth: 17, outcomes: { approved: 11, refused: 4, pending: 5, withdrawn: 1 } },
  'ahmed-khalil': { kpi: 7.6, total: 98, thisMonth: 12, outcomes: { approved: 3, refused: 1, pending: 4, withdrawn: 0 } },
  'mohamed-esmail': { kpi: 7.9, total: 141, thisMonth: 14, outcomes: { approved: 6, refused: 3, pending: 3, withdrawn: 1 } },
  'ahmed-tarek': { kpi: 8.6, total: 228, thisMonth: 16, outcomes: { approved: 12, refused: 5, pending: 6, withdrawn: 2 } },
  'mohamed-salah': { kpi: 7.8, total: 104, thisMonth: 11, outcomes: { approved: 4, refused: 2, pending: 3, withdrawn: 0 } },
  'mohamed-abdelaziz': { kpi: 8.2, total: 133, thisMonth: 13, outcomes: { approved: 7, refused: 2, pending: 4, withdrawn: 1 } },
}

const people = [
  ['Nour Adel', 'نور عادل'], ['Karim Fathy', 'كريم فتحي'], ['Mariam Hassan', 'مريم حسن'], ['Omar Lotfy', 'عمر لطفي'],
  ['Yasmin Saad', 'ياسمين سعد'], ['Hany Mostafa', 'هاني مصطفى'], ['Dina Farouk', 'دينا فاروق'], ['Tamer Nabil', 'تامر نبيل'],
  ['Salma Ibrahim', 'سلمى إبراهيم'], ['Youssef Amin', 'يوسف أمين'], ['Rana Khaled', 'رنا خالد'], ['Ali Mahmoud', 'علي محمود'],
  ['Laila Samir', 'ليلى سمير'], ['Sherif Ramzy', 'شريف رمزي'], ['Aya Gaber', 'آية جابر'], ['Mostafa Zaki', 'مصطفى زكي'],
]

interface Spec { c: string; day: number; at: [number, number]; format: Format; dur: number; status: BookingStatus; txn?: boolean; receipt?: boolean; sent?: boolean }

const plan: Spec[] = [
  // Today — reception arrivals
  { c: 'mohamed-gamal', day: 0, at: [11, 0], format: 'in-person', dur: 45, status: 'confirmed', txn: true, sent: true },
  { c: 'ahmed-salama', day: 0, at: [12, 0], format: 'in-person', dur: 45, status: 'confirmed', txn: true, sent: true },
  { c: 'mohamed-esmail', day: 0, at: [15, 0], format: 'in-person', dur: 45, status: 'checked-in', txn: true, sent: true },
  { c: 'mohamed-salah', day: 0, at: [16, 0], format: 'in-person', dur: 45, status: 'confirmed', txn: true, sent: true },
  { c: 'mohamed-abdelaziz', day: 0, at: [14, 0], format: 'in-person', dur: 45, status: 'confirmed', txn: true, sent: true },
  // Finance queue
  { c: 'mohamed-gamal', day: 1, at: [10, 0], format: 'online', dur: 45, status: 'on-hold', txn: true, receipt: true },
  { c: 'ahmed-tarek', day: 1, at: [11, 30], format: 'in-person', dur: 45, status: 'on-hold', txn: true },
  { c: 'mohamed-abdelaziz', day: 2, at: [16, 0], format: 'online', dur: 45, status: 'on-hold', txn: true, receipt: true },
  { c: 'ahmed-khalil', day: 2, at: [12, 0], format: 'online', dur: 45, status: 'on-hold', txn: true },
  { c: 'mohamed-esmail', day: 3, at: [14, 0], format: 'online', dur: 45, status: 'late-transfer', txn: true, receipt: true },
  // Confirmed, awaiting ticket send
  { c: 'ahmed-salama', day: 1, at: [15, 0], format: 'online', dur: 45, status: 'confirmed', txn: true },
  // Upcoming confirmed
  { c: 'mohamed-gamal', day: 2, at: [14, 0], format: 'in-person', dur: 45, status: 'confirmed', txn: true, sent: true },
  { c: 'mohamed-salah', day: 3, at: [11, 0], format: 'in-person', dur: 45, status: 'confirmed', txn: true, sent: true },
  // History
  { c: 'mohamed-gamal', day: -1, at: [10, 0], format: 'online', dur: 45, status: 'completed', txn: true, sent: true },
  { c: 'ahmed-tarek', day: -1, at: [12, 0], format: 'in-person', dur: 45, status: 'completed', txn: true, sent: true },
  { c: 'ahmed-salama', day: -2, at: [11, 0], format: 'in-person', dur: 45, status: 'no-show', txn: true, sent: true },
  { c: 'ahmed-khalil', day: -1, at: [14, 0], format: 'online', dur: 45, status: 'cancelled', txn: true },
  { c: 'mohamed-abdelaziz', day: -2, at: [10, 0], format: 'online', dur: 45, status: 'expired' },
]

const rulesById = Object.fromEntries(buildScheduleRules().map(r => [r.consultantId, r]))
const programsCycle: ProgramId[] = ['immigration', 'education', 'job-seeking', 'investment', 'tourism']

export function buildSeed(nowMs: number): Record<string, Booking> {
  const out: Record<string, Booking> = {}
  plan.forEach((s, i) => {
    const consultant = consultants.find(c => c.id === s.c)!
    const branch = branchById(consultant.branchId)
    const rules = rulesById[s.c]
    const today = dateInZone(nowMs, branch.timeZone)
    let date = addDays(today, s.day)
    // move forward/back to the consultant's nearest working day
    const step = s.day < 0 ? -1 : 1
    for (let k = 0; k < 10 && isDayOff(rules, date); k++) date = addDays(date, step)
    const startIso = zonedDateTimeToIso(date, s.at[0] * 60 + s.at[1], branch.timeZone)
    const start = Date.parse(startIso)
    const [nameEn] = people[i % people.length]
    const created = Math.min(nowMs, start) - 2 * 86400000
    const b: Booking = {
      id: `demo${i}`,
      reference: makeReference(),
      qrToken: makeToken(),
      manageToken: makeToken(),
      consultantId: s.c,
      branchId: branch.id,
      format: s.format,
      durationMin: s.dur,
      startIso,
      endIso: new Date(start + s.dur * 60000).toISOString(),
      tz: branch.timeZone,
      price: priceFor(s.format, s.dur),
      customer: {
        name: nameEn,
        phone: `+2010000${String(1000 + i * 37).slice(-4)}`,
        email: `${nameEn.split(' ')[0].toLowerCase()}@example.com`,
        channel: i % 2 ? 'email' : 'whatsapp',
        consultationLang: i % 3 ? 'ar' : 'en',
        program: programsCycle[i % programsCycle.length],
        note: '',
      },
      status: s.status,
      holdExpiresAt: created + 30 * 60000,
      payment: s.txn
        ? { method: i % 2 ? 'instapay' : 'vodafone-cash', txnRef: `TX${String(48210 + i * 113)}`, receiptName: s.receipt ? `receipt-${i}.jpg` : undefined,
            receiptImage: s.receipt ? demoReceipt(i % 2 ? 'instapay' : 'vodafone-cash', priceFor(s.format, s.dur).amount, `TX${String(48210 + i * 113)}`, new Date(created + 12 * 60000).toISOString().slice(0, 16).replace('T', ' ')) : undefined, submittedAt: created + 12 * 60000 }
        : undefined,
      checkedInAt: s.status === 'checked-in' ? start - 5 * 60000 : undefined,
      meetingUrl: s.format === 'online' && ['confirmed', 'completed'].includes(s.status) ? `#/meet/${makeToken()}` : undefined,
      ticketSentVia: s.sent ? (i % 2 ? 'email' : 'whatsapp') : undefined,
      ticketSentAt: s.sent ? created + 60 * 60000 : undefined,
      createdAt: created,
      demo: true,
    }
    out[b.id] = b
  })
  return out
}
