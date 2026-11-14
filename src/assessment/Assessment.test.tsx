import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { BookingWizard } from '../features/booking/BookingWizard'
import { BookingPage } from '../features/ticket/BookingPage'
import { StaffApp } from '../features/staff/StaffApp'
import { useAppStore, emptyDraft, todayIn } from '../store/useAppStore'
import { loginAs } from '../test/loginAs'
import { slotsFor } from '../features/shared/availability'
import { addDays } from '../domain/time'
import type { Booking } from '../domain/types'

const ID = 'mohamed-gamal'
const slot = () => {
  for (let i = 0; i < 14; i++) { const s = slotsFor(ID, addDays(todayIn('Africa/Cairo'), i), 'in-person', 30); if (s.length) return s[0].startIso }
  throw new Error('no slot')
}
const strong = {
  age_bracket: 'age_opt_2', education: 'edu_opt_1', employment: 'emp_opt_1', marital: 'mar_opt_1', travel: 'trav_opt_1,trav_opt_2',
  bank: 'bank_opt_1', purpose: 'purp_opt_1', asset: 'asset_opt_1,asset_opt_4', hrLetter: 'yes', previous_rejection: 'yes', personal_overstay: 'no', relative_overstay: 'no',
}
const at = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/book/:id" element={<BookingWizard />} />
      <Route path="/booking/:token" element={<BookingPage />} />
      <Route path="/staff/*" element={<StaffApp />} />
    </Routes>
  </MemoryRouter>,
)

beforeEach(() => {
  useAppStore.getState().setLang('en')
  useAppStore.setState({ bookings: {}, audit: [], assessments: {}, seeded: true, timeOffsetMs: 0, staffSession: null, draft: { ...emptyDraft(), consultantId: ID } })
})

const booked = (): Booking => {
  const b: Booking = {
    id: 'as1', reference: 'MG-ASSESS-01', qrToken: 'a'.repeat(32), manageToken: 'd'.repeat(32), consultantId: ID, branchId: 'nasr-city',
    format: 'in-person' , durationMin: 45, startIso: slot(), endIso: slot(), tz: 'Africa/Cairo',
    price: { amount: 1000, currency: 'EGP' },
    customer: { name: 'Sara Ali', phone: '+201001234567', email: '', channel: 'whatsapp', consultationLang: 'en', program: '', note: '' },
    status: 'confirmed', holdExpiresAt: 0, createdAt: Date.now(),
  }
  useAppStore.setState({ bookings: { [b.id]: b } })
  return b
}

test('the consultant fills the assessment from the client file; finance and the customer do not see it', async () => {
  const b = booked()
  loginAs('consultant', ID)
  const file = at(`/staff/client/${b.id}`)
  fireEvent.click(await screen.findByRole('button', { name: 'Fill assessment' }))
  fireEvent.change(await screen.findByLabelText('Program of interest'), { target: { value: 'tourism' } })
  fireEvent.click(await screen.findByRole('radio', { name: /25.44/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Save assessment' }))
  await waitFor(() => expect(useAppStore.getState().assessments[b.id]).toMatchObject({ program: 'tourism', answers: { age_bracket: 'age_opt_2' } }))
  expect(useAppStore.getState().audit[0].action).toBe('assessment-saved')
  file.unmount()

  const ticket = at(`/booking/${b.manageToken}`)
  expect(screen.queryByText(/file assessment/i)).toBeNull()
  ticket.unmount()

  loginAs('finance')
  at('/staff/bookings')
  expect(await screen.findByText(b.reference, undefined, { timeout: 5000 })).toBeInTheDocument()
  expect(screen.queryByText('File assessment')).toBeNull()
}, 20000)

test('an existing assessment is pre-filled and the ring shows its score', async () => {
  const b = booked()
  useAppStore.setState({ assessments: { [b.id]: { program: 'tourism', answers: strong } } })
  loginAs('consultant', ID)
  at(`/staff/client/${b.id}`)
  expect(await screen.findByRole('button', { name: /File assessment: .*91/ })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Edit assessment' }))
  expect(await screen.findByLabelText('Program of interest')).toHaveValue('tourism')
  expect(screen.getByRole('radio', { name: /25.44/ })).toBeChecked()
}, 20000)
