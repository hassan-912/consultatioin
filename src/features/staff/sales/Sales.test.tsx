import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { BookingWizard } from '../../booking/BookingWizard'
import { StaffApp } from '../StaffApp'
import { useAppStore, emptyDraft, todayIn } from '../../../store/useAppStore'
import { loginAs } from '../../../test/loginAs'
import { slotsFor } from '../../shared/availability'
import { addDays, zonedDateTimeToIso } from '../../../domain/time'
import { captureReferral, clearReferral, currentReferral, localReferralCode } from '../../../data/referral'
import type { Booking } from '../../../domain/types'

const ID = 'mohamed-gamal'
const slot = () => {
  for (let i = 0; i < 14; i++) { const s = slotsFor(ID, addDays(todayIn('Africa/Cairo'), i), 'in-person', 30); if (s.length) return s[0].startIso }
  throw new Error('no slot')
}
const at = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/book/:id" element={<BookingWizard />} />
      <Route path="/staff/*" element={<StaffApp />} />
    </Routes>
  </MemoryRouter>,
)
const loginSales = (username: string) => useAppStore.setState({ role: 'sales', staffSession: { username, role: 'sales', consultantId: null } })

beforeEach(() => {
  clearReferral()
  useAppStore.getState().setLang('en')
  useAppStore.setState({ bookings: {}, audit: [], assessments: {}, seeded: true, timeOffsetMs: 0, staffSession: null, draft: { ...emptyDraft(), consultantId: ID } })
})

test('a ?ref= link is remembered and cleaned from the address; junk codes are ignored', () => {
  captureReferral({ search: '?ref=AB12CD34', hash: '#/', pathname: '/' })
  expect(currentReferral()).toBe('ab12cd34')
  clearReferral()
  captureReferral({ search: '', hash: '#/consultant/x?ref=zz99zz99', pathname: '/' })
  expect(currentReferral()).toBe('zz99zz99')
  clearReferral()
  captureReferral({ search: '?ref=<script>', hash: '#/', pathname: '/' })
  expect(currentReferral()).toBeNull()
})

test('a booking made through a sales link carries the sales name; that sales person sees it with the assessment, reception sees no assessment', async () => {
  const code = localReferralCode('mona.sales')
  captureReferral({ search: `?ref=${code}`, hash: '#/', pathname: '/' })
  useAppStore.getState().updateDraft({ step: 4, format: 'in-person', durationMin: 45, slotStartIso: slot(), assessment: { program: 'tourism', answers: { age_bracket: 'age_opt_2' } } })
  useAppStore.getState().updateDetails({ name: 'Sara Ali', phone: '+201001234567', email: 'sara@example.com', program: 'tourism' })
  const wizard = at(`/book/${ID}`)
  await waitFor(() => expect(Object.values(useAppStore.getState().bookings)[0]?.salesCode).toBe(code), { timeout: 5000 })
  wizard.unmount()
  const b = Object.values(useAppStore.getState().bookings)[0]
  act(() => useAppStore.setState(s => ({ bookings: { [b.id]: { ...s.bookings[b.id], status: 'confirmed' } } })))
  // A sales-link client skips the assessment when booking; the consultant fills it in later.
  expect(useAppStore.getState().assessments[b.id]).toBeUndefined()
  act(() => useAppStore.setState(s => ({ assessments: { ...s.assessments, [b.id]: { program: 'tourism', answers: { age_bracket: 'age_opt_2' } } } })))

  loginSales('mona.sales')
  const sales = at('/staff/my-clients')
  const card = (await screen.findByText(b.reference, undefined, { timeout: 5000 })).closest('li') as HTMLElement
  expect(within(card).getByText('File assessment')).toBeInTheDocument()
  sales.unmount()

  loginSales('karim.sales')
  const other = at('/staff/my-clients')
  expect(screen.getByText(/no paid clients through your link/i)).toBeInTheDocument()
  other.unmount()

  loginAs('reception')
  at('/staff/bookings')
  expect(await screen.findByText(b.reference, undefined, { timeout: 5000 })).toBeInTheDocument()
  expect(screen.getAllByText(/^Sales: /).length).toBeGreaterThan(0)
  expect(screen.queryByText('File assessment')).toBeNull()
}, 20000)

