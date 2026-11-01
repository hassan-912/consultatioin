import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { BookingPage } from '../ticket/BookingPage'
import { ProfilePage } from '../profile/ProfilePage'
import { useAppStore } from '../../store/useAppStore'
import type { Booking } from '../../domain/types'

const base: Booking = {
  id: 'r1', reference: 'MG-RATE-AAAA', qrToken: 'b'.repeat(32), manageToken: 'e'.repeat(32),
  consultantId: 'ahmed-khalil', branchId: 'nasr-city', format: 'in-person', durationMin: 30,
  startIso: new Date(Date.now() - 86400000).toISOString(), endIso: new Date(Date.now() - 86400000 + 1800000).toISOString(),
  tz: 'Africa/Cairo', price: { amount: 1000, currency: 'EGP' },
  customer: { name: 'Sara Ali', phone: '+201001234567', email: '', channel: 'whatsapp', consultationLang: 'en', program: 'immigration', note: '' },
  status: 'completed', holdExpiresAt: 0, createdAt: Date.now(),
}
const open = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/booking/:token" element={<BookingPage />} />
      <Route path="/consultant/:id" element={<ProfilePage />} />
    </Routes>
  </MemoryRouter>,
)

beforeEach(() => {
  useAppStore.getState().setLang('en')
  useAppStore.setState({ bookings: { r1: base }, reviews: {}, audit: [], seeded: true, timeOffsetMs: 0 })
})

test('after a completed consultation the customer rates it once and it shows on the consultant profile', async () => {
  const { unmount } = open(`/booking/${base.manageToken}`)
  expect(await screen.findByText('How was your consultation?')).toBeInTheDocument()
  const send = screen.getByRole('button', { name: 'Send rating' })
  expect(send).toBeDisabled()
  fireEvent.click(screen.getByLabelText('4 out of 5 stars'))
  fireEvent.change(screen.getByLabelText(/comment/i), { target: { value: 'Clear and patient' } })
  fireEvent.click(send)
  expect(await screen.findByText('Thank you for your feedback')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Send rating' })).toBeNull()
  unmount()

  open('/consultant/ahmed-khalil')
  expect(await screen.findByText('4.0')).toBeInTheDocument()
  expect(screen.getByText('1 verified review')).toBeInTheDocument()
  expect(screen.getByText('Sara')).toBeInTheDocument()
  expect(screen.queryByText(/Ali/)).toBeNull()
  expect(screen.getByText('Clear and patient')).toBeInTheDocument()
})

test('no rating form before the consultation is completed', () => {
  useAppStore.setState({ bookings: { r1: { ...base, status: 'confirmed' } } })
  open(`/booking/${base.manageToken}`)
  expect(screen.queryByText('How was your consultation?')).toBeNull()
})
