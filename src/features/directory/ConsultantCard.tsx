import { Link, useNavigate } from 'react-router-dom'
import { useT } from '../../i18n'
import type { Consultant, Format } from '../../domain/types'
import { branchById } from '../../config/branches'
import { programName } from '../../config/programs'
import { formatInZone, dateInZone } from '../../domain/time'
import { useAppStore } from '../../store/useAppStore'
import { useAvailability, shortestDuration } from '../shared/availability'
import { Avatar } from '../../components/widgets'
import { ButtonLink } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { DataStatus } from '../../data/feedback'

export function experienceText(c: Consultant, lang: 'ar' | 'en') {
  const n = c.experienceLabel ? c.experienceLabel[lang] : String(c.experienceYears)
  return n
}

export function useStartBooking() {
  const navigate = useNavigate()
  const resetDraft = useAppStore(s => s.resetDraft)
  const updateDraft = useAppStore(s => s.updateDraft)
  return (consultantId: string, pick?: { format: Format; startIso: string; durationMin?: number }) => {
    resetDraft(consultantId)
    if (pick) updateDraft({ format: pick.format, durationMin: pick.durationMin ?? shortestDuration(pick.format), slotStartIso: pick.startIso, step: 2 })
    navigate(`/book/${consultantId}`)
  }
}

const MAX_SLOTS = 5

export function ConsultantCard({ consultant: c }: { consultant: Consultant }) {
  const { t, l, lang } = useT()
  const filters = useAppStore(s => s.filters)
  const branch = branchById(c.branchId)
  const av = useAvailability(c.id, filters.date, filters.format)
  const startBooking = useStartBooking()
  const nameId = `c-${c.id}`

  const time = (iso: string) => formatInZone(iso, branch.timeZone, lang, 'time')

  return (
    <article aria-labelledby={nameId} className="group relative grid gap-5 rounded-[1.5rem] bg-white p-4 shadow-[var(--shadow-card)] ring-1 ring-line/60 transition-shadow hover:shadow-[var(--shadow-lift)] sm:p-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-8">
      {/* Identity + numbers */}
      <div className="flex min-w-0 gap-4">
        <Avatar consultant={c} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 id={nameId} className="flex flex-wrap items-center gap-2 text-xl font-semibold leading-tight text-ink">
            <Link to={`/consultant/${c.id}`} className="hover:text-navy focus-visible:underline">{l(c.name)}</Link>
          </h3>
          <p className={`mt-1 text-sm ${c.title ? 'text-slate' : 'text-muted'}`}>
            {c.title ? l(c.title) : t('placeholder.title')}
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted">
            <Icon name="pin" size={14} className="text-gold-deep" />
            {l(branch.name)}, {l(branch.city)}
          </p>
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={t('profile.programs')}>
            {c.programs.map(p => (
              <li key={p} className="rounded-full bg-paper px-2.5 py-1 text-xs font-semibold text-slate ring-1 ring-line">{l(programName(p))}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Availability from the calendar */}
      <div className="flex min-w-0 flex-col rounded-2xl bg-paper p-4 ring-1 ring-line/70">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink">{t('common.availableAppointments')}</p>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            {av.formats.includes('online') && <Icon name="video" size={14} label={t('format.online')} />}
            {av.formats.includes('in-person') && <Icon name="building" size={14} label={t('format.in-person')} />}
          </span>
        </div>

        {av.loading || av.error ? <DataStatus loading={av.loading} error={av.error} /> : av.slots.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label={t('common.availableAppointments')}>
            {av.slots.slice(0, MAX_SLOTS).map(({ slot, format }) => (
              <li key={slot.startIso + format}>
                <button
                  type="button"
                  onClick={() => startBooking(c.id, { format, startIso: slot.startIso })}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-slate ring-1 ring-line transition-colors hover:bg-slate hover:text-white hover:ring-slate"
                  aria-label={`${t(`format.${format}`)} ${time(slot.startIso)}`}
                >
                  {filters.format === 'any' && <Icon name={format === 'online' ? 'video' : 'building'} size={14} className="opacity-60" />}
                  <span dir="ltr" className="tabular">{time(slot.startIso)}</span>
                </button>
              </li>
            ))}
            {av.slots.length > MAX_SLOTS && (
              <li>
                <Link to={`/consultant/${c.id}`} className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-navy hover:bg-white">
                  {t('common.more', { n: av.slots.length - MAX_SLOTS })}
                </Link>
              </li>
            )}
          </ul>
        ) : (
          <p className="text-sm text-muted">{av.formats.length ? t('common.noSlotsDate') : t('booking.formatUnavailable')}</p>
        )}

        {av.next && av.slots.length === 0 && (
          <div className="mt-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-line">
            <p className="text-xs text-muted">{t('common.nextAvailable')}</p>
            <button
              type="button"
              onClick={() => startBooking(c.id, { format: av.next!.format, startIso: av.next!.slot.startIso })}
              className="mt-0.5 text-start text-sm font-semibold text-navy hover:underline"
            >
              {formatInZone(av.next.slot.startIso, branch.timeZone, lang, 'full')}
            </button>
          </div>
        )}
        {av.next && av.slots.length > 0 && dateInZone(av.next.slot.startIso, branch.timeZone) === filters.date && (
          <p className="mt-3 text-xs text-muted">
            {t('common.nextAvailable')}: <span className="font-semibold text-slate">{formatInZone(av.next.slot.startIso, branch.timeZone, lang, 'full')}</span>
          </p>
        )}

        <div className="mt-auto flex gap-2 pt-4">
          <ButtonLink to={`/consultant/${c.id}`} variant="ghost" className="flex-1">{t('common.viewProfile')}</ButtonLink>
          <ButtonLink
            to={`/book/${c.id}`}
            variant="primary"
            className="flex-1"
            onClick={e => {
              e.preventDefault()
              startBooking(c.id)
            }}
          >
            {t('common.book')}
          </ButtonLink>
        </div>
      </div>
    </article>
  )
}
