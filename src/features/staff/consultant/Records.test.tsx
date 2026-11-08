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

test('the next step sits above Submit (no notes box); the PDF holds client details and the full assessment', async () => {
  const print = vi.spyOn(window, 'print').mockImplementation(() => {})
  open('/staff/records')
  const card = screen.getByRole('article', { name: 'MG-REC-A' })
  expect(within(card).queryByLabelText(/consultation notes/i)).toBeNull()
  expect(within(card).queryByLabelText(/application outcome/i)).toBeNull()
  const nextStep = within(card).getByRole('region', { name: /next step/i })
  const submit = within(card).getByRole('button', { name: /submit record/i })
  expect(nextStep.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy() // next step comes first
  fireEvent.click(submit)
  await waitFor(() => expect(useAppStore.getState().records.a).toBeDefined())

  fireEvent.click(screen.getByRole('tab', { name: /all clients/i }))
  fireEvent.click(within(screen.getByRole('article', { name: 'MG-REC-A' })).getByRole('button', { name: /generate pdf/i }))
  await waitFor(() => expect(print).toHaveBeenCalled(), { timeout: 3000 })
  const report = document.querySelector('body > .cr-report') as HTMLElement
  expect(report).not.toBeNull()
  for (const text of ['Consultation summary', 'Sara Ali', '+201001234567', 'Tourism', 'Mona', 'MG-REC-A', 'Mohamed Gamal', 'Wants Schengen',
    'Strong file', 'Points breakdown', 'Client answers', 'Previous Visa Refusal']) {
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

test('clicking an overview card opens the client file with details, assessment, the next step and a PDF download', async () => {
  const print = vi.spyOn(window, 'print').mockImplementation(() => {})
  act(() => { useAppStore.setState(s => ({ bookings: { ...s.bookings, a: { ...s.bookings.a, status: 'confirmed' } } })) })
  open('/staff')
  fireEvent.click(screen.getByRole('link', { name: 'Sara Ali' }))
  expect(screen.getByRole('heading', { level: 1, name: 'Sara Ali' })).toBeInTheDocument()
  for (const text of ['Client details', 'c@example.com', 'Wants Schengen', 'Mona', 'Customer answers', 'Previous Visa Refusal']) {
    expect(screen.getAllByText(new RegExp(text)).length).toBeGreaterThan(0)
  }
  expect(screen.queryByLabelText(/consultation notes/i)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /download pdf/i }))
  await waitFor(() => expect(print).toHaveBeenCalled(), { timeout: 3000 })
  expect(document.querySelector('body > .cr-report')?.textContent).toContain('Sara Ali')
}, 20000)

test('a consultant cannot open another consultant’s client file', () => {
  act(() => { useAppStore.setState(s => ({ bookings: { ...s.bookings, a: { ...s.bookings.a, consultantId: 'ahmed-salama' } } })) })
  open('/staff/client/a')
  expect(screen.getByText(/isn’t in your bookings/i)).toBeInTheDocument()
  expect(screen.queryByText('Customer answers')).toBeNull()
})
