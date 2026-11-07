export type Lang = 'ar' | 'en'
export type L10n = Record<Lang, string>

export type BranchId = 'nasr-city' | 'sheikh-zayed' | 'dubai' | 'qena'
export type Format = 'online' | 'in-person'
export type ProgramId = 'investment' | 'job-seeking' | 'education' | 'tourism' | 'immigration'
export type TimeZone = 'Africa/Cairo' | 'Asia/Dubai'

export interface Branch {
  id: BranchId
  name: L10n
  city: L10n
  address: L10n
  timeZone: TimeZone
  mapsUrl: string
  country: 'EG' | 'AE'
  /** Opening soon: no address or consultants published yet. */
  comingSoon?: boolean
}

export interface Consultant {
  id: string
  name: L10n
  title: L10n | null
  branchId: BranchId
  experienceYears: number
  experienceLabel?: L10n
  photo: string | null
  bio: L10n | null
  videoUrl: string | null
  programs: ProgramId[]
  languages: L10n[] | null
  qualifications: L10n[] | null
  nameNeedsConfirmation?: boolean
  /** program assignments are demo data until the company supplies real ones */
  demoPrograms: boolean
  /** Not listed for customers (reachable only by link), e.g. the payment test consultant. */
  hidden?: boolean
  /** Price in EGP when it differs from the standard one (set on the server too: consultant_branches.price_amount). */
  price?: number
}

export interface BookingConfig {
  /** Length each appointment reserves on the calendar (the top of the range). */
  durations: Record<Format, number[]>
  /** What customers are told: a consultation lasts between min and max minutes; not selectable. */
  durationRange: { min: number; max: number }
  bufferMin: number
  holdMinutes: number
  prices: Record<Format, Record<number, number>>
  currency: 'EGP'
  autoConfirm: false
  slotStepMin: 15
}

/** `easykash` is the only checkout method; the others remain for bookings paid before it. */
export type PaymentMethodId = 'easykash' | 'instapay' | 'vodafone-cash' | 'bank-aed' | 'bank-usd-eur'

/** Currencies a customer can pay in online. Prices are set in EGP; the others use the day's rate. */
export type PayCurrency = 'EGP' | 'USD' | 'EUR' | 'AED'

export interface KpiConfig {
  scale: 10
  approvalMinSample: number
  reportingPeriod: L10n
  attributionRule: L10n
}

/** An open operational question the admin tracks; resolving one deletes it. Either language may be blank. */
export interface PendingDecision {
  id: string
  area: L10n
  question: L10n
  /** Who is responsible for settling it; blank when unassigned. */
  owner: string
}
export type DecisionInput = Omit<PendingDecision, 'id'> & { id?: string }

export type BookingStatus =
  | 'reserved'
  | 'on-hold'
  | 'confirmed'
  | 'checked-in'
  | 'completed'
  | 'no-show'
  | 'expired'
  | 'rejected'
  | 'wrong-amount'
  | 'duplicate'
  | 'late-transfer'
  | 'cancelled'

export type Channel = 'email' | 'whatsapp'

export interface CustomerDetails {
  name: string
  phone: string
  email: string
  channel: Channel
  consultationLang: Lang
  program: ProgramId | ''
  note: string
}

export interface PaymentSubmission {
  method: PaymentMethodId
  txnRef: string
  receiptName?: string
  /** Compressed image of the uploaded receipt (data URL), when the upload was an image. */
  receiptImage?: string
  receiptPath?: string
  hasReceipt?: boolean
  submittedAt: number
}

export interface Booking {
  id: string
  reference: string
  qrToken: string
  manageToken: string
  consultantId: string
  branchId: BranchId
  format: Format
  durationMin: number
  startIso: string
  endIso: string
  tz: TimeZone
  price: { amount: number; currency: 'EGP' }
  customer: CustomerDetails
  status: BookingStatus
  holdExpiresAt: number
  payment?: PaymentSubmission
  rejectReason?: string
  checkedInAt?: number
  meetingUrl?: string
  ticketSentVia?: Channel
  ticketSentAt?: number
  /** Sales person whose link the customer booked through. */
  salesName?: string
  /** Prototype only: the referral code the booking came in with. */
  salesCode?: string
  /** Set when reception moved the client to another consultant: who they were booked with, and why. */
  swappedFrom?: string
  swapReason?: string
  createdAt: number
  demo?: boolean
}

/** A customer's rating of a completed consultation; only the first name is shown publicly. */
export interface Review {
  rating: number
  comment: string
  name: string
  at: number
}

/** Admin view of a review: includes hidden ones and which booking it came from. */
export interface StaffReview extends Review {
  id: string
  consultantId: string
  bookingRef?: string
  hidden: boolean
}

export interface ConsultantReviews {
  average: number | null
  count: number
  reviews: Review[]
}

export type StaffRole = 'admin' | 'consultant' | 'finance' | 'reception' | 'sales'
export type Actor = StaffRole | 'customer' | 'system'

export interface AuditEntry {
  at: number
  actor: Actor
  bookingRef?: string
  action: string
  from?: string
  to?: string
  /** Free-text reason, e.g. why reception changed the consultant. */
  note?: string
}
