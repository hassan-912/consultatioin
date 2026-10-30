import type { BookingEvent, CheckInVerdict } from '../domain/bookingStatus'
import type { Slot } from '../domain/availability'
import type { Actor, Booking, BookingStatus, CustomerDetails, Format, Lang, PaymentMethodId } from '../domain/types'

// Same class the store actions throw, so existing `instanceof` checks keep working.
export { SlotTaken } from '../store/actions'

/** The unpaid hold ran out before payment was submitted. */
export class HoldExpired extends Error {}

export interface ReserveDraft {
  consultantId: string
  format: Format
  startIso: string
  details: CustomerDetails
  lang: Lang
  /** The caller's previous hold from the same draft: reused for the same slot, released for another. */
  supersedes?: string
}

export interface PaymentInput {
  method: PaymentMethodId
  txnRef: string
  receipt?: Blob
  /** Already-compressed receipt, as produced by the payment form. Wins over `receipt`. */
  receiptName?: string
  receiptImage?: string
}

export interface BookingRepo {
  availableSlots(consultantId: string, date: string, format: Format): Promise<Slot[]>
  reserve(draft: ReserveDraft): Promise<{ bookingId: string; reference: string; manageToken: string; holdExpiresAt: number }>
  submitPayment(manageToken: string, p: PaymentInput): Promise<Booking>
  getByManageToken(token: string): Promise<Booking | null>
  /** Resolves to the manage token. */
  find(reference: string, phone: string): Promise<string | null>
  cancel(manageToken: string): Promise<Booking>
  reschedule(manageToken: string, startIso: string): Promise<Booking>
  staffList(filter: { statuses?: BookingStatus[]; consultantId?: string; date?: string }): Promise<Booking[]>
  staffTransition(bookingId: string, e: BookingEvent, actor?: Actor): Promise<Booking>
  /** Looks the code up and, when the verdict is `ok`, records the check-in. */
  checkIn(code: string): Promise<{ verdict: CheckInVerdict; booking?: Booking }>
  receiptUrl(bookingId: string): Promise<string | null>
  subscribe(onChange: () => void): () => void
}
