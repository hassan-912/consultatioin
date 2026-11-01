import { transition, checkInVerdict, InvalidTransition, arrivalTiming } from './bookingStatus'
import { approvalStats, publicTotals } from './stats'
import { useAppStore } from '../store/useAppStore'
import { createReservation, submitPayment, applyEvent } from '../store/actions'
import type { Booking } from './types'

const NOW = Date.parse('2026-11-02T08:00:00Z')

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'b1', reference: 'MG-AAAA-BBBB', qrToken: 'q'.repeat(32), manageToken: 'm'.repeat(32),
  consultantId: 'mohamed-gamal', branchId: 'nasr-city', format: 'in-person', durationMin: 30,
  startIso: '2026-11-02T10:00:00.000Z', endIso: '2026-11-02T10:30:00.000Z', tz: 'Africa/Cairo',
  price: { amount: 1000, currency: 'EGP' },
  customer: { name: 'Sara', phone: '+201001234567', email: 's@e.com', channel: 'email', consultationLang: 'ar', program: 'immigration', note: '' },
  status: 'reserved', holdExpiresAt: NOW + 30 * 60000, createdAt: NOW, ...over,
})
const pay = { method: 'instapay' as const, txnRef: 'TX1', submittedAt: NOW }

describe('transition', () => {
  test('happy path', () => {
    let b = transition(booking(), { type: 'submit-payment', payment: pay }, NOW)
    expect(b.status).toBe('on-hold')
    b = transition(b, { type: 'verify' }, NOW)
    expect(b.status).toBe('confirmed')
    b = transition(b, { type: 'check-in' }, NOW)
    expect(b.status).toBe('checked-in')
    expect(b.checkedInAt).toBe(NOW)
    expect(transition(b, { type: 'complete' }, NOW).status).toBe('completed')
  })
  test('payment after the deadline is refused', () => {
    expect(() => transition(booking(), { type: 'submit-payment', payment: pay }, NOW + 31 * 60000)).toThrow(InvalidTransition)
  })
  test('expire only from reserved or rejected', () => {
    expect(transition(booking(), { type: 'expire' }, NOW).status).toBe('expired')
    expect(() => transition(booking({ status: 'on-hold' }), { type: 'expire' }, NOW)).toThrow(InvalidTransition)
  })
  test('verify only from review states; late only from expired', () => {
    expect(() => transition(booking(), { type: 'verify' }, NOW)).toThrow(InvalidTransition)
    expect(transition(booking({ status: 'expired' }), { type: 'late' }, NOW).status).toBe('late-transfer')
    expect(() => transition(booking({ status: 'on-hold' }), { type: 'late' }, NOW)).toThrow(InvalidTransition)
  })
  test('check-in only once', () => {
    expect(() => transition(booking({ status: 'checked-in' }), { type: 'check-in' }, NOW)).toThrow(InvalidTransition)
  })
  test('reject keeps reason; online verify creates private meeting link', () => {
    expect(transition(booking({ status: 'on-hold' }), { type: 'reject', reason: 'No transfer found' }, NOW).rejectReason).toBe('No transfer found')
    const online = transition(booking({ status: 'on-hold', format: 'online' }), { type: 'verify' }, NOW)
    expect(online.meetingUrl).toMatch(/\/meet\//)
  })
})

describe('checkInVerdict', () => {
  const today = '2026-11-02'
  test.each([
    [undefined, 'not-found'],
    [booking({ status: 'confirmed' }), 'ok'],
    [booking({ status: 'on-hold' }), 'on-hold'],
    [booking({ status: 'reserved' }), 'unpaid'],
    [booking({ status: 'checked-in' }), 'already-used'],
    [booking({ status: 'cancelled' }), 'cancelled'],
    [booking({ status: 'expired' }), 'expired'],
    [booking({ status: 'confirmed', startIso: '2026-11-05T10:00:00.000Z' }), 'wrong-date'],
  ] as const)('%#', (b, v) => {
    expect(checkInVerdict(b as Booking | undefined, today)).toBe(v)
  })
})

describe('stats', () => {
  test('approval rate hidden below minimum sample', () => {
    expect(approvalStats({ approved: 12, refused: 4, pending: 9, withdrawn: 3 }, 20)).toEqual({ visible: false, decided: 16 })
    expect(approvalStats({ approved: 18, refused: 6, pending: 2, withdrawn: 1 }, 20)).toEqual({ visible: true, rate: 0.75, decided: 24 })
  })
  test('public totals count completed only', () => {
    const bs = [
      booking({ id: '1', status: 'completed' }),
      booking({ id: '2', status: 'cancelled' }),
      booking({ id: '3', status: 'no-show' }),
      booking({ id: '4', status: 'completed', startIso: '2026-09-01T10:00:00.000Z' }),
    ]
    expect(publicTotals(bs, 'mohamed-gamal', NOW, { total: 100, thisMonth: 5 })).toEqual({ total: 102, thisMonth: 6 })
  })
})

describe('store actions', () => {
  beforeEach(() => useAppStore.setState({ bookings: {}, audit: [], timeOffsetMs: 0 }))
  const draft = () => ({
    ...useAppStore.getState().draft,
    consultantId: 'mohamed-gamal', format: 'online' as const, durationMin: 30,
    slotStartIso: new Date(Date.now() + 86400000).toISOString(),
    details: { ...useAppStore.getState().draft.details, name: 'Sara', phone: '+201001234567', email: 's@e.com' },
  })

  test('createReservation is idempotent for the same draft', () => {
    useAppStore.setState({ draft: draft() })
    const a = createReservation()
    const b = createReservation()
    expect(a.id).toBe(b.id)
    expect(Object.keys(useAppStore.getState().bookings)).toHaveLength(1)
    expect(a.reference).toMatch(/^MG-/)
  })

  test('submitting payment twice keeps one on-hold booking and one audit entry', () => {
    useAppStore.setState({ draft: draft() })
    const r = createReservation()
    submitPayment(r.id, { method: 'vodafone-cash', txnRef: 'T1' })
    submitPayment(r.id, { method: 'vodafone-cash', txnRef: 'T1' })
    const s = useAppStore.getState()
    expect(s.bookings[r.id].status).toBe('on-hold')
    expect(s.audit.filter(e => e.action === 'submitted')).toHaveLength(1)
  })

  test('applyEvent records actor in audit', () => {
    useAppStore.setState({ draft: draft() })
    const r = createReservation()
    submitPayment(r.id, { method: 'instapay', txnRef: 'T2' })
    applyEvent(r.id, { type: 'verify' }, 'finance')
    const s = useAppStore.getState()
    expect(s.bookings[r.id].status).toBe('confirmed')
    expect(s.audit[0]).toMatchObject({ actor: 'finance', from: 'on-hold', to: 'confirmed', bookingRef: r.reference })
  })
})

test('arrival timing: early beyond 15 minutes, on time within 15, late beyond 15', () => {
  const b = { startIso: '2026-11-02T12:00:00.000Z' }
  const at = (min: number) => Date.parse(b.startIso) + min * 60000
  expect(arrivalTiming(b, at(-40))).toEqual({ kind: 'early', minutes: 40 })
  expect(arrivalTiming(b, at(-15))).toEqual({ kind: 'on-time', minutes: 15 })
  expect(arrivalTiming(b, at(5))).toEqual({ kind: 'on-time', minutes: 5 })
  expect(arrivalTiming(b, at(15))).toEqual({ kind: 'on-time', minutes: 15 })
  expect(arrivalTiming(b, at(16))).toEqual({ kind: 'late', minutes: 16 })
})
