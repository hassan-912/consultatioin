import type { BookingEvent, CheckInVerdict } from '../domain/bookingStatus'
import type { Slot } from '../domain/availability'
import type { Actor, Booking, BookingStatus, CustomerDetails, Format, Lang, PaymentMethodId } from '../domain/types'
import type { ScheduleRules } from '../domain/availability'
import type { ConsultationRecord } from '../store/useAppStore'
import type { AuditEntry } from '../domain/types'

// Same class the store actions throw, so existing `instanceof` checks keep working.
export { SlotTaken } from '../store/actions'

/** The unpaid hold ran out before payment was submitted. */
export class HoldExpired extends Error {}
export class RepoError extends Error {
  constructor(public code: string, options?: ErrorOptions) { super(code, options) }
}
export interface PublicMetadata { consultantId: string; formats: Format[]; total: number; thisMonth: number }

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
  availableSlots(consultantId: string, date: string, format: Format, rescheduleToken?: string): Promise<Slot[]>
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
  staffManageToken(bookingId: string): Promise<string>
  publicMetadata(): Promise<PublicMetadata[]>
  staffRecords(): Promise<Record<string, ConsultationRecord>>
  saveRecord(bookingId: string, record: ConsultationRecord): Promise<void>
  staffAudit(): Promise<AuditEntry[]>
  staffSchedules(): Promise<Record<string, ScheduleRules>>
  saveSchedule(consultantId: string, patch: Partial<ScheduleRules>): Promise<void>
  subscribe(onChange: () => void): () => void
  /** Live transports report whether the realtime channel is up. Local mode has no channel and omits this. */
  onConnection?(fn: (state: 'connected' | 'reconnecting') => void): () => void
}
