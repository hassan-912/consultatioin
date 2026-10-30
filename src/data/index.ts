import { createLocalRepo } from './local'

export type { BookingRepo, PaymentInput, ReserveDraft } from './types'
export { HoldExpired, SlotTaken } from './types'

/** The app talks to bookings only through this. */
export const repo = createLocalRepo()
