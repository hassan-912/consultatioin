import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useT } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { Logo } from '../../components/Logo'
import { LangSwitch } from '../../components/LangSwitch'
import { BottomSheet } from '../../components/widgets'
import { Icon } from '../../components/Icon'
import { can, screens, type StaffScreen } from './permissions'
import { Overview } from './Overview'
import { StaffLogin } from './StaffLogin'
import { StaffReset } from './StaffReset'
import { StaffOAuthReturn, StaffPending } from './StaffSignup'
import { signOut } from '../../store/auth'
import { restoreStaffSession, watchStaffAuth } from '../../store/liveAuth'
import { PaymentQueue } from './finance/PaymentQueue'
import { ConnectionIndicator, NewPaymentNotice, PaymentBadge } from './finance/paymentAlerts'
import { CheckIn } from './reception/CheckIn'
import { Arrivals } from './reception/Arrivals'
import { CustomerSheet } from './reception/CustomerSheet'
import { MyCalendar, MyBookings, Records } from './consultant/ConsultantDesk'
import { ClientFile } from './consultant/ClientFile'
import { ConsultantsAdmin } from './admin/ConsultantsAdmin'
import { FreeSlotsAdmin } from './admin/FreeSlotsAdmin'
import { NextStepsFinance } from './finance/NextStepsFinance'
import { History } from './consultant/History'
import { AvailabilityAdmin } from './admin/AvailabilityAdmin'
import { BookingsAdmin } from './admin/BookingsAdmin'
import { PaymentsAdmin, KpiAdmin } from './admin/SettingsAdmin'
import { AuditLog } from './admin/AuditLog'
import { ReviewsAdmin } from './admin/ReviewsAdmin'
import { PendingDecisions } from './admin/PendingDecisions'
import { StaffAccounts } from './admin/StaffAccounts'
import { SalesLink, MyClients } from './sales/Sales'
import { useStaffHydration, staffSessionKey } from '../../data/hooks'
import { useLiveData } from '../../data/liveState'
import { isLive } from '../../data/mode'
import { DataStatus } from '../../data/feedback'

const views: Record<StaffScreen, () => ReactNode> = {
  overview: () => <Overview />,
  salesLink: () => <SalesLink />,
  myClients: () => <MyClients />,
  payments: () => <PaymentQueue />,
  nextSteps: () => <NextStepsFinance />,
  checkin: () => <CheckIn />,
  arrivals: () => <Arrivals />,
  customers: () => <CustomerSheet />,
  myCalendar: () => <MyCalendar />,
  myBookings: () => <MyBookings />,
  history: () => <History />,
  records: () => <Records />,
  bookings: () => <BookingsAdmin />,
  consultants: () => <ConsultantsAdmin />,
  availability: () => <AvailabilityAdmin />,
  freeSlots: () => <FreeSlotsAdmin />,
  paymentSettings: () => <PaymentsAdmin />,
  kpi: () => <KpiAdmin />,
  reviews: () => <ReviewsAdmin />,
  audit: () => <AuditLog />,
  decisions: () => <PendingDecisions />,
  staffAccounts: () => <StaffAccounts />,
}

