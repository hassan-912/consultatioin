import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { StaffApp } from '../StaffApp'
import { useAppStore, todayIn } from '../../../store/useAppStore'
import { loginAs } from '../../../test/loginAs'
import { zonedDateTimeToIso } from '../../../domain/time'
import type { Booking } from '../../../domain/types'

const today = todayIn('Africa/Cairo')
const mk = (id: string, name: string, phone: string, status: Booking['status'], minutes = 14 * 60): Booking => ({
  id, reference: `MG-REC-${id.toUpperCase()}`, qrToken: id.padEnd(32, '0'), manageToken: `m${id}`.padEnd(32, '0'),
  consultantId: 'mohamed-gamal', branchId: 'nasr-city', format: 'in-person', durationMin: 30,
  startIso: zonedDateTimeToIso(today, minutes, 'Africa/Cairo'), endIso: zonedDateTimeToIso(today, minutes + 30, 'Africa/Cairo'),
  tz: 'Africa/Cairo', price: { amount: 1000, currency: 'EGP' },
  customer: { name, phone, email: 'c@example.com', channel: 'whatsapp', consultationLang: 'ar', program: 'tourism', note: 'Wants Schengen' },
  status, holdExpiresAt: 0, createdAt: Date.now(), salesName: 'Mona',
})
const strong = {
  age_bracket: 'age_opt_2', education: 'edu_opt_1', employment: 'emp_opt_1', marital: 'mar_opt_1', travel: 'trav_opt_1,trav_opt_2',
  bank: 'bank_opt_1', purpose: 'purp_opt_1', asset: 'asset_opt_1,asset_opt_4', hrLetter: 'yes', previous_rejection: 'yes', personal_overstay: 'no', relative_overstay: 'no',
}
const open = (path: string) => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/staff/*" element={<StaffApp />} /></Routes></MemoryRouter>)

beforeEach(() => {
  useAppStore.getState().setLang('en')
  useAppStore.setState({
    seeded: true, audit: [], records: {}, timeOffsetMs: 0,
    bookings: { a: mk('a', 'Sara Ali', '+201001234567', 'completed'), b: mk('b', 'Omar Hassan', '+201117654321', 'checked-in', 15 * 60) },
    assessments: { a: { program: 'tourism', answers: strong } },
  })
  loginAs('consultant', 'mohamed-gamal')
})
afterEach(() => { vi.restoreAllMocks() })

test('records can be searched by name or phone and show which are not submitted yet', () => {
  open('/staff/records')
  expect(screen.getByRole('tab', { name: /to submit/i })).toHaveTextContent('2')
  fireEvent.change(screen.getByLabelText(/find a client/i), { target: { value: '0111 765' } })
  expect(screen.getByRole('article', { name: 'MG-REC-B' })).toBeInTheDocument()
  expect(screen.queryByRole('article', { name: 'MG-REC-A' })).toBeNull()
  fireEvent.change(screen.getByLabelText(/find a client/i), { target: { value: 'sara' } })
  expect(screen.getByRole('article', { name: 'MG-REC-A' })).toBeInTheDocument()
  expect(screen.queryByRole('article', { name: 'MG-REC-B' })).toBeNull()
})

test('submit saves the record; the PDF holds client details, the full assessment and the notes', async () => {
  const print = vi.spyOn(window, 'print').mockImplementation(() => {})
  open('/staff/records')
  const card = screen.getByRole('article', { name: 'MG-REC-A' })
  fireEvent.change(within(card).getByLabelText(/consultation notes/i), { target: { value: 'Strong ties. Prepare bank letter.' } })
  fireEvent.change(within(card).getByLabelText(/application outcome/i), { target: { value: 'pending' } })
  fireEvent.click(within(card).getByRole('button', { name: /submit record/i }))
  await waitFor(() => expect(useAppStore.getState().records.a).toEqual({ notes: 'Strong ties. Prepare bank letter.', outcome: 'pending' }))

  fireEvent.click(screen.getByRole('tab', { name: /all clients/i }))
  fireEvent.click(within(screen.getByRole('article', { name: 'MG-REC-A' })).getByRole('button', { name: /generate pdf/i }))
  await waitFor(() => expect(print).toHaveBeenCalled(), { timeout: 3000 })
  const report = document.querySelector('body > .cr-report') as HTMLElement
  expect(report).not.toBeNull()
  for (const text of ['Consultation summary', 'Sara Ali', '+201001234567', 'Tourism', 'Mona', 'MG-REC-A', 'Mohamed Gamal', 'Wants Schengen',
    'Strong file', 'Points breakdown', 'Client answers', 'Previous Visa Refusal', 'Strong ties. Prepare bank letter.', 'Pending']) {
    expect(report.textContent).toContain(text)
  }
  expect(report.textContent).toMatch(/91\s*%/)
  expect(document.title).toMatch(/^MG-Consultation-MG-REC-A-Sara-Ali/)
}, 20000)

test('consultant overview shows today as cards with a score ring; the assessment opens from the ring', () => {
  act(() => { useAppStore.setState(s => ({ bookings: { ...s.bookings, a: { ...s.bookings.a, status: 'confirmed' } } })) })
  open('/staff')
  expect(screen.getByRole('heading', { name: /today’s appointments/i })).toBeInTheDocument()
  const ring = screen.getByRole('button', { name: /file assessment: tourism visa file strength 91%/i })
  expect(within(ring).getByText('91%')).toBeInTheDocument()
  expect(screen.getByText('Omar Hassan')).toBeInTheDocument()
  fireEvent.click(ring)
  expect(screen.getByText('Customer answers')).toBeInTheDocument()
})
