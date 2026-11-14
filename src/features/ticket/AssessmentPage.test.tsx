import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AssessmentPage } from './AssessmentPage'
import { BookingPage } from './BookingPage'
import { useAppStore } from '../../store/useAppStore'
import type { Booking } from '../../domain/types'

const b: Booking = {
  id: 'ap1', reference: 'MG-YOURS-01', qrToken: 'b'.repeat(32), manageToken: 'f'.repeat(32), consultantId: 'mohamed-gamal', branchId: 'nasr-city',
  format: 'in-person', durationMin: 45, startIso: new Date(Date.now() + 86400000).toISOString(), endIso: new Date(Date.now() + 86400000 + 2700000).toISOString(),
  tz: 'Africa/Cairo', price: { amount: 1000, currency: 'EGP' },
  customer: { name: 'Sara Ali', phone: '+201001234567', email: '', channel: 'whatsapp', consultationLang: 'en', program: '', note: '' },
  status: 'confirmed', holdExpiresAt: 0, createdAt: Date.now(),
}
const strong = {
  age_bracket: 'age_opt_2', education: 'edu_opt_1', employment: 'emp_opt_1', marital: 'mar_opt_1', travel: 'trav_opt_1,trav_opt_2',
  bank: 'bank_opt_1', purpose: 'purp_opt_1', asset: 'asset_opt_1,asset_opt_4', hrLetter: 'yes', previous_rejection: 'yes', personal_overstay: 'no', relative_overstay: 'no',
}
const open = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/booking/:token" element={<BookingPage />} />
      <Route path="/booking/:token/assessment" element={<AssessmentPage />} />
    </Routes>
  </MemoryRouter>,
)

beforeEach(() => {
  useAppStore.getState().setLang('en')
  useAppStore.setState({ bookings: { [b.id]: b }, assessments: {}, audit: [], seeded: true, timeOffsetMs: 0, staffSession: null })
})

test('the assessment link shows the client report', async () => {
  useAppStore.setState({ assessments: { [b.id]: { program: 'tourism', answers: strong } } })
  open(`/booking/${b.manageToken}/assessment`)
  expect(await screen.findByText('Your assessment')).toBeInTheDocument()
  expect(screen.getAllByText('Sara Ali').length).toBeGreaterThan(0)
  expect(screen.getAllByText('MG-YOURS-01').length).toBeGreaterThan(0)
  expect(screen.queryByText(/internal document/i)).toBeNull()
})

test('no assessment yet shows a friendly message', async () => {
  open(`/booking/${b.manageToken}/assessment`)
  expect(await screen.findByText('Your consultant has not filled in your assessment yet.')).toBeInTheDocument()
})

test('booking page shows Your assessment once it exists', async () => {
  const first = open(`/booking/${b.manageToken}`)
  await screen.findByText('MG-YOURS-01')
  expect(screen.queryByRole('link', { name: 'Open your assessment' })).toBeNull()
  first.unmount()
  useAppStore.setState({ assessments: { [b.id]: { program: 'tourism', answers: strong } } })
  open(`/booking/${b.manageToken}`)
  expect(await screen.findByRole('link', { name: 'Open your assessment' })).toHaveAttribute('href', `/booking/${b.manageToken}/assessment`)
})
