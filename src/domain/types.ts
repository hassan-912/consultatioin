export type Lang = 'ar' | 'en'
export type L10n = Record<Lang, string>

export type BranchId = 'nasr-city' | 'sheikh-zayed' | 'dubai'
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

export type PaymentMethodId = 'instapay' | 'vodafone-cash'

export interface PaymentMethod {
  id: PaymentMethodId
  label: L10n
  recipient: string
  detail: string
  detailLabel: L10n
  link?: string
  placeholder: true
}

export interface PaymentConfig {
  methods: PaymentMethod[]
  instructions: L10n[]
}

export interface KpiConfig {
  scale: 10
  approvalMinSample: number
  reportingPeriod: L10n
  attributionRule: L10n
}

export interface PendingDecision {
  id: string
  area: L10n
  question: L10n
  owner: L10n | null
}

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
  createdAt: number
  demo?: boolean
}

export type StaffRole = 'admin' | 'consultant' | 'finance' | 'reception'
export type Actor = StaffRole | 'customer' | 'system'

export interface AuditEntry {
  at: number
  actor: Actor
  bookingRef?: string
  action: string
  from?: string
  to?: string
}
