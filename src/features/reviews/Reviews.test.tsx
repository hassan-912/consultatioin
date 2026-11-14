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

const THANKS = 'Thank you for your feedback, we work our best to enhance our service'

test('after submitting, shows only the thank-you text, and the review waits for its consultant', async () => {
  const { unmount } = open(`/booking/${base.manageToken}`)
  expect(await screen.findByText('How was your consultation?')).toBeInTheDocument()
  const send = screen.getByRole('button', { name: 'Send rating' })
  expect(send).toBeDisabled()
  fireEvent.click(screen.getByLabelText('4 out of 5 stars'))
  fireEvent.change(screen.getByLabelText(/comment/i), { target: { value: 'Clear and patient' } })
  fireEvent.click(send)
  expect(await screen.findByText(THANKS)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Send rating' })).toBeNull()
  expect(screen.queryByText('Clear and patient')).toBeNull()
  expect(useAppStore.getState().reviews.r1.status).toBe('pending')
  unmount()

  open('/consultant/ahmed-khalil')
  expect(await screen.findByText('No verified feedback yet')).toBeInTheDocument()
  expect(screen.queryByText('Clear and patient')).toBeNull()
})

test('reopening a reviewed booking shows no stars or comment, whatever the status', async () => {
  for (const status of ['pending', 'approved', 'rejected'] as const) {
    useAppStore.setState({ reviews: { r1: { rating: 2, comment: 'too short', name: 'Sara', at: Date.now(), consultantId: 'ahmed-khalil', status } } })
    const { unmount } = open(`/booking/${base.manageToken}`)
    expect(await screen.findByText(THANKS)).toBeInTheDocument()
    expect(screen.queryByText('too short')).toBeNull()
    expect(screen.queryByRole('img', { name: /stars/i })).toBeNull()
    unmount()
  }
})

test('an approved review shows on the consultant profile with the first name only', async () => {
  useAppStore.setState({ reviews: { r1: { rating: 4, comment: 'Clear and patient', name: 'Sara', at: Date.now(), consultantId: 'ahmed-khalil', status: 'approved' } } })
  open('/consultant/ahmed-khalil')
  expect(await screen.findByText('4.0')).toBeInTheDocument()
  expect(screen.getByText('1 verified review')).toBeInTheDocument()
  expect(screen.getByText('Sara')).toBeInTheDocument()
  expect(screen.getByText('Clear and patient')).toBeInTheDocument()
})

test('no rating form before the consultation is completed', () => {
  useAppStore.setState({ bookings: { r1: { ...base, status: 'confirmed' } } })
  open(`/booking/${base.manageToken}`)
  expect(screen.queryByText('How was your consultation?')).toBeNull()
})

test('admin hides a review: it leaves the public profile but stays in the admin list, and can be restored', async () => {
  const { StaffApp } = await import('../staff/StaffApp')
  const { loginAs } = await import('../../test/loginAs')
  useAppStore.setState({ reviews: { r1: { rating: 1, comment: 'rude words', name: 'Sara', at: Date.now(), consultantId: 'ahmed-khalil', status: 'approved' } } })
  loginAs('admin')
  const admin = render(<MemoryRouter initialEntries={['/staff/reviews']}><Routes><Route path="/staff/*" element={<StaffApp />} /></Routes></MemoryRouter>)
  expect(await screen.findByText('rude words')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Hide from profile' }))
  expect(await screen.findByRole('button', { name: 'Show on profile' })).toBeInTheDocument()
  expect(useAppStore.getState().audit[0].action).toBe('review-hidden')
  admin.unmount()

  const profile = open('/consultant/ahmed-khalil')
  expect(await screen.findByText('No verified feedback yet')).toBeInTheDocument()
  expect(screen.queryByText('rude words')).toBeNull()
  profile.unmount()

  loginAs('finance')
  render(<MemoryRouter initialEntries={['/staff/reviews']}><Routes><Route path="/staff/*" element={<StaffApp />} /></Routes></MemoryRouter>)
  expect(screen.queryByRole('link', { name: /customer reviews/i })).toBeNull()
})
