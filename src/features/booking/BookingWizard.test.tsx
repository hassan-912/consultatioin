import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { BookingWizard } from './BookingWizard'
import { useAppStore, emptyDraft } from '../../store/useAppStore'
import { slotsFor } from '../shared/availability'
import { addDays } from '../../domain/time'
import { todayIn } from '../../store/useAppStore'

const ID = 'mohamed-gamal'
const renderWizard = () =>
  render(
    <MemoryRouter initialEntries={[`/book/${ID}`]}>
      <Routes>
        <Route path="/book/:id" element={<BookingWizard />} />
        <Route path="/ticket/:token" element={<p>TICKET PAGE</p>} />
      </Routes>
    </MemoryRouter>,
  )

const firstSlot = (format: 'online' | 'in-person', dur: number) => {
  for (let i = 0; i < 14; i++) {
    const s = slotsFor(ID, addDays(todayIn('Africa/Cairo'), i), format, dur)
    if (s.length) return s[0].startIso
  }
  throw new Error('no slot')
}

const goodDetails = { name: 'Sara Ali', phone: '+201001234567', email: 'sara@example.com', program: 'immigration' as const }

beforeEach(() => {
  useAppStore.getState().setLang('en')
  useAppStore.setState({ bookings: {}, audit: [], seeded: true, timeOffsetMs: 0, draft: { ...emptyDraft(), consultantId: ID } })
})

test('choosing a format moves straight to the time step; duration is fixed, not selectable', async () => {
  renderWizard()
  fireEvent.click(screen.getByRole('radio', { name: /online consultation/i }))
  expect(await screen.findByText(/choose a time/i)).toBeInTheDocument()
  expect(screen.queryByRole('radio', { name: /min$/ })).toBeNull()
  expect(screen.queryByRole('button', { name: /^continue$/i })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /back/i }))
  expect(await screen.findByRole('radio', { name: /in-person consultation/i })).toBeInTheDocument()
})

test('details step blocks invalid phone and empty email with messages', () => {
  useAppStore.getState().updateDraft({ step: 2, format: 'online', durationMin: 30, slotStartIso: firstSlot('online', 30) })
  renderWizard()
  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Sara Ali' } })
  fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: '01001234567' } })
  fireEvent.click(screen.getByRole('button', { name: /review my booking/i }))
  expect(screen.getByText(/starting with \+ and the country code/i)).toBeInTheDocument()
  expect(screen.getByText(/valid email address/i)).toBeInTheDocument()
  expect(useAppStore.getState().draft.step).toBe(2)
})

test('review shows price and duration before payment', () => {
  useAppStore.getState().updateDraft({ step: 3, format: 'in-person', durationMin: 30, slotStartIso: firstSlot('in-person', 30) })
  useAppStore.getState().updateDetails(goodDetails)
  renderWizard()
  expect(screen.getAllByText('1,000 EGP').length).toBeGreaterThan(0)
  expect(screen.getAllByText('15–30 min').length).toBeGreaterThan(0)
  expect(screen.getByText(/Makram Ebeid/)).toBeInTheDocument()
})

test('payment step keeps the same reference across reloads and submits to the ticket', async () => {
  useAppStore.getState().updateDraft({ step: 4, format: 'online', durationMin: 30, slotStartIso: firstSlot('online', 30) })
  useAppStore.getState().updateDetails(goodDetails)
  const { unmount } = renderWizard()
  const ref1 = screen.getByTestId('booking-ref').textContent
  unmount()
  renderWizard()
  expect(screen.getByTestId('booking-ref').textContent).toBe(ref1)
  expect(Object.keys(useAppStore.getState().bookings)).toHaveLength(1)

  fireEvent.change(screen.getByLabelText(/transaction reference/i), { target: { value: 'TX-9988' } })
  fireEvent.click(screen.getByRole('button', { name: /submit payment details/i }))
  expect(await screen.findByText('TICKET PAGE')).toBeInTheDocument()
  expect(Object.values(useAppStore.getState().bookings)[0].status).toBe('on-hold')
})

test('expired reservation disables submit', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  useAppStore.getState().updateDraft({ step: 4, format: 'online', durationMin: 30, slotStartIso: firstSlot('online', 30) })
  useAppStore.getState().updateDetails(goodDetails)
  renderWizard()
  act(() => useAppStore.setState({ timeOffsetMs: 31 * 60000 }))
  await act(async () => { vi.advanceTimersByTime(1500) })
  expect(screen.getByText(/reservation expired/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /submit payment details/i })).toBeNull()
  vi.useRealTimers()
})

test('submitting after the hold silently expired (throttled tab) shows the expired screen', () => {
  useAppStore.getState().updateDraft({ step: 4, format: 'online', durationMin: 30, slotStartIso: firstSlot('online', 30) })
  useAppStore.getState().updateDetails(goodDetails)
  renderWizard()
  fireEvent.change(screen.getByLabelText(/transaction reference/i), { target: { value: 'TX-1234' } })
  useAppStore.setState({ timeOffsetMs: 31 * 60000 }) // no timer tick yet
  fireEvent.click(screen.getByRole('button', { name: /submit payment details/i }))
  expect(screen.getByText(/reservation expired/i)).toBeInTheDocument()
  expect(Object.values(useAppStore.getState().bookings)[0].status).toBe('expired')
})
