import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { BookingWizard } from '../features/booking/BookingWizard'
import { BookingPage } from '../features/ticket/BookingPage'
import { StaffApp } from '../features/staff/StaffApp'
import { useAppStore, emptyDraft, todayIn } from '../store/useAppStore'
import { loginAs } from '../test/loginAs'
import { slotsFor } from '../features/shared/availability'
import { addDays } from '../domain/time'

const ID = 'mohamed-gamal'
const slot = () => {
  for (let i = 0; i < 14; i++) { const s = slotsFor(ID, addDays(todayIn('Africa/Cairo'), i), 'in-person', 30); if (s.length) return s[0].startIso }
  throw new Error('no slot')
}
const details = { name: 'Sara Ali', phone: '+201001234567', email: 'sara@example.com', program: 'tourism' as const }
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

test('tourism booking asks the situation questions with no score and will not continue until they are answered', () => {
  useAppStore.getState().updateDraft({ step: 2, format: 'in-person', durationMin: 30, slotStartIso: slot() })
  useAppStore.getState().updateDetails(details)
  at(`/book/${ID}`)
  expect(screen.getByText('A few questions about your situation')).toBeInTheDocument()
  expect(screen.queryByText(/score|points|strong file/i)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /review my booking/i }))
  expect(useAppStore.getState().draft.step).toBe(2)
  expect(screen.getAllByText('This field is required.').length).toBeGreaterThan(3)
  // picking "No travel history" clears the other countries
  fireEvent.click(screen.getByRole('checkbox', { name: 'Europe' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'No travel history' }))
  expect(useAppStore.getState().draft.assessment?.answers.travel).toBe('trav_opt_5')
  act(() => useAppStore.getState().updateDraft({ assessment: { program: 'tourism', answers: strong } }))
  fireEvent.click(screen.getByRole('button', { name: /review my booking/i }))
  expect(useAppStore.getState().draft.step).toBe(3)
})

test('answers are saved with the hold; the consultant and admin see the score, finance and the customer do not', async () => {
  useAppStore.getState().updateDraft({ step: 4, format: 'in-person', durationMin: 30, slotStartIso: slot(), assessment: { program: 'tourism', answers: strong } })
  useAppStore.getState().updateDetails(details)
  const wizard = at(`/book/${ID}`)
  await waitFor(() => expect(Object.keys(useAppStore.getState().assessments)).toHaveLength(1), { timeout: 5000 })
  wizard.unmount()
  const b = Object.values(useAppStore.getState().bookings)[0]
  useAppStore.setState(s => ({ bookings: { [b.id]: { ...s.bookings[b.id], status: 'confirmed' } } }))

  const ticket = at(`/booking/${b.manageToken}`)
  expect(screen.queryByText(/file assessment|91/i)).toBeNull()
  ticket.unmount()

  loginAs('consultant', ID)
  const desk = at('/staff/my-bookings')
  const card = (await screen.findByText(b.reference, undefined, { timeout: 5000 })).closest('li, article, div.rounded-2xl') as HTMLElement
  expect(within(card).getByText('File assessment')).toBeInTheDocument()
  expect(within(card).getByText('91 / 100')).toBeInTheDocument()
  expect(within(card).getByText('Strong file')).toBeInTheDocument()
  fireEvent.click(within(card).getByRole('button', { name: 'View full assessment' }))
  expect(await screen.findByText('Customer answers', undefined, { timeout: 5000 })).toBeInTheDocument()
  expect(screen.getByText('Previous Visa Refusal')).toBeInTheDocument()
  desk.unmount()

  loginAs('consultant', 'mohamed-salah')
  const other = at('/staff/bookings')
  expect(screen.queryByText('File assessment')).toBeNull()
  other.unmount()

  loginAs('finance')
  at('/staff/bookings')
  expect(await screen.findByText(b.reference, undefined, { timeout: 5000 })).toBeInTheDocument()
  expect(screen.queryByText('File assessment')).toBeNull()
})
