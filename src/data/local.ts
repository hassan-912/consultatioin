import { useAppStore, emptyDraft, todayIn } from '../store/useAppStore'
import { applyEvent, createReservation, rescheduleBooking, submitPayment, getRules, editSchedule } from '../store/actions'
import { consultants } from '../config/consultants'
import { demoStats } from '../demo/seed'
import { publicTotals } from '../domain/stats'
import { slotsFor } from '../features/shared/availability'
import { InvalidTransition, checkInVerdict } from '../domain/bookingStatus'
import { cleanPhone, normalizeDigits } from '../domain/phone'
import { dateInZone } from '../domain/time'
import { bookingConfig } from '../config/booking'
import type { Booking } from '../domain/types'
import { HoldExpired, type BookingRepo } from './types'

const get = () => useAppStore.getState()

const byToken = (token: string) => Object.values(get().bookings).find(b => b.manageToken === token)

function mustFind(token: string): Booking {
  const b = byToken(token)
  if (!b) throw new Error('Booking not found')
  return b
}

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })

/** Wraps the zustand-backed actions; the booking logic stays in store/actions. */
export function createLocalRepo(): BookingRepo {
  return {
    async availableSlots(consultantId, date, format) {
      return slotsFor(consultantId, date, format)
    },

    async reserve(d) {
      // createReservation works off the store's draft, so load it with the caller's choices.
      useAppStore.setState(s => ({
        draft: {
          ...s.draft, consultantId: d.consultantId, format: d.format, durationMin: bookingConfig.durations[d.format][0],
          slotStartIso: d.startIso, details: d.details, bookingId: d.supersedes ?? null,
        },
      }))
      const b = createReservation(d.lang)
      return { bookingId: b.id, reference: b.reference, manageToken: b.manageToken, holdExpiresAt: b.holdExpiresAt }
    },

    async submitPayment(token, p) {
      const b = mustFind(token)
      const receiptImage = p.receiptImage ?? (p.receipt ? await toDataUrl(p.receipt) : undefined)
      try {
        return submitPayment(b.id, { method: p.method, txnRef: p.txnRef, receiptName: p.receiptName, receiptImage })
      } catch (e) {
        if (e instanceof InvalidTransition && e.from === 'expired' && e.event === 'submit-payment') throw new HoldExpired()
        throw e
      }
    },

    async getByManageToken(token) {
      return byToken(token) ?? null
    },

    async find(reference, phone) {
      const r = normalizeDigits(reference).trim().toUpperCase()
      const p = cleanPhone(phone)
      return Object.values(get().bookings).find(b => b.reference === r && b.customer.phone === p)?.manageToken ?? null
    },

    async cancel(token) {
      return applyEvent(mustFind(token).id, { type: 'cancel' }, 'customer')
    },

    async reschedule(token, startIso) {
      return rescheduleBooking(mustFind(token).id, startIso, 'customer')
    },

    async staffList({ statuses, consultantId, date }) {
      return Object.values(get().bookings).filter(b =>
        (!statuses || statuses.includes(b.status)) &&
        (!consultantId || b.consultantId === consultantId) &&
        (!date || dateInZone(b.startIso, b.tz) === date))
    },

    async staffTransition(bookingId, e, actor) {
      return applyEvent(bookingId, e, actor ?? get().staffSession?.role ?? get().role)
    },

    async checkIn(raw) {
      const q = normalizeDigits(raw).trim()
      const b = Object.values(get().bookings).find(x => x.qrToken === q || x.reference === q.toUpperCase())
      const verdict = checkInVerdict(b, todayIn(b?.tz ?? 'Africa/Cairo', get().now()))
      if (!b) return { verdict }
      return { verdict, booking: verdict === 'ok' ? applyEvent(b.id, { type: 'check-in' }, 'reception') : b }
    },

    async receiptUrl(bookingId) {
      return get().bookings[bookingId]?.payment?.receiptImage ?? null
    },

    async staffManageToken(id) { return get().bookings[id]?.manageToken ?? '' },
    // Prototype: no real email; recording the send is the simulation.
    async queueTicketEmail(id) { applyEvent(id, { type: 'mark-sent', via: 'email' }, get().staffSession?.role ?? get().role); return 'sent' },
    async publicMetadata() {
      return consultants.map(c => ({ consultantId: c.id, formats: getRules(c.id).formats, ...publicTotals(Object.values(get().bookings), c.id, get().now(), demoStats[c.id]) }))
    },
    async staffRecords() { return get().records },
    async staffAudit() { return get().audit },
    async staffSchedules() { return Object.fromEntries(consultants.map(c => [c.id, getRules(c.id)])) },
    async saveSchedule(id, patch) {
      const baseLeave = getRules(id, {}).leave
      editSchedule(id, patch.leave ? { ...patch, leave: patch.leave.filter(l => !baseLeave.some(b => b.from === l.from && b.to === l.to)) } : patch)
    },
    async saveRecord(id, record) {
      useAppStore.setState(s => ({ records: { ...s.records, [id]: record } }))
      get().addAudit({ actor: get().role, action: 'edited', bookingRef: get().bookings[id]?.reference, to: record.outcome })
    },
    subscribe(onChange) {
      return useAppStore.subscribe(onChange)
    },
  }
}

/** Test helper: back to an empty, seeded store. */
export function resetLocalRepo() {
  useAppStore.setState({
    bookings: {}, audit: [], timeOffsetMs: 0, seeded: true, scheduleOverrides: {}, draft: emptyDraft(), lastCustomerBookingId: null,
  })
}
