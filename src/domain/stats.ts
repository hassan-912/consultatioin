import type { Booking } from './types'
import { dateInZone } from './time'

export interface Outcomes { approved: number; refused: number; pending: number; withdrawn: number }

export function approvalStats(o: Outcomes, minSample: number): { visible: boolean; rate?: number; decided: number } {
  const decided = o.approved + o.refused
  if (decided < minSample || decided === 0) return { visible: false, decided }
  return { visible: true, rate: o.approved / decided, decided }
}

/** Completed consultations only — cancelled appointments and no-shows never count. */
export function publicTotals(
  bookings: Booking[],
  consultantId: string,
  nowMs: number,
  baseline: { total: number; thisMonth: number } = { total: 0, thisMonth: 0 },
): { total: number; thisMonth: number } {
  const month = dateInZone(nowMs, 'Africa/Cairo').slice(0, 7)
  const done = bookings.filter(b => b.consultantId === consultantId && b.status === 'completed')
  return {
    total: baseline.total + done.length,
    thisMonth: baseline.thisMonth + done.filter(b => dateInZone(b.startIso, b.tz).slice(0, 7) === month).length,
  }
}
