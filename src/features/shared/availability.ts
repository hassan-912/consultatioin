import { useMemo } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { getRules } from '../../store/actions'
import { busyFromBookings, getSlots, nextAvailable, type Slot } from '../../domain/availability'
import { bookingConfig } from '../../config/booking'
import { branchById } from '../../config/branches'
import { consultants as baseConsultants } from '../../config/consultants'
import type { Consultant, Format } from '../../domain/types'
import { demoStats } from '../../demo/seed'
import { publicTotals } from '../../domain/stats'

export const shortestDuration = (f: Format) => Math.min(...bookingConfig.durations[f])

export function slotsFor(consultantId: string, date: string, format: Format, durationMin = shortestDuration(format), excludeBookingId?: string): Slot[] {
  const s = useAppStore.getState()
  const c = baseConsultants.find(x => x.id === consultantId)!
  const tz = branchById(c.branchId).timeZone
  const bookings = Object.values(s.bookings).filter(b => b.id !== excludeBookingId)
  return getSlots({
    rules: getRules(consultantId, s.scheduleOverrides),
    date, format, durationMin, tz,
    busy: busyFromBookings(bookings, consultantId, s.now()),
    bufferMin: bookingConfig.bufferMin,
    stepMin: bookingConfig.slotStepMin,
    nowMs: s.now(),
  })
}

export function nextFor(consultantId: string, fromDate: string, format: Format): Slot | null {
  const s = useAppStore.getState()
  const c = baseConsultants.find(x => x.id === consultantId)!
  return nextAvailable({
    rules: getRules(consultantId, s.scheduleOverrides),
    fromDate, format, durationMin: shortestDuration(format), tz: branchById(c.branchId).timeZone,
    busy: busyFromBookings(Object.values(s.bookings), consultantId, s.now()),
    bufferMin: bookingConfig.bufferMin, stepMin: bookingConfig.slotStepMin, nowMs: s.now(), horizonDays: 45,
  })
}

export function offeredFormats(consultantId: string): Format[] {
  return getRules(consultantId, useAppStore.getState().scheduleOverrides).formats
}

export interface Availability {
  formats: Format[]
  slots: { format: Format; slot: Slot }[]
  next: { format: Format; slot: Slot } | null
}

/** Availability for one consultant on a date for a format filter, from the appointment calendar. */
export function useAvailability(consultantId: string, date: string, format: Format | 'any'): Availability {
  const bookings = useAppStore(s => s.bookings)
  const overrides = useAppStore(s => s.scheduleOverrides)
  const offset = useAppStore(s => s.timeOffsetMs)
  return useMemo(() => {
    const formats = offeredFormats(consultantId).filter(f => format === 'any' || f === format)
    const slots = formats
      .flatMap(f => slotsFor(consultantId, date, f).map(slot => ({ format: f, slot })))
      .sort((a, b) => a.slot.startIso.localeCompare(b.slot.startIso))
    const dedup = slots.filter((s, i) => i === 0 || s.slot.startIso !== slots[i - 1].slot.startIso)
    const nexts = formats.map(f => ({ format: f, slot: nextFor(consultantId, date, f) })).filter(x => x.slot) as { format: Format; slot: Slot }[]
    nexts.sort((a, b) => a.slot.startIso.localeCompare(b.slot.startIso))
    return { formats, slots: dedup, next: nexts[0] ?? null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultantId, date, format, bookings, overrides, offset])
}

export function useConsultantStats(c: Consultant) {
  const bookings = useAppStore(s => s.bookings)
  const kpiOverride = useAppStore(s => s.kpiOverrides[c.id])
  const now = useAppStore(s => s.now)
  return useMemo(() => {
    const demo = demoStats[c.id]
    const totals = publicTotals(Object.values(bookings), c.id, now(), { total: demo.total, thisMonth: demo.thisMonth })
    return { ...totals, kpi: kpiOverride ?? demo.kpi, outcomes: demo.outcomes }
  }, [bookings, c.id, kpiOverride, now])
}

/** Demo outcome history plus outcomes recorded by consultants in this session. */
export function useOutcomes(consultantId: string) {
  const records = useAppStore(s => s.records)
  const bookings = useAppStore(s => s.bookings)
  return useMemo(() => {
    const o = { ...demoStats[consultantId].outcomes }
    for (const [bookingId, r] of Object.entries(records)) {
      if (bookings[bookingId]?.consultantId !== consultantId) continue
      if (r.outcome === 'approved' || r.outcome === 'refused' || r.outcome === 'pending' || r.outcome === 'withdrawn') o[r.outcome]++
    }
    return o
  }, [records, bookings, consultantId])
}