test('sales lands on My link, which shows a personal link, and cannot open other screens', async () => {
  loginSales('mona.sales')
  at('/staff/payments')
  expect(await screen.findByText(/your personal booking link/i)).toBeInTheDocument()
  expect(screen.getByText(new RegExp(`ref=${localReferralCode('mona.sales')}`))).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /payment review/i })).toBeNull()
}, 20000)

test('reception can change the consultant after a scan (first option) or keep the booked one; busy consultants are blocked', async () => {
  const today = todayIn('Africa/Cairo')
  const mk = (id: string, consultantId: string): Booking => ({
    id, reference: `MG-SWAP-${id.toUpperCase()}`, qrToken: id.padEnd(32, '0'), manageToken: `m${id}`.padEnd(32, '0'),
    consultantId, branchId: 'nasr-city', format: 'in-person', durationMin: 45,
    startIso: zonedDateTimeToIso(today, 23 * 60, 'Africa/Cairo'), endIso: zonedDateTimeToIso(today, 23 * 60 + 30, 'Africa/Cairo'),
    tz: 'Africa/Cairo', price: { amount: 1000, currency: 'EGP' },
    customer: { name: 'Sara', phone: '+201001234567', email: '', channel: 'whatsapp', consultationLang: 'en', program: 'tourism', note: '' },
    status: 'confirmed', holdExpiresAt: 0, createdAt: Date.now(),
  })
  useAppStore.setState({ bookings: { s1: mk('s1', 'mohamed-gamal'), s2: mk('s2', 'ahmed-salama') } })
  loginAs('reception')
  at('/staff/checkin')
  fireEvent.change(screen.getByLabelText(/booking reference or ticket code/i), { target: { value: 'MG-SWAP-S1' } })
  fireEvent.click(screen.getByRole('button', { name: /check ticket/i }))
  const actions = await screen.findAllByRole('button', { name: /change consultant|keep mohamed gamal/i })
  expect(actions.map(a => a.textContent)).toEqual(['Change consultant', 'Keep Mohamed Gamal'])
  fireEvent.click(actions[0])
  const busy = screen.getByRole('button', { name: /ahmed salama/i })
  expect(busy).toBeDisabled()
  expect(within(busy).getByText(/busy at this time/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /ahmed tarek/i })).toBeNull() // other branch
  fireEvent.click(screen.getByRole('button', { name: /ahmed khalil/i }))
  // A reason is required before the change goes through.
  expect(screen.getByText(/moving the client from mohamed gamal to ahmed khalil/i)).toBeInTheDocument()
  const confirm = screen.getByRole('button', { name: /confirm change/i })
  expect(confirm).toBeDisabled()
  expect(useAppStore.getState().bookings.s1.consultantId).toBe('mohamed-gamal')
  fireEvent.click(screen.getByRole('button', { name: /isn’t free at this time/i }))
  expect(screen.getByLabelText(/why are you changing the consultant/i)).toHaveValue('The consultant isn’t free at this time')
  fireEvent.click(confirm)
  expect(await screen.findByText(/changed from mohamed gamal to ahmed khalil/i)).toBeInTheDocument()
  const moved = useAppStore.getState().bookings.s1
  expect([moved.consultantId, moved.swappedFrom, moved.swapReason]).toEqual(['ahmed-khalil', 'mohamed-gamal', 'The consultant isn’t free at this time'])
  expect(useAppStore.getState().audit[0]).toMatchObject({ action: 'consultant-changed', note: 'The consultant isn’t free at this time' })
  expect(screen.getByText(/moved from mohamed gamal:/i)).toBeInTheDocument()
}, 20000)

