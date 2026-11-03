import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { isLive, uiStorageKey } from '../data/mode'
import type {
  AuditEntry, Booking, BranchId, Consultant, CustomerDetails, Format, Lang, PendingDecision, ProgramId, Review, StaffRole,
} from '../domain/types'
import { pendingDecisions } from '../config/pendingDecisions'
import type { ScheduleRules } from '../domain/availability'
import type { StoredAssessment } from '../assessment/questions'

export interface Filters {
  branch: BranchId | 'all'
  program: ProgramId | 'all'
  format: Format | 'any'
  date: string
}

export interface BookingDraft {
  consultantId: string | null
  step: 0 | 1 | 2 | 3 | 4
  format: Format | null
  durationMin: number | null
  slotStartIso: string | null
  details: CustomerDetails
  /** Situation answers for assessed programs; kept apart from details so they never reach the ticket. */
  assessment: StoredAssessment | null
  bookingId: string | null
}

export type Outcome = 'none' | 'pending' | 'approved' | 'refused' | 'withdrawn'
export interface ConsultationRecord { notes: string; outcome: Outcome }


export const todayIn = (tz: string, ms = Date.now()) =>
  new Date(ms).toLocaleDateString('en-CA', { timeZone: tz })

export const emptyDetails = (lang: Lang = 'ar'): CustomerDetails => ({
  name: '', phone: '', email: '', channel: 'whatsapp', consultationLang: lang, program: '', note: '',
})

export const emptyDraft = (): BookingDraft => ({
  consultantId: null, step: 0, format: null, durationMin: null, slotStartIso: null,
  details: emptyDetails(), assessment: null, bookingId: null,
})

export const defaultFilters = (): Filters => ({
  branch: 'all', program: 'all', format: 'any', date: todayIn('Africa/Cairo'),
})

/** Saved filters from an earlier visit: a date that has passed falls back to today, or the calendar opens on an empty past day. */
export const freshFilters = (saved?: Filters): Filters => {
  if (!saved) return defaultFilters()
  const today = todayIn('Africa/Cairo')
  return { ...saved, date: !saved.date || saved.date < today ? today : saved.date }
}

export const applyDocumentLang = (lang: Lang) => {
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
}

export interface AppState {
  lang: Lang
  setLang: (l: Lang) => void

  filters: Filters
  /** Branch picked on the welcome screen; null until the visitor chooses. */
  location: BranchId | null
  setLocation: (b: BranchId | null) => void
  setFilters: (p: Partial<Filters>) => void
  resetFilters: () => void

  draft: BookingDraft
  updateDraft: (p: Partial<BookingDraft>) => void
  updateDetails: (p: Partial<CustomerDetails>) => void
  resetDraft: (consultantId?: string | null) => void

  role: StaffRole
  setRole: (r: StaffRole) => void
  staffSession: { username: string; role: StaffRole; consultantId: string | null } | null
  /**
   * Live only: signed up (email or Google) but not approved by an admin yet. needsName: no request is filed until
   * they choose a username (taken: their pick was already in use).
   */
  staffPending: { email: string; name: string; needsName: boolean; taken: boolean } | null
  /** Name finance staff sign WhatsApp confirmations with. */
  senderName: string
  staffConsultantId: string
  setStaffConsultantId: (id: string) => void

  bookings: Record<string, Booking>
  audit: AuditEntry[]
  lastCustomerBookingId: string | null
  records: Record<string, ConsultationRecord>
  /** Prototype only: customer reviews keyed by booking id. */
  reviews: Record<string, Review & { consultantId: string; hidden?: boolean }>
  /** Prototype only: booking-form assessment answers keyed by booking id. */
  assessments: Record<string, StoredAssessment>
  /** Prototype only: the admin's open decisions. */
  decisions: PendingDecision[]
  consultantOverrides: Record<string, Partial<Consultant>>
  scheduleOverrides: Record<string, Partial<ScheduleRules>>
  kpiOverrides: Record<string, number>
  approvalMinSample: number | null
  seeded: boolean

  timeOffsetMs: number
  now: () => number
  addAudit: (e: Omit<AuditEntry, 'at'>) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      lang: 'ar',
      setLang: lang => {
        applyDocumentLang(lang)
        set({ lang })
      },

      filters: defaultFilters(),
      location: null,
      setLocation: location => set({ location }),
      setFilters: p => set(s => ({ filters: { ...s.filters, ...p } })),
      resetFilters: () => set({ filters: defaultFilters() }),

      draft: emptyDraft(),
      updateDraft: p => set(s => ({ draft: { ...s.draft, ...p } })),
      updateDetails: p => set(s => ({ draft: { ...s.draft, details: { ...s.draft.details, ...p } } })),
      resetDraft: (consultantId = null) =>
        set(s => ({ draft: { ...emptyDraft(), consultantId, details: { ...emptyDetails(s.lang), ...keepContact(s.draft.details) } } })),

      role: 'finance',
      setRole: role => set({ role }),
      staffSession: null,
      staffPending: null,
      senderName: '',
      staffConsultantId: 'mohamed-gamal',
      setStaffConsultantId: staffConsultantId => set({ staffConsultantId }),

      bookings: {},
      audit: [],
      lastCustomerBookingId: null,
      records: {},
      reviews: {},
      assessments: {},
      decisions: pendingDecisions,
      consultantOverrides: {},
      scheduleOverrides: {},
      kpiOverrides: {},
      approvalMinSample: null,
      seeded: false,

      timeOffsetMs: 0,
      now: () => Date.now() + get().timeOffsetMs,
      addAudit: e => set(s => ({ audit: [{ ...e, at: s.now() }, ...s.audit].slice(0, 500) })),
    }),
    {
      name: uiStorageKey,
      // localStorage so a booking link opens in any tab or window of the same browser.
      storage: createJSONStorage(() => localStorage),
      partialize: ({ setLang: _a, now: _b, ...rest }) => isLive
        ? { lang: rest.lang, filters: rest.filters, senderName: rest.senderName, location: rest.location }
        : rest,
      merge: (persisted, current) => {
        if (!isLive) { const saved = persisted as Partial<AppState> | undefined; return { ...current, ...saved, filters: freshFilters(saved?.filters) } }
        const saved = persisted as Partial<AppState> | undefined
        return { ...current, lang: saved?.lang === 'en' ? 'en' : 'ar', filters: saved?.filters ? freshFilters(saved.filters) : current.filters, senderName: saved?.senderName ?? '', location: saved?.location ?? null }
      },
      onRehydrateStorage: () => state => {
        if (state) applyDocumentLang(state.lang)
      },
    },
  ),
)

// Returning customers keep their contact details when starting another booking.
function keepContact(d: CustomerDetails): Partial<CustomerDetails> {
  return { name: d.name, phone: d.phone, email: d.email, channel: d.channel, consultationLang: d.consultationLang }
}
