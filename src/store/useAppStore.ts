import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type {
  AuditEntry, Booking, BranchId, Consultant, CustomerDetails, Format, Lang, ProgramId, StaffRole,
} from '../domain/types'
import type { ScheduleRules } from '../domain/availability'

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
  details: emptyDetails(), bookingId: null,
})

export const defaultFilters = (): Filters => ({
  branch: 'all', program: 'all', format: 'any', date: todayIn('Africa/Cairo'),
})

export const applyDocumentLang = (lang: Lang) => {
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
}

export interface AppState {
  lang: Lang
  setLang: (l: Lang) => void

  filters: Filters
  setFilters: (p: Partial<Filters>) => void
  resetFilters: () => void

  draft: BookingDraft
  updateDraft: (p: Partial<BookingDraft>) => void
  updateDetails: (p: Partial<CustomerDetails>) => void
  resetDraft: (consultantId?: string | null) => void

  role: StaffRole
  setRole: (r: StaffRole) => void
  staffConsultantId: string
  setStaffConsultantId: (id: string) => void

  bookings: Record<string, Booking>
  audit: AuditEntry[]
  lastCustomerBookingId: string | null
  records: Record<string, ConsultationRecord>
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
      setFilters: p => set(s => ({ filters: { ...s.filters, ...p } })),
      resetFilters: () => set({ filters: defaultFilters() }),

      draft: emptyDraft(),
      updateDraft: p => set(s => ({ draft: { ...s.draft, ...p } })),
      updateDetails: p => set(s => ({ draft: { ...s.draft, details: { ...s.draft.details, ...p } } })),
      resetDraft: (consultantId = null) =>
        set(s => ({ draft: { ...emptyDraft(), consultantId, details: { ...emptyDetails(s.lang), ...keepContact(s.draft.details) } } })),

      role: 'finance',
      setRole: role => set({ role }),
      staffConsultantId: 'mohamed-gamal',
      setStaffConsultantId: staffConsultantId => set({ staffConsultantId }),

      bookings: {},
      audit: [],
      lastCustomerBookingId: null,
      records: {},
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
      name: 'mg-proto-v1',
      storage: createJSONStorage(() => sessionStorage),
      partialize: ({ setLang: _a, now: _b, ...rest }) => rest,
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
