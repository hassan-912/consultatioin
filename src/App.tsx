import { lazy, Suspense, useEffect } from 'react'
import { MotionConfig } from 'framer-motion'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { applyDocumentLang, useAppStore } from './store/useAppStore'
import { expireDue, seedIfNeeded } from './store/actions'
import { DirectoryPage } from './features/directory/DirectoryPage'
import { CountryBackdrop } from './components/CountryBackdrop'
import { isLive, uiStorageKey } from './data/mode'
import { configurationError } from './data'
import { ActionFeedback, DataStatus } from './data/feedback'
import { RepoError } from './data/types'

// Only the directory loads up front; every other screen (the whole staff app above all) downloads when opened.
const ProfilePage = lazy(() => import('./features/profile/ProfilePage').then(m => ({ default: m.ProfilePage })))
const BookingWizard = lazy(() => import('./features/booking/BookingWizard').then(m => ({ default: m.BookingWizard })))
const TicketPage = lazy(() => import('./features/ticket/TicketPage').then(m => ({ default: m.TicketPage })))
const BookingPage = lazy(() => import('./features/ticket/BookingPage').then(m => ({ default: m.BookingPage })))
const FindBookingPage = lazy(() => import('./features/ticket/FindBookingPage').then(m => ({ default: m.FindBookingPage })))
const MeetPage = lazy(() => import('./features/ticket/MeetPage').then(m => ({ default: m.MeetPage })))
const StaffApp = lazy(() => import('./features/staff/StaffApp').then(m => ({ default: m.StaffApp })))
const DemoPanel = lazy(() => import('./features/demo/DemoPanel').then(m => ({ default: m.DemoPanel })))
const PayReturnPage = lazy(() => import('./features/booking/PayReturnPage').then(m => ({ default: m.PayReturnPage })))
const DemoPayPage = lazy(() => import('./features/booking/DemoPayPage').then(m => ({ default: m.DemoPayPage })))
const TeamPage = lazy(() => import('./features/team/TeamPage').then(m => ({ default: m.TeamPage })))

export default function App() {
  const lang = useAppStore(s => s.lang)
  const location = useAppStore(s => s.location)
  const { pathname } = useLocation()

  useEffect(() => {
    applyDocumentLang(lang)
  }, [lang])
  // Keep open tabs in step: a booking made or verified in one tab appears in the others.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === uiStorageKey) useAppStore.persist.rehydrate()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  useEffect(() => {
    if (isLive) return
    seedIfNeeded()
    expireDue()
    const id = setInterval(expireDue, 5000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <MotionConfig reducedMotion="user">
      <CountryBackdrop />
      {configurationError ? <main className="mx-auto max-w-xl px-4 py-16"><DataStatus error={new RepoError(configurationError)} /></main> : <>
      <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<DirectoryPage />} />
        <Route path="/consultant/:id" element={location ? <ProfilePage /> : <Navigate to="/" replace />} />
        <Route path="/book/:id" element={<BookingWizard />} />
        <Route path="/ticket/:token" element={<TicketPage />} />
        <Route path="/booking/:token" element={<BookingPage />} />
        <Route path="/find" element={<FindBookingPage />} />
        <Route path="/pay/return" element={<PayReturnPage />} />
        {!isLive && <Route path="/pay/demo" element={<DemoPayPage />} />}
        <Route path="/meet/:token" element={<MeetPage />} />
        <Route path="/team" element={location ? <TeamPage /> : <Navigate to="/" replace />} />
        <Route path="/staff/*" element={<StaffApp />} />
        <Route path="*" element={<DirectoryPage />} />
      </Routes>
      {!isLive && <DemoPanel />}
      </Suspense>
      <ActionFeedback />
      </>}
    </MotionConfig>
  )
}