function SessionCard({ dark = true }: { dark?: boolean }) {
  const { t } = useT()
  const session = useAppStore(s => s.staffSession)!
  return (
    <div className={`rounded-xl p-3 ${dark ? 'bg-white/5 ring-1 ring-white/10' : 'bg-paper'}`}>
      <p className={`text-xs ${dark ? 'text-mist' : 'text-muted'}`}>{t('staff.login.signedInAs', { name: '' }).trim()}</p>
      <p dir="auto" className={`truncate text-start font-semibold ${dark ? 'text-white' : 'text-ink'}`}>{session.username}</p>
      <p className={`text-xs ${dark ? 'text-gold' : 'text-gold-deep'}`}>{t(`staff.roles.${session.role}`)}</p>
      <button
        type="button"
        onClick={signOut}
        className={`mt-2 inline-flex min-h-10 items-center gap-2 text-sm font-semibold ${dark ? 'text-mist hover:text-white' : 'text-slate hover:text-ink'}`}
      >
        <Icon name="x" size={15} />
        {t('staff.login.signOut')}
      </button>
    </div>
  )
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useT()
  const role = useAppStore(s => s.role)
  return (
    <nav aria-label={t('staff.title')} className="grid gap-0.5">
      {screens.filter(s => can(role, s.id)).map(s => (
        <NavLink
          key={s.id}
          to={`/staff/${s.path}`}
          end={s.path === ''}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${isActive ? 'bg-white text-ink' : 'text-mist hover:bg-white/10 hover:text-white'}`
          }
        >
          <Icon name={s.icon} size={17} />
          {t(`staff.screens.${s.id}`)}
          {s.id === 'payments' && <PaymentBadge />}
        </NavLink>
      ))}
    </nav>
  )
}

export function StaffApp() {
  const { t } = useT()
  const role = useAppStore(s => s.role)
  const session = useAppStore(s => s.staffSession)
  const pending = useAppStore(s => s.staffPending)
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const [restoring, setRestoring] = useState(isLive)
  useEffect(() => {
    if (!isLive) return
    const stop = watchStaffAuth()
    let active = true
    void restoreStaffSession().finally(() => { if (active) setRestoring(false) })
    return () => { active = false; stop() }
  }, [])
  useStaffHydration()
  const loading = useLiveData(s => s.loading)
  const error = useLiveData(s => s.error)
  const snapshotKey = useLiveData(s => s.staffKey)
  const staleSnapshot = isLive && snapshotKey !== staffSessionKey(session)
  if (isLive && pathname.replace(/\/$/, '') === '/staff/reset') return <StaffReset />
  if (isLive && pathname.replace(/\/$/, '') === '/staff/oauth') return <StaffOAuthReturn />
  if (isLive && !session && pending) return <StaffPending />
  if (!session) return restoring ? <p role="status" className="grid min-h-dvh place-items-center bg-slate-deep text-mist">{t('staff.login.restoring')}</p> : <StaffLogin />

  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto bg-slate-deep p-5 lg:flex">
        <Link to="/" aria-label={t('nav.home')}><Logo className="h-9" /></Link>
        <SessionCard />
        <Nav />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-white/95 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setOpen(true)} className="inline-flex size-11 items-center justify-center rounded-xl ring-1 ring-line lg:hidden" aria-label={t('nav.menu')}>
              <Icon name="menu" />
            </button>
            <div>
              <p className="text-xs text-muted">{t('staff.title')}</p>
              <p className="text-sm font-semibold text-ink">{t(`staff.roles.${role}`)}</p>
            </div>
          </div>
          <LangSwitch tone="light" />
        </header>

        <main id="main" className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
          <ConnectionIndicator />
          <NewPaymentNotice />
          {isLive && <DataStatus loading={loading || staleSnapshot} error={error} />}
          {(!isLive || (!loading && !error && !staleSnapshot)) &&
          <Routes>
            {screens.map(s => {
              // A role without the overview (sales) lands on its first screen instead of looping back to /staff.
              const home = screens.find(x => can(role, x.id))!
              const fallback = home.path ? `/staff/${home.path}` : '/staff'
              const element = can(role, s.id) ? <>{views[s.id]()}</> : <Navigate to={fallback} replace />
              return s.path ? <Route key={s.id} path={s.path} element={element} /> : <Route key={s.id} index element={element} />
            })}
            {/* A client's full file, opened from the consultant's overview cards. */}
            <Route path="client/:id" element={can(role, 'records') ? <ClientFile /> : <Navigate to="/staff" replace />} />
            <Route path="*" element={<Navigate to="/staff" replace />} />
          </Routes>
          }
        </main>
      </div>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={t('staff.title')}>
        <div className="grid gap-4 rounded-2xl bg-slate-deep p-4 pb-5">
          <SessionCard />
          <Nav onNavigate={() => setOpen(false)} />
        </div>
      </BottomSheet>
    </div>
  )
}

export function ScreenTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      {children}
    </div>
  )
}
