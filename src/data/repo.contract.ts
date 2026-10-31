import { addDays } from '../domain/time'
import { emptyDetails, todayIn } from '../store/useAppStore'
import type { Format } from '../domain/types'
import type { BookingRepo } from './types'
import { HoldExpired, SlotTaken } from './types'

/** What a backend must provide so the contract can drive time, which the real clock cannot. */
export interface Harness {
  repo: BookingRepo
  advanceTime: (ms: number) => void
}

const CONSULTANT = 'mohamed-gamal'
const FORMAT: Format = 'online'
const details = { ...emptyDetails('en'), name: 'Sara', phone: '+201001234567', email: 's@e.com', program: 'immigration' as const }

async function firstSlot(repo: BookingRepo, skip = 0) {
  const found: string[] = []
  for (let i = 1; i < 14; i++) {
    const slots = await repo.availableSlots(CONSULTANT, addDays(todayIn('Africa/Cairo'), i), FORMAT)
    found.push(...slots.map(s => s.startIso))
    if (found.length > skip) return found[skip]
  }
  throw new Error('no slot available')
}

export function runContract(name: string, make: () => Harness) {
  describe(`BookingRepo contract: ${name}`, () => {
    let h: Harness
    beforeEach(() => { h = make() })

    const reserve = (startIso: string, phone = details.phone) =>
      h.repo.reserve({ consultantId: CONSULTANT, format: FORMAT, startIso, details: { ...details, phone }, lang: 'en' })

    test('reserve, pay, staff verify, then check in exactly once', async () => {
      const startIso = await firstSlot(h.repo)
      const r = await reserve(startIso)
      expect(r.reference).toMatch(/^MG-/)
      expect((await h.repo.getByManageToken(r.manageToken))?.status).toBe('reserved')

      const paid = await h.repo.submitPayment(r.manageToken, { method: 'instapay', txnRef: 'T1234' })
      expect(paid.status).toBe('on-hold')
      const queue = await h.repo.staffList({ statuses: ['on-hold'] })
      expect(queue.map(b => b.id)).toContain(r.bookingId)

      const confirmed = await h.repo.staffTransition(r.bookingId, { type: 'verify' })
      expect(confirmed.status).toBe('confirmed')

      h.advanceTime(Date.parse(startIso) - Date.now())
      const first = await h.repo.checkIn(confirmed.qrToken)
      expect(first.verdict).toBe('ok')
      expect(first.booking?.status).toBe('checked-in')
      expect((await h.repo.checkIn(confirmed.qrToken)).verdict).toBe('already-used')
      expect((await h.repo.checkIn('no-such-code')).verdict).toBe('not-found')
    })

    test('a second reservation on the same slot throws SlotTaken', async () => {
      const startIso = await firstSlot(h.repo)
      await reserve(startIso)
      await expect(reserve(startIso, '+201112223334')).rejects.toBeInstanceOf(SlotTaken)
    })

    test('submitting payment after the hold expired throws HoldExpired', async () => {
      const r = await reserve(await firstSlot(h.repo))
      h.advanceTime(31 * 60000)
      await expect(h.repo.submitPayment(r.manageToken, { method: 'instapay', txnRef: 'T1234' })).rejects.toBeInstanceOf(HoldExpired)
    })

    test('an unknown manage token yields null', async () => {
      expect(await h.repo.getByManageToken('wrong')).toBeNull()
    })

    test('find accepts Arabic-digit phones and returns the manage token', async () => {
      const r = await reserve(await firstSlot(h.repo))
      expect(await h.repo.find(r.reference.toLowerCase(), '+٢٠١٠٠١٢٣٤٥٦٧')).toBe(r.manageToken)
      expect(await h.repo.find(r.reference, '+201000000000')).toBeNull()
    })

    test('cancel releases the slot and reschedule moves the booking', async () => {
      const startIso = await firstSlot(h.repo)
      const other = await firstSlot(h.repo, 4)
      const r = await reserve(startIso)
      await h.repo.submitPayment(r.manageToken, { method: 'instapay', txnRef: 'T1234' })
      const moved = await h.repo.reschedule(r.manageToken, other)
      expect(moved.startIso).toBe(new Date(other).toISOString())
      expect((await h.repo.cancel(r.manageToken)).status).toBe('cancelled')
    })

    test('subscribe notifies on change until unsubscribed', async () => {
      let calls = 0
      const off = h.repo.subscribe(() => { calls++ })
      await reserve(await firstSlot(h.repo))
      expect(calls).toBeGreaterThan(0)
      off()
      const before = calls
      await h.repo.cancel((await h.repo.staffList({}))[0].manageToken)
      expect(calls).toBe(before)
    })
  })
}

