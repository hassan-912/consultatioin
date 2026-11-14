import type { BookingEvent, CheckInVerdict } from '../domain/bookingStatus'
import type { Slot } from '../domain/availability'
import type { Actor, Booking, BookingStatus, ConsultantReviews, CustomerDetails, DecisionInput, Format, Lang, PayCurrency, PaymentMethodId, PendingDecision, ProgramId, Review, ReviewStatus, ConsultantReview, StaffReview } from '../domain/types'
import type { ScheduleRules } from '../domain/availability'
import type { ConsultationRecord, NextStep } from '../store/useAppStore'
import type { MessageTemplateKey, MessageTemplates } from '../config/messageTemplates'
import type { AssessedProgram, Answers, StoredAssessment } from '../assessment/questions'
import type { ReadinessRules } from '../assessment/readiness'
import type { L10n } from '../domain/types'
import type { AuditEntry } from '../domain/types'

// Same class the store actions throw, so existing `instanceof` checks keep working.
export { SlotTaken } from '../store/actions'

/** The unpaid hold ran out before payment was submitted. */
export class HoldExpired extends Error {}
export class RepoError extends Error {
  constructor(public code: string, options?: ErrorOptions) { super(code, options) }
}
export interface PublicMetadata { consultantId: string; formats: Format[]; total: number; thisMonth: number; /** Shown on the home page (the admin can hide a consultant). */ listed: boolean }

export interface ReserveDraft {
  consultantId: string
  format: Format
  startIso: string
  details: CustomerDetails
  lang: Lang
  /** The caller's previous hold from the same draft: reused for the same slot, released for another. */
  supersedes?: string
}

export interface FinanceCase {
  bookingId: string; reference: string; name: string; phone: string; consultantId: string
  nextStep: Exclude<NextStep, 'thinking'>; program?: ProgramId; at: number; handledAt?: number
  /** Refunds: why, in the consultant's words. */
  refundReason?: string
  salesName?: string
  /** The consultation fee the client paid. */
  paid: { amount: number; currency: string }
}
/** A client who wasn't ready for their program: they didn't pay; the sales manager calls them. */
export interface ReadinessSubmission {
  name: string; phone: string; email: string; lang: Lang
  program: AssessedProgram; destination?: string
  consultantId: string; format: Format; wantedIso: string
  score: number | null; scoreMax: number | null; reasons: L10n[]; answers: Answers
}
export type ReadinessStatus = 'open' | 'contacted' | 'closed'
export interface ReadinessRequest extends ReadinessSubmission {
  id: string; createdAt: number; status: ReadinessStatus; handledAt?: number
  /** The salesperson the sales manager gave this client to. */
  assignedTo?: string; assignedName?: string
}
export interface SalesPerson { id: string; name: string }

