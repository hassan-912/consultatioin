import { useAppStore, emptyDraft } from './useAppStore'
import { applyEvent, createReservation, rescheduleBooking, SlotTaken, submitPayment } from './actions'
import type { Booking } from '../domain/types'

const NOW = Date.now()
const start = new Date(NOW + 2 * 86400000).toISOString()
const end = new Date(NOW + 2 * 86400000 + 30 * 60000).toISOString()

const mk = (id: string, over: Partial<Booking>): Booking => ({
  id, reference: `MG-${id.toUpperCase().padEnd(4, 'X')}-TEST`, qrToken: id.padEnd(32, '0'), manageToken: `m${id}`.padEnd(32, '0'),
  consultantId: 'mohamed-gamal', branchId: 'nasr-city', format: 'online', durationMin: 45, startIso: start, endIso: end,
  tz: 'Africa/Cairo', price: { amount: 900, currency: 'EGP' },
  customer: { name: 'X', phone: '+201001234567', email: 'x@e.com', channel: 'email', consultationLang: 'en', program: 'immigration', note: '' },
  status: 'on-hold', holdExpiresAt: NOW - 60000, createdAt: NOW - 3600000, ...over,
})

const draftFor = (slotStartIso: string, bookingId: string | null = null) => ({
  ...emptyDraft(), consultantId: 'mohamed-gamal', format: 'online' as const, durationMin: 45, slotStartIso, bookingId,
  details: { ...emptyDraft().details, name: 'Sara', phone: '+201001234567', email: 's@e.com', program: 'immigration' as const },
})

beforeEach(() => useAppStore.setState({ bookings: {}, audit: [], timeOffsetMs: 0, seeded: true }))

test('verifying a late transfer whose slot was re-booked is refused', () => {
  useAppStore.setState({ bookings: { a: mk('a', { status: 'late-transfer' }), b: mk('b', { status: 'confirmed' }) } })
  expect(() => applyEvent('a', { type: 'verify' }, 'finance')).toThrow(SlotTaken)
  expect(useAppStore.getState().bookings.a.status).toBe('late-transfer')
})

test('a rejected payment can be resubmitted after the hold deadline', () => {
  useAppStore.setState({ bookings: { a: mk('a', { status: 'rejected', rejectReason: 'not found' }) } })
  expect(submitPayment('a', { method: 'instapay', txnRef: 'T9' }).status).toBe('on-hold')
})

test('resubmitting a rejected payment refuses a slot someone else now holds', () => {
  useAppStore.setState({ bookings: { a: mk('a', { status: 'rejected' }), b: mk('b', { status: 'confirmed' }) } })
  expect(() => submitPayment('a', { method: 'instapay', txnRef: 'T9' })).toThrow(SlotTaken)
})

test('transaction references are normalised to Western digits', () => {
  useAppStore.setState({ bookings: { a: mk('a', { status: 'reserved', holdExpiresAt: NOW + 600000 }) } })
  expect(submitPayment('a', { method: 'instapay', txnRef: ' ١٢٣٤٥٦ ' }).payment!.txnRef).toBe('123456')
})

test('rescheduling into an occupied slot is refused', () => {
  const other = new Date(Date.parse(start) + 3600000).toISOString()
  useAppStore.setState({
    bookings: { a: mk('a', { status: 'confirmed' }), b: mk('b', { status: 'confirmed', startIso: other, endIso: new Date(Date.parse(other) + 1800000).toISOString() }) },
  })
  expect(() => rescheduleBooking('a', other, 'customer')).toThrow(SlotTaken)
})

test('a stale draft cannot reserve a slot that has already started', () => {
  useAppStore.setState({ draft: draftFor(new Date(NOW - 3600000).toISOString()) })
  expect(() => createReservation()).toThrow(SlotTaken)
})

test('a cancelled hold is not reused for the payment step', () => {
  useAppStore.setState({ bookings: { a: mk('a', { status: 'cancelled' }) }, draft: draftFor(start, 'a') })
  const b = createReservation()
  expect(b.id).not.toBe('a')
  expect(b.status).toBe('reserved')
})