const paidTest = (id: string, status: Booking['status'], salesCode?: string): Booking => ({
  id, reference: `MG-PAID-${id.toUpperCase()}`, qrToken: id.padEnd(32, '0'), manageToken: `m${id}`.padEnd(32, '0'),
  consultantId: ID, branchId: 'nasr-city', format: 'in-person', durationMin: 45,
  startIso: '2026-12-01T10:00:00.000Z', endIso: '2026-12-01T10:45:00.000Z', tz: 'Africa/Cairo', price: { amount: 1000, currency: 'EGP' },
  customer: { name: `Client ${id}`, phone: '+201001234567', email: '', channel: 'whatsapp', consultationLang: 'en', program: 'tourism', note: '' },
  status, holdExpiresAt: 0, createdAt: Date.now(), salesCode, salesName: salesCode ? 'Someone' : undefined,
})

test('a sales person sees only their own clients who have paid', async () => {
  const mona = localReferralCode('mona.sales')
  useAppStore.setState({ bookings: {
    a: paidTest('a', 'confirmed', mona), b: paidTest('b', 'on-hold', mona), c: paidTest('c', 'confirmed', localReferralCode('karim.sales')), d: paidTest('d', 'completed'),
  } })
  loginSales('mona.sales')
  at('/staff/my-clients')
  expect(await screen.findByText('MG-PAID-A')).toBeInTheDocument()
  for (const ref of ['MG-PAID-B', 'MG-PAID-C', 'MG-PAID-D']) expect(screen.queryByText(ref)).toBeNull()
}, 20000)

test('the sales manager sees every paid client, from any sales person or none, and no unpaid ones', async () => {
  useAppStore.setState({ bookings: {
    a: paidTest('a', 'confirmed', localReferralCode('mona.sales')), b: paidTest('b', 'on-hold'), c: paidTest('c', 'checked-in'), d: paidTest('d', 'cancelled'),
  } })
  useAppStore.setState({ role: 'sales', staffSession: { username: 'shady', role: 'sales', consultantId: null, salesManager: true } })
  at('/staff/my-clients')
  expect(await screen.findByText('MG-PAID-A')).toBeInTheDocument()
  expect(screen.getByText('MG-PAID-C')).toBeInTheDocument()
  expect(screen.queryByText('MG-PAID-B')).toBeNull()
  expect(screen.queryByText('MG-PAID-D')).toBeNull()
}, 20000)

test('the sales manager gets a pop-up when a client pays, but not for clients already paid at sign-in', async () => {
  useAppStore.setState({ bookings: { old: paidTest('old', 'confirmed'), wait: paidTest('wait', 'on-hold') } })
  useAppStore.setState({ role: 'sales', staffSession: { username: 'shady', role: 'sales', consultantId: null, salesManager: true } })
  at('/staff/my-clients')
  await screen.findByText('MG-PAID-OLD')
  expect(screen.queryByText('New paid client')).toBeNull()
  act(() => useAppStore.setState(s => ({ bookings: { ...s.bookings, wait: { ...s.bookings.wait, status: 'confirmed' } } })))
  expect(await screen.findByText('Client wait paid (MG-PAID-WAIT)')).toBeInTheDocument()
}, 20000)

test('an ordinary sales person gets no paid-client pop-up', async () => {
  const mona = localReferralCode('mona.sales')
  useAppStore.setState({ bookings: { wait: paidTest('wait', 'on-hold', mona) } })
  loginSales('mona.sales')
  at('/staff/my-clients')
  await screen.findByText(/no paid clients through your link/i)
  act(() => useAppStore.setState(s => ({ bookings: { ...s.bookings, wait: { ...s.bookings.wait, status: 'confirmed' } } })))
  await screen.findByText('MG-PAID-WAIT')
  expect(screen.queryByText('New paid client')).toBeNull()
}, 20000)
