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
import { HoldExpired, RepoError, SlotTaken, type BookingRepo } from './types'
import { staffAccounts } from '../config/staffAccounts'
import { consultantBusy } from '../domain/bookingStatus'
import { localReferralCode } from './referral'

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
    async consultantReviews(consultantId) {
      const list = Object.values(get().reviews).filter(r => r.consultantId === consultantId && !r.hidden).sort((a, b) => b.at - a.at)
      const average = list.length ? Math.round((list.reduce((n, r) => n + r.rating, 0) / list.length) * 10) / 10 : null
      return { average, count: list.length, reviews: list.slice(0, 20).map(r => ({ rating: r.rating, comment: r.comment, name: r.name, at: r.at })) }
    },
    async getReview(token) {
      const r = get().reviews[mustFind(token).id]
      if (!r) return null
      return { rating: r.rating, comment: r.comment, name: r.name, at: r.at }
    },
    async submitReview(token, rating, comment) {
      const b = mustFind(token)
      if (b.status !== 'completed' || get().reviews[b.id]) throw new RepoError('INVALID_TRANSITION')
      const text = comment.trim()
      if (!Number.isInteger(rating) || rating < 1 || rating > 5 || text.length > 500) throw new RepoError('INVALID_INPUT')
      const review = { rating, comment: text, name: b.customer.name.trim().split(/\s+/)[0] || 'Customer', at: get().now() }
      useAppStore.setState(s => ({ reviews: { ...s.reviews, [b.id]: { ...review, consultantId: b.consultantId } } }))
      get().addAudit({ actor: 'customer', action: 'reviewed', bookingRef: b.reference, to: String(rating) })
      return review
    },
    async saveAssessment(token, a) {
      const b = mustFind(token)
      if (!['reserved', 'on-hold'].includes(b.status)) throw new RepoError('INVALID_TRANSITION')
      useAppStore.setState(s => ({ assessments: { ...s.assessments, [b.id]: a } }))
    },
    async staffAssessments() {
      const session = get().staffSession
      if (!session || !['admin', 'consultant', 'sales'].includes(session.role)) return {}
      const code = session.role === 'sales' ? localReferralCode(session.username) : null
      return Object.fromEntries(Object.entries(get().assessments).filter(([id]) => session.role === 'admin'
        || (session.role === 'consultant' && get().bookings[id]?.consultantId === session.consultantId)
        || (code !== null && get().bookings[id]?.salesCode === code)))
    },
    // Prototype: one code per username, so links are stable between sessions.
    async myReferralCode() { return localReferralCode(get().staffSession?.username ?? '') },
    async setReferral(token, code) {
      const b = mustFind(token)
      if (!['reserved', 'on-hold'].includes(b.status) || b.salesCode) return false
      if (!/^[a-z0-9]{8}$/.test(code)) return false
      const account = staffAccounts.find(a => localReferralCode(a.username) === code)
      useAppStore.setState(s => ({ bookings: { ...s.bookings, [b.id]: { ...b, salesCode: code, salesName: account?.username ?? `Sales ${code}` } } }))
      return true
    },
    async reassignConsultant(id, consultantId) {
      const b = get().bookings[id]
      if (!b) throw new RepoError('NOT_FOUND')
      if (!['confirmed', 'checked-in'].includes(b.status)) throw new RepoError('INVALID_TRANSITION')
      const target = consultants.find(c => c.id === consultantId)
      if (!target || (b.format === 'in-person' && target.branchId !== b.branchId)) throw new RepoError('INVALID_INPUT')
      if (consultantBusy(Object.values(get().bookings), consultantId, b)) throw new SlotTaken()
      const next = { ...b, consultantId }
      useAppStore.setState(s => ({ bookings: { ...s.bookings, [id]: next } }))
      get().addAudit({ actor: get().staffSession?.role ?? 'reception', action: 'consultant-changed', bookingRef: b.reference, from: b.consultantId, to: consultantId })
      return next
    },
    async staffReviews() {
      return Object.entries(get().reviews)
        .map(([bookingId, r]) => ({ ...r, id: bookingId, hidden: !!r.hidden, bookingRef: get().bookings[bookingId]?.reference }))
        .sort((a, b) => b.at - a.at)
    },
    async setReviewHidden(id, hidden) {
      const r = get().reviews[id]
      if (!r) throw new RepoError('NOT_FOUND')
      useAppStore.setState(s => ({ reviews: { ...s.reviews, [id]: { ...r, hidden } } }))
      get().addAudit({ actor: 'admin', action: hidden ? 'review-hidden' : 'review-shown', bookingRef: get().bookings[id]?.reference, to: String(r.rating) })
    },
    async staffDecisions() { return get().decisions },
    async saveDecision({ id, ...d }) {
      if (!d.question.en.trim() && !d.question.ar.trim()) throw new RepoError('INVALID_INPUT')
      if (id) {
        if (!get().decisions.some(x => x.id === id)) throw new RepoError('NOT_FOUND')
        useAppStore.setState(s => ({ decisions: s.decisions.map(x => (x.id === id ? { ...d, id } : x)) }))
      } else {
        useAppStore.setState(s => ({ decisions: [...s.decisions, { ...d, id: crypto.randomUUID() }] }))
        get().addAudit({ actor: 'admin', action: 'decision-added', to: d.question.en || d.question.ar })
      }
    },
    async resolveDecision(id) {
      const d = get().decisions.find(x => x.id === id)
      if (!d) throw new RepoError('NOT_FOUND')
      useAppStore.setState(s => ({ decisions: s.decisions.filter(x => x.id !== id) }))
      get().addAudit({ actor: 'admin', action: 'decision-resolved', to: d.question.en || d.question.ar })
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
