import { useEffect } from 'react'
import { MotionConfig } from 'framer-motion'
import { Route, Routes, useLocation } from 'react-router-dom'
import { applyDocumentLang, useAppStore } from './store/useAppStore'
import { expireDue, seedIfNeeded } from './store/actions'
import { DirectoryPage } from './features/directory/DirectoryPage'
import { ProfilePage } from './features/profile/ProfilePage'
import { BookingWizard } from './features/booking/BookingWizard'
import { TicketPage } from './features/ticket/TicketPage'
import { BookingPage } from './features/ticket/BookingPage'
import { FindBookingPage } from './features/ticket/FindBookingPage'
import { MeetPage } from './features/ticket/MeetPage'
import { StaffApp } from './features/staff/StaffApp'
import { DemoPanel } from './features/demo/DemoPanel'
import { CountryBackdrop } from './components/CountryBackdrop'
import { TeamPage } from './features/team/TeamPage'

export default function App() {
  const lang = useAppStore(s => s.lang)
  const { pathname } = useLocation()

  useEffect(() => {
    applyDocumentLang(lang)
  }, [lang])
  useEffect(() => {
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
      <Routes>
        <Route path="/" element={<DirectoryPage />} />
        <Route path="/consultant/:id" element={<ProfilePage />} />
        <Route path="/book/:id" element={<BookingWizard />} />
        <Route path="/ticket/:token" element={<TicketPage />} />
        <Route path="/booking/:token" element={<BookingPage />} />
        <Route path="/find" element={<FindBookingPage />} />
        <Route path="/meet/:token" element={<MeetPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/staff/*" element={<StaffApp />} />
        <Route path="*" element={<DirectoryPage />} />
      </Routes>
      <DemoPanel />
    </MotionConfig>
  )
}
