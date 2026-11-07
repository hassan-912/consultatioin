import { useT } from '../../i18n'
import { bookingConfig } from '../../config/booking'
import type { Branch, Consultant, CustomerDetails, Format } from '../../domain/types'
import { validateEmail, validatePhone } from '../../domain/phone'
import { formatInZone, localEquivalent, tzOffsetMinutes, viewerTimeZone, zoneLabel } from '../../domain/time'
import { formatMoney, priceFor } from '../../domain/pricing'
import { Avatar } from '../../components/widgets'
import { Icon } from '../../components/Icon'
import { Ltr } from '../../components/ui'
import type { TKey } from '../../i18n'

export type DetailErrors = Partial<Record<'name' | 'phone' | 'email' | 'program' | 'note', TKey>>

export function validateDetails(d: CustomerDetails): DetailErrors {
  const e: DetailErrors = {}
  if (d.name.trim().length < 3) e.name = 'validation.name'
  if (!validatePhone(d.phone)) e.phone = 'validation.phone'
  if (!validateEmail(d.email)) e.email = 'validation.email'
  if (!d.program) e.program = 'validation.program'
  if (d.note.length > 300) e.note = 'validation.note'
  return e
}

/** Appointment time in the branch zone, plus the viewer's local equivalent when it differs. */
export function TimeWithZone({ iso, tz, showLocal }: { iso: string; tz: string; showLocal: boolean }) {
  const { t, lang } = useT()
  const viewer = viewerTimeZone()
  const differs = tzOffsetMinutes(viewer, Date.parse(iso)) !== tzOffsetMinutes(tz, Date.parse(iso))
  const local = localEquivalent(iso, tz, viewer, lang)
  return (
    <div>
      <p className="font-semibold text-ink">{formatInZone(iso, tz, lang, 'full')}</p>
      <p className="text-xs text-muted">{zoneLabel(tz, lang, Date.parse(iso))}</p>
      {showLocal && differs && (
        <p className="mt-1 text-xs font-semibold text-navy">
          {t('common.yourTime')}: {local.text} <span className="font-normal text-muted">({viewer}{local.differentDay ? ` · ${t('common.differentDay')}` : ''})</span>
        </p>
      )}
    </div>
  )
}

export function MapCard({ branch }: { branch: Branch }) {
  const { t, l } = useT()
  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-line">
      <div className="relative h-36 bg-[#E9EEF2]" aria-hidden>
        <svg className="absolute inset-0 size-full" viewBox="0 0 400 144" preserveAspectRatio="xMidYMid slice">
          <rect width="400" height="144" fill="#E9EEF2" />
          <path d="M0 96 L400 70" stroke="#fff" strokeWidth="14" />
          <path d="M140 0 L170 144" stroke="#fff" strokeWidth="10" />
          <path d="M0 30 L400 44" stroke="#fff" strokeWidth="6" />
          <path d="M290 0 L270 144" stroke="#fff" strokeWidth="6" />
          <rect x="190" y="12" width="60" height="22" rx="4" fill="#DCE5DC" />
          <rect x="20" y="108" width="90" height="30" rx="4" fill="#DCE5DC" />
        </svg>
        <div className="absolute start-1/2 top-1/2 -translate-x-1/2 -translate-y-full rtl:translate-x-1/2">
          <span className="flex size-10 items-center justify-center rounded-full bg-slate text-gold shadow-lg ring-4 ring-white">
            <Icon name="building" size={18} />
          </span>
        </div>
      </div>
      <div className="bg-white p-4">
        <p className="font-semibold text-ink">{l(branch.name)} — {l(branch.city)}</p>
        <p className="mt-1 text-sm leading-relaxed text-slate">{l(branch.address)}</p>
        <a href={branch.mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-navy hover:underline">
          <Icon name="pin" size={15} />
          {t('common.openMaps')}
        </a>
      </div>
    </div>
  )
}

export function SummaryCard({ consultant, branch, format, durationMin, slotStartIso }: {
  consultant: Consultant; branch: Branch; format: Format | null; durationMin: number | null; slotStartIso: string | null
}) {
  const { t, l, lang } = useT()
  const price = format && durationMin ? priceFor(format, durationMin, consultant.id) : null
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-start justify-between gap-3 py-2.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="text-end font-semibold text-ink">{value}</dd>
    </div>
  )
  return (
    <div className="rounded-3xl bg-white p-5 ring-1 ring-line">
      <p className="mb-4 text-sm font-semibold text-muted">{t('booking.summary')}</p>
      <div className="flex items-center gap-3">
        <Avatar consultant={consultant} size="sm" />
        <div className="min-w-0">
          <p className="font-semibold text-ink">{l(consultant.name)}</p>
          <p className="text-sm text-muted">{l(branch.name)}</p>
        </div>
      </div>
      <dl className="mt-4 divide-y divide-line border-t border-line">
        {row(t('common.format'), format ? t(`format.${format}`) : '—')}
        {row(t('common.date'), slotStartIso ? formatInZone(slotStartIso, branch.timeZone, lang, 'date') : '—')}
        {row(t('common.time'), slotStartIso ? <Ltr>{formatInZone(slotStartIso, branch.timeZone, lang, 'time')}</Ltr> : '—')}
        {row(t('common.duration'), durationMin ? t('common.durationRange', bookingConfig.durationRange) : '—')}
      </dl>
      <div className="mt-2 flex items-center justify-between border-t border-line pt-4">
        <span className="font-semibold text-ink">{t('booking.total')}</span>
        <span className="font-display text-2xl font-semibold text-ink"><Ltr>{price ? formatMoney(price, lang) : '—'}</Ltr></span>
      </div>
    </div>
  )
}