export interface FreeSlot { consultantId: string; format: Format; startIso: string }

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
  /** Customer: open an EasyKash payment for a held booking. Resolves to the page to send the customer to. */
  startOnlinePayment(manageToken: string, currency: PayCurrency): Promise<string>
  /** Customer: ask EasyKash whether the latest payment went through (fallback when its callback is late). */
  checkOnlinePayment(manageToken: string): Promise<void>
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
  /** Finance/admin: send the ticket by email (any channel). Resolves to the outbox status. */
  queueTicketEmail(bookingId: string): Promise<'pending' | 'sending' | 'sent' | 'failed'>
  publicMetadata(): Promise<PublicMetadata[]>
  /** Public: rating summary and latest reviews for one consultant. */
  consultantReviews(consultantId: string): Promise<ConsultantReviews>
  /** The customer's own review of this booking, if any. */
  getReview(manageToken: string): Promise<Review | null>
  /** Allowed once, after the consultation is marked completed. */
  submitReview(manageToken: string, rating: number, comment: string): Promise<Review>
  /** Consultant: every review about the signed-in consultant, newest first, any status. */
  myReviews(): Promise<ConsultantReview[]>
  /** The review's own consultant (or an admin) approves, rejects, or returns a review to pending. */
  setReviewStatus(reviewId: string, status: ReviewStatus): Promise<void>
  /** Customer: the booking form's situation answers, saved with the hold. Never readable by the customer. */
  saveAssessment(manageToken: string, assessment: StoredAssessment): Promise<void>
  /** Admin and the booking's consultant: answers keyed by booking id. */
  staffAssessments(): Promise<Record<string, StoredAssessment>>
  /** Sales: the caller's personal referral code (created on first use). */
  myReferralCode(): Promise<string>
  /** Customer: attach the sales person whose link they arrived with. Unknown or late codes are ignored (false). */
  setReferral(manageToken: string, code: string): Promise<boolean>
  /** Reception/admin: move a confirmed or checked-in booking to another consultant who is free at that time. */
  reassignConsultant(bookingId: string, consultantId: string, reason: string): Promise<Booking>
  /** Admin: the key that lets this device book admin-only (payment test) consultants. */
  adminTestKey(): Promise<string>
  /** Public: the admin's readiness rules (defaults filled in). */
  readinessRules(): Promise<ReadinessRules>
  /** Admin: save the readiness rules. */
  saveReadinessRules(rules: ReadinessRules): Promise<void>
  /** Customer: not ready for the program, so no payment; file it for the sales manager. */
  submitReadinessRequest(s: ReadinessSubmission): Promise<void>
  /** Sales manager or admin: clients who weren't ready, open ones first. */
  readinessRequests(): Promise<ReadinessRequest[]>
  /** Sales manager or admin: active salespeople to give a client to. */
  readinessSalesPeople(): Promise<SalesPerson[]>
  /** Sales manager or admin: give the client to a salesperson (null: nobody). */
  assignReadinessRequest(id: string, salesPersonId: string | null): Promise<void>
  /** Sales manager or admin: contacted / closed / open again. */
  setReadinessStatus(id: string, status: ReadinessStatus): Promise<void>
  /** Admin: show or hide a consultant on the home page (they can still be booked by direct link). */
  setConsultantListed(consultantId: string, listed: boolean): Promise<void>
  /** Admin: every review, newest first, hidden ones included. */
  staffReviews(): Promise<StaffReview[]>
  /** Admin: hide a review from the public profile, or restore it. */
  setReviewHidden(reviewId: string, hidden: boolean): Promise<void>
  /** Admin: open operational decisions, in display order. */
  staffDecisions(): Promise<PendingDecision[]>
  /** Admin: add a decision (no id) or edit one. */
  saveDecision(d: DecisionInput): Promise<void>
  /** Admin: the decision is settled, so it is deleted (the audit log keeps its wording). */
  resolveDecision(id: string): Promise<void>
  staffRecords(): Promise<Record<string, ConsultationRecord>>
  /** Consultant (own clients) or admin: what the client does next, and the program the consultant recommends. */
  saveNextStep(bookingId: string, nextStep: NextStep, program: ProgramId | null, refundReason?: string): Promise<void>
  /** Consultant (own) or admin: the "thinking" client has been followed up. */
  markFollowedUp(bookingId: string): Promise<void>
  /** Finance or admin: clients who will sign a contract or want a refund (no consultation notes). */
  financeNextSteps(): Promise<FinanceCase[]>
  /** Finance or admin: a contract/refund case has been dealt with. */
  markFinanceHandled(bookingId: string): Promise<void>
  /** Admin: give a consultant a day off (from = to) or several days off. */
  addDayOff(consultantId: string, from: string, to: string): Promise<void>
  /** Admin: take back a day off. */
  removeDayOff(consultantId: string, dayOffId: string): Promise<void>
  /** Admin: block (or unblock) one start time so nobody can book the consultant then. */
  setSlotBlocked(consultantId: string, startIso: string, blocked: boolean): Promise<void>
  /** Staff: the admin's wording for the WhatsApp messages (missing languages use the defaults). */
  messageTemplates(): Promise<MessageTemplates>
  /** Admin: change one message in one language; null goes back to the default wording. */
  saveMessageTemplate(key: MessageTemplateKey, lang: Lang, body: string | null): Promise<void>
  /** Admin: every consultant's free times for `days` days from `fromDate`. */
  freeSlots(fromDate: string, days: number): Promise<FreeSlot[]>
  saveRecord(bookingId: string, record: ConsultationRecord): Promise<void>
  staffAudit(): Promise<AuditEntry[]>
  staffSchedules(): Promise<Record<string, ScheduleRules>>
  saveSchedule(consultantId: string, patch: Partial<ScheduleRules>): Promise<void>
  subscribe(onChange: () => void): () => void
  /** Live transports report whether the realtime channel is up. Local mode has no channel and omits this. */
  onConnection?(fn: (state: 'connected' | 'reconnecting') => void): () => void
}
