import { useAppStore } from './useAppStore'
import { transition, type BookingEvent } from '../domain/bookingStatus'
import { makeReference, makeToken } from '../domain/ids'
import { priceFor } from '../domain/pricing'
import { cleanPhone, normalizeDigits } from '../domain/phone'
import { bookingConfig } from '../config/booking'
import { consultants as baseConsultants } from '../config/consultants'
import { branchById } from '../config/branches'
import { buildScheduleRules } from '../demo/schedule'
import { buildSeed } from '../demo/seed'
import { isBlocking, type ScheduleRules } from '../domain/availability'
import type { Actor, Booking, Consultant, PaymentMethodId } from '../domain/types'

const get = () => useAppStore.getState()
const set = useAppStore.setState

export class SlotTaken extends Error {}

function audit(actor: Actor, action: string, b?: Booking, from?: string, to?: string) {
  get().addAudit({ actor, action, bookingRef: b?.reference, from, to })
}

function save(b: Booking) {
  set(s => ({ bookings: { ...s.bookings, [b.id]: b } }))
}

/** Creates (or returns the existing) held reservation for the current draft. Safe to call repeatedly. */
export function createReservation(lang = get().lang): Booking {
  const { draft, bookings, now } = get()
  const existing = draft.bookingId ? bookings[draft.bookingId] : undefined
  if (existing?.status === 'reserved' && existing.startIso === draft.slotStartIso && existing.format === draft.format && existing.durationMin === draft.durationMin)
    return existing

  if (!draft.consultantId || !draft.format || !draft.durationMin || !draft.slotStartIso) throw new Error('Incomplete draft')
  const consultant = getConsultant(draft.consultantId)
  const branch = branchById(consultant.branchId)
  const start = Date.parse(draft.slotStartIso)
  const end = start + draft.durationMin * 60000

  if (start < now() || clashes(consultant.id, start, end, existing?.id)) throw new SlotTaken()

  // Release a previous hold from this same draft if the customer changed their slot.
  if (existing?.status === 'reserved') save({ ...existing, status: 'cancelled' })

  const b: Booking = {
    id: makeToken().slice(0, 12),
    reference: makeReference(),
    qrToken: makeToken(),
    manageToken: makeToken(),
    consultantId: consultant.id,
    branchId: branch.id,
    format: draft.format,
    durationMin: draft.durationMin,
    startIso: new Date(start).toISOString(),
    endIso: new Date(end).toISOString(),
    tz: branch.timeZone,
    price: priceFor(draft.format, draft.durationMin, consultant.id),
    // Messages to the customer follow the language they booked in.
    customer: { ...draft.details, consultationLang: lang, phone: cleanPhone(draft.details.phone), email: draft.details.email.trim() },
    status: 'reserved',
    holdExpiresAt: now() + bookingConfig.holdMinutes * 60000,
    createdAt: now(),
  }
  save(b)
  set(s => ({ draft: { ...s.draft, bookingId: b.id }, lastCustomerBookingId: b.id }))
  audit('customer', 'created', b, undefined, 'reserved')
  return b
}

/** True when another booking already occupies [start, end) on this consultant's single timeline. */
function clashes(consultantId: string, start: number, end: number, excludeId?: string) {
  const { bookings, now } = get()
  return Object.values(bookings).some(
    b => b.consultantId === consultantId && b.id !== excludeId && isBlocking(b, now()) &&
      start < Date.parse(b.endIso) && end > Date.parse(b.startIso),
  )
}

const ownSlotClashes = (b: Booking) => clashes(b.consultantId, Date.parse(b.startIso), Date.parse(b.endIso), b.id)

export function submitPayment(id: string, p: { method: PaymentMethodId; txnRef: string; receiptName?: string; receiptImage?: string }): Booking {
  const b = get().bookings[id]
  if (b.status === 'on-hold') return b // double submit: already received
  // A rejected booking released its slot; make sure nobody took it meanwhile.
  if (b.status === 'rejected' && ownSlotClashes(b)) throw new SlotTaken()
  const txnRef = normalizeDigits(p.txnRef).trim()
  const next = transition(b, { type: 'submit-payment', payment: { ...p, txnRef, submittedAt: get().now() } }, get().now())
  save(next)
  audit('customer', 'submitted', next, b.status, next.status)
  return next
}

