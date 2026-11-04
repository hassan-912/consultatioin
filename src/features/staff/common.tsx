import type { ReactNode } from 'react'
import { bookingConfig } from '../../config/booking'
import { useT } from '../../i18n'
import type { Booking } from '../../domain/types'
import { getConsultant } from '../../store/actions'
import { branchById } from '../../config/branches'
import { formatInZone } from '../../domain/time'
import { formatMoney } from '../../domain/pricing'
import { Ltr, StatusChip } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { StaffAssessment } from '../../assessment/StaffAssessment'
import { programName } from '../../config/programs'

export function BookingMeta({ b, showStatus = true, showAssessment = true }: { b: Booking; showStatus?: boolean; showAssessment?: boolean }) {
  const { t, l, lang } = useT()
  const c = getConsultant(b.consultantId)
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <Ltr className="font-display text-base font-semibold tracking-wider text-ink">{b.reference}</Ltr>
        {showStatus && <StatusChip status={b.status} />}
        {b.demo && <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-semibold text-gold-deep">{t('common.demo')}</span>}
      </div>
      <p className="mt-1 text-sm font-semibold text-slate">{b.customer.name} — <Ltr>{b.customer.phone}</Ltr></p>
      {b.customer.email && <p className="mt-0.5 text-sm text-muted"><Ltr>{b.customer.email}</Ltr></p>}
      <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-slate">
        {b.customer.program && <span><span className="text-muted">{t('booking.program')}:</span> <span className="font-semibold">{l(programName(b.customer.program))}</span></span>}
        <span><span className="text-muted">{t('staff.booking.language')}:</span> <span className="font-semibold">{b.customer.consultationLang === 'ar' ? 'العربية' : 'English'}</span></span>
      </p>
      {b.customer.note && <p dir="auto" className="mt-1 rounded-lg bg-paper px-2.5 py-1.5 text-sm text-slate"><span className="text-muted">{t('staff.booking.customerNote')}:</span> {b.customer.note}</p>}
      <SwapNote b={b} className="mt-1" />
      {b.salesName && <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-slate"><Icon name="user" size={14} className="text-gold-deep" />{t('sales.soldBy', { name: b.salesName })}</p>}
      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted">
        <span className="inline-flex items-center gap-1"><Icon name={b.format === 'online' ? 'video' : 'building'} size={14} />{l(c.name)}, {l(branchById(b.branchId).name)}</span>
        <span>{formatInZone(b.startIso, b.tz, lang, 'full')}</span>
        <span>{t('common.durationRange', bookingConfig.durationRange)}</span>
        <span className="font-semibold text-ink"><Ltr>{formatMoney(b.price, lang)}</Ltr></span>
      </p>
      {showAssessment && <StaffAssessment bookingId={b.id} />}
    </div>
  )
}

/** Why reception moved the client to another consultant, shown to every role that sees the booking. */
export function SwapNote({ b, className = '' }: { b: Booking; className?: string }) {
  const { t, l } = useT()
  if (!b.swapReason) return null
  return (
    <p dir="auto" className={`rounded-lg bg-gold-soft px-2.5 py-1.5 text-sm text-ink ${className}`}>
      <span className="font-semibold">{t('staff.reception.swap.movedFrom', { name: b.swappedFrom ? l(getConsultant(b.swappedFrom).name) : '—' })}</span> {b.swapReason}
    </p>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-mist bg-white px-4 py-10 text-center text-sm text-muted">{children}</p>
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: string; count?: number }[] }) {
  return (
    <div role="tablist" className="mb-5 inline-flex rounded-2xl bg-white p-1 ring-1 ring-line">
      {tabs.map(tab => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold ${value === tab.id ? 'bg-slate text-white' : 'text-slate hover:bg-paper'}`}
        >
          {tab.label}
          {tab.count !== undefined && <span className={`rounded-full px-1.5 text-xs ${value === tab.id ? 'bg-white/20' : 'bg-paper'}`}>{tab.count}</span>}
        </button>
      ))}
    </div>
  )
}
