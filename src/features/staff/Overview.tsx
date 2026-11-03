import { useStaffBookings } from '../../data/hooks'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { useAppStore, todayIn } from '../../store/useAppStore'
import { dateInZone } from '../../domain/time'
import { pendingDecisions } from '../../config/pendingDecisions'
import { can } from './permissions'
import { ScreenTitle } from './StaffApp'
import { ConsultantOverview } from './consultant/ConsultantOverview'

export function Overview() {
  const role = useAppStore(s => s.role)
  // Consultants get their own day view; the shared tiles are for the other roles.
  return role === 'consultant' ? <ConsultantOverview /> : <TeamOverview />
}

function TeamOverview() {
  const { t } = useT()
  const role = useAppStore(s => s.role)
  const bookings = Object.values(useStaffBookings())
  const today = todayIn('Africa/Cairo')
  const todays = bookings.filter(b => dateInZone(b.startIso, b.tz) === today && ['confirmed', 'checked-in', 'completed'].includes(b.status))
  const tiles = [
    { label: t('staff.overview.awaitingReview'), value: bookings.filter(b => ['on-hold', 'wrong-amount', 'duplicate', 'late-transfer'].includes(b.status)).length, to: 'payments' as const },
    { label: t('staff.overview.todayAppointments'), value: todays.length, to: 'arrivals' as const },
    { label: t('staff.overview.checkedIn'), value: todays.filter(b => b.status === 'checked-in').length, to: 'checkin' as const },
    { label: t('staff.overview.unresolved'), value: pendingDecisions.length, to: 'decisions' as const },
  ]
  return (
    <>
      <ScreenTitle title={t('staff.screens.overview')} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(tile => {
          const body = (
            <>
              <p dir="ltr" className="text-start font-display text-4xl font-semibold text-ink rtl:text-end">{tile.value}</p>
              <p className="mt-2 text-sm text-muted">{tile.label}</p>
            </>
          )
          const path = { payments: 'payments', arrivals: 'arrivals', checkin: 'checkin', decisions: 'decisions' }[tile.to]
          return can(role, tile.to) ? (
            <Link key={tile.label} to={`/staff/${path}`} className="rounded-2xl bg-white p-5 ring-1 ring-line transition-shadow hover:shadow-[var(--shadow-card)]">{body}</Link>
          ) : (
            <div key={tile.label} className="rounded-2xl bg-white p-5 ring-1 ring-line">{body}</div>
          )
        })}
      </div>
    </>
  )
}
