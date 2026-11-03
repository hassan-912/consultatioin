import { Link } from 'react-router-dom'
import { useT } from '../../../i18n'
import { useStaffBookings, useStaffRecords } from '../../../data/hooks'
import { useAppStore, todayIn } from '../../../store/useAppStore'
import { getConsultant } from '../../../store/actions'
import { branchById } from '../../../config/branches'
import { programName } from '../../../config/programs'
import { addDays, dateInZone, formatDate, formatInZone } from '../../../domain/time'
import type { Booking } from '../../../domain/types'
import { StatusChip } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { AssessmentRing } from '../../../assessment/StaffAssessment'
import { ScreenTitle } from '../StaffApp'

const ACTIVE = ['confirmed', 'checked-in', 'completed']

/** A consultant's day at a glance: today's appointments as cards, each with the client's file score (staff only). */
export function ConsultantOverview() {
  const { t, l, lang } = useT()
  const id = useAppStore(s => s.staffConsultantId)
  const now = useAppStore(s => s.now)()
  const bookings = Object.values(useStaffBookings()).filter(b => b.consultantId === id)
  const records = useStaffRecords()
  const tz = branchById(getConsultant(id).branchId).timeZone
  const today = todayIn(tz)
  const weekEnd = addDays(today, 7)
  const todays = bookings.filter(b => dateInZone(b.startIso, b.tz) === today && ACTIVE.includes(b.status)).sort((a, b) => a.startIso.localeCompare(b.startIso))
  const nextId = todays.find(b => b.status !== 'completed' && Date.parse(b.endIso) > now)?.id
  const week = bookings.filter(b => { const d = dateInZone(b.startIso, b.tz); return d > today && d <= weekEnd && b.status === 'confirmed' })
    .sort((a, b) => a.startIso.localeCompare(b.startIso))
  const toSubmit = bookings.filter(b => ['completed', 'checked-in'].includes(b.status) && !(records[b.id]?.notes.trim() || (records[b.id]?.outcome ?? 'none') !== 'none')).length

  const tiles = [
    { label: t('staff.consultantHome.today'), value: todays.length, icon: 'calendar' as const },
    { label: t('staff.consultantHome.arrived'), value: todays.filter(b => b.status === 'checked-in').length, icon: 'check' as const },
    { label: t('staff.consultantHome.toSubmit'), value: toSubmit, icon: 'list' as const, to: '/staff/records' },
    { label: t('staff.consultantHome.week'), value: week.length, icon: 'clock' as const, to: '/staff/my-bookings' },
  ]

  return (
    <>
      <ScreenTitle title={t('staff.screens.overview')} />
      <p className="-mt-3 mb-5 text-sm text-muted">{formatDate(today, lang, 'date')}</p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(tile => {
          const body = (
            <>
              <span className="grid size-9 place-items-center rounded-xl bg-paper text-slate"><Icon name={tile.icon} size={18} /></span>
              <p dir="ltr" className="mt-3 text-start font-display text-3xl font-semibold text-ink rtl:text-end">{tile.value}</p>
              <p className="mt-1 text-sm text-muted">{tile.label}</p>
            </>
          )
          return tile.to
            ? <Link key={tile.label} to={tile.to} className="rounded-2xl bg-white p-4 ring-1 ring-line transition-shadow hover:shadow-[var(--shadow-card)]">{body}</Link>
            : <div key={tile.label} className="rounded-2xl bg-white p-4 ring-1 ring-line">{body}</div>
        })}
      </div>

      <section aria-labelledby="today-title" className="mt-8">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 id="today-title" className="text-lg font-semibold text-ink">{t('staff.consultantHome.todayTitle')}</h2>
          <p className="text-xs text-muted">{t('staff.consultantHome.ringHint')}</p>
        </div>
        {todays.length ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {todays.map(b => <AppointmentCard key={b.id} b={b} next={b.id === nextId} />)}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-mist bg-white px-4 py-10 text-center text-sm text-muted">{t('staff.consultantHome.noneToday')}</p>
        )}
      </section>

      {week.length > 0 && (
        <section aria-labelledby="week-title" className="mt-8">
          <h2 id="week-title" className="mb-3 text-lg font-semibold text-ink">{t('staff.consultantHome.weekTitle')}</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-white ring-1 ring-line">
            {week.map(b => (
              <li key={b.id} className="relative flex items-center gap-4 px-4 py-3 hover:bg-paper">
                <div className="w-28 shrink-0 text-sm">
                  <p className="font-semibold text-ink">{formatDate(dateInZone(b.startIso, b.tz), lang, 'short')}</p>
                  <p dir="ltr" className="text-start text-muted rtl:text-end">{formatInZone(b.startIso, b.tz, lang, 'time')}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <Link to={`/staff/client/${b.id}`} dir="auto" className="block truncate font-semibold text-ink after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-4 focus-visible:after:ring-gold/40">{b.customer.name}</Link>
                  <p className="truncate text-xs text-muted">{b.customer.program ? l(programName(b.customer.program)) : '—'} · {t(`format.${b.format}`)}</p>
                </div>
                <span className="relative z-10"><AssessmentRing bookingId={b.id} size={48} /></span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function AppointmentCard({ b, next }: { b: Booking; next: boolean }) {
  const { t, l, lang } = useT()
  return (
    <li className={`relative flex gap-4 rounded-2xl bg-white p-4 ring-1 transition-shadow hover:shadow-[var(--shadow-card)] ${next ? 'ring-2 ring-gold' : 'ring-line'}`}>
      {next && <span className="absolute -top-2.5 start-4 rounded-full bg-gold px-2 py-0.5 text-[11px] font-bold text-ink">{t('staff.consultantHome.next')}</span>}
      <div className="w-16 shrink-0 border-e border-line pe-3 text-center">
        <p dir="ltr" className="font-display text-xl font-semibold leading-tight text-ink">{formatInZone(b.startIso, b.tz, lang, 'time')}</p>
        <Icon name={b.format === 'online' ? 'video' : 'building'} size={16} className="mx-auto mt-1.5 text-muted" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><StatusChip status={b.status} /></div>
        <Link to={`/staff/client/${b.id}`} dir="auto" className="mt-1.5 block truncate text-base font-semibold text-ink after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-4 focus-visible:after:ring-gold/40">{b.customer.name}</Link>
        <p dir="ltr" className="text-start text-sm text-muted rtl:text-end">{b.customer.phone}</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {b.customer.program && <span className="rounded-full bg-paper px-2 py-0.5 font-semibold text-slate ring-1 ring-line">{l(programName(b.customer.program))}</span>}
          <span className="rounded-full bg-paper px-2 py-0.5 font-semibold text-slate ring-1 ring-line">{b.customer.consultationLang === 'ar' ? 'العربية' : 'English'}</span>
          {b.salesName && <span className="rounded-full bg-gold-soft px-2 py-0.5 font-semibold text-gold-deep">{t('sales.soldBy', { name: b.salesName })}</span>}
        </div>
        {b.customer.note && <p dir="auto" className="mt-2 line-clamp-2 text-sm text-slate">{b.customer.note}</p>}
      </div>
      <div className="relative z-10 flex flex-col items-center justify-between gap-2">
        <AssessmentRing bookingId={b.id} size={68} />
        <span aria-hidden className="inline-flex items-center gap-1 text-xs font-semibold text-navy">{t('staff.client.open')}<Icon name="arrow" size={12} className="rtl:rotate-180" /></span>
      </div>
    </li>
  )
}