export function applyEvent(id: string, e: BookingEvent, actor: Actor): Booking {
  const b = get().bookings[id]
  // Released slots (late transfers) may have been re-booked before finance confirms.
  if (e.type === 'verify' && !isBlocking(b, get().now()) && ownSlotClashes(b)) throw new SlotTaken()
  const next = transition(b, e, get().now())
  save(next)
  const action = e.type === 'mark-sent' ? 'sent' : e.type === 'check-in' ? 'checkin' : 'transition'
  audit(actor, action, next, b.status, e.type === 'mark-sent' ? e.via : next.status)
  return next
}

/** Expires unpaid holds whose deadline has passed. Returns how many expired. */
export function expireDue(): number {
  const { bookings, now } = get()
  const due = Object.values(bookings).filter(b => b.status === 'reserved' && b.holdExpiresAt <= now())
  for (const b of due) {
    save({ ...b, status: 'expired' })
    audit('system', 'transition', b, 'reserved', 'expired')
  }
  return due.length
}

export function skipTime(ms: number) {
  set(s => ({ timeOffsetMs: s.timeOffsetMs + ms }))
  expireDue()
}

export function cancelBooking(id: string, actor: Actor) {
  return applyEvent(id, { type: 'cancel' }, actor)
}

/** Moves a booking to a new slot, keeping its payment and reference. */
export function rescheduleBooking(id: string, startIso: string, actor: Actor): Booking {
  const b = get().bookings[id]
  const start = Date.parse(startIso)
  if (start < get().now() || clashes(b.consultantId, start, start + b.durationMin * 60000, b.id)) throw new SlotTaken()
  const next = { ...b, startIso: new Date(start).toISOString(), endIso: new Date(start + b.durationMin * 60000).toISOString() }
  save(next)
  audit(actor, 'transition', next, b.startIso, next.startIso)
  return next
}

// ---- configuration with admin overrides ----

export function getConsultant(id: string, overrides = get().consultantOverrides): Consultant {
  const base = baseConsultants.find(c => c.id === id)!
  return { ...base, ...overrides[id] }
}

export function getConsultants(overrides = get().consultantOverrides): Consultant[] {
  return baseConsultants.map(c => ({ ...c, ...overrides[c.id] }))
}

const baseRules = buildScheduleRules()

export function getRules(consultantId: string, overrides = get().scheduleOverrides): ScheduleRules {
  const r = baseRules.find(x => x.consultantId === consultantId)!
  const o = overrides[consultantId] ?? {}
  // Overrides replace the demo lists, so the admin can also remove a demo day off.
  return { ...r, ...o, leave: o.leave ?? r.leave, blocked: o.blocked ?? [] }
}

export function editConsultant(id: string, patch: Partial<Consultant>, actor: Actor = 'admin') {
  set(s => ({ consultantOverrides: { ...s.consultantOverrides, [id]: { ...s.consultantOverrides[id], ...patch } } }))
  audit(actor, 'edited', undefined, id, Object.keys(patch).join(', '))
}

export function editSchedule(id: string, patch: Partial<ScheduleRules>, actor: Actor = 'admin') {
  set(s => ({ scheduleOverrides: { ...s.scheduleOverrides, [id]: { ...s.scheduleOverrides[id], ...patch } } }))
  audit(actor, 'edited', undefined, id, Object.keys(patch).join(', '))
}

// ---- demo data ----

export function seedIfNeeded() {
  if (get().seeded) return
  set({ bookings: { ...buildSeed(get().now()), ...get().bookings }, seeded: true })
}

export function resetDemo() {
  set({
    bookings: buildSeed(Date.now()), audit: [], timeOffsetMs: 0, records: {}, consultantOverrides: {},
    scheduleOverrides: {}, kpiOverrides: {}, approvalMinSample: null, lastCustomerBookingId: null, seeded: true,
  })
  get().resetDraft()
}
