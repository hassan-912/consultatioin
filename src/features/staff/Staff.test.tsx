import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { StaffApp } from './StaffApp'
import { useAppStore } from '../../store/useAppStore'
import { zonedDateTimeToIso } from '../../domain/time'
import { todayIn } from '../../store/useAppStore'
import type { Booking } from '../../domain/types'

const today = todayIn('Africa/Cairo')
const mk = (id: string, over: Partial<Booking>): Booking => ({
  id, reference: `MG-TEST-${id.toUpperCase().padEnd(4, 'X').slice(0, 4)}`, qrToken: `${id}`.padEnd(32, '0'), manageToken: `m${id}`.padEnd(32, '0'),
  consultantId: 'mohamed-gamal', branchId: 'nasr-city', format: 'in-person', durationMin: 30,
  startIso: zonedDateTimeToIso(today, 23 * 60, 'Africa/Cairo'), endIso: zonedDateTimeToIso(today, 23 * 60 + 30, 'Africa/Cairo'),
  tz: 'Africa/Cairo', price: { amount: 1000, currency: 'EGP' },
  customer: { name: `Customer ${id}`, phone: '+201001234567', email: 'c@example.com', channel: 'email', consultationLang: 'ar', program: 'immigration', note: '' },
  status: 'on-hold', holdExpiresAt: Date.now() + 1e6, createdAt: Date.now(),
  payment: { method: 'instapay', txnRef: `TX-${id}`, submittedAt: Date.now() }, ...over,
})

const openStaff = (path: string) =>
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/staff/*" element={<StaffApp />} /></Routes></MemoryRouter>)

beforeEach(() => {
  useAppStore.getState().setLang('en')
  useAppStore.setState({
    seeded: true, audit: [], timeOffsetMs: 0,
    bookings: { a: mk('a', {}), b: mk('b', { status: 'confirmed', qrToken: 'b'.padEnd(32, '1') }) },
  })
})

test('reception cannot see payment review', () => {
  useAppStore.getState().setRole('reception')
  openStaff('/staff')
  expect(screen.queryByRole('link', { name: /payment review/i })).toBeNull()
  expect(screen.getAllByRole('link', { name: /check-in/i }).length).toBeGreaterThan(0)
})

test('finance verifies a payment: booking confirmed and audited', () => {
  useAppStore.getState().setRole('finance')
  openStaff('/staff/payments')
  const item = screen.getByRole('article', { name: /MG-TEST-A/ })
  fireEvent.click(within(item).getByRole('button', { name: /verify payment/i }))
  const s = useAppStore.getState()
  expect(s.bookings.a.status).toBe('confirmed')
  expect(s.audit[0]).toMatchObject({ actor: 'finance', to: 'confirmed' })
})

test('reject requires a reason', () => {
  useAppStore.getState().setRole('finance')
  openStaff('/staff/payments')
  const item = screen.getByRole('article', { name: /MG-TEST-A/ })
  fireEvent.click(within(item).getByRole('button', { name: /^reject$/i }))
  fireEvent.click(within(item).getByRole('button', { name: /confirm/i }))
  expect(within(item).getByText(/a reason is required/i)).toBeInTheDocument()
  expect(useAppStore.getState().bookings.a.status).toBe('on-hold')
})

test('reception: check-in once, second scan flagged as already used', () => {
  useAppStore.getState().setRole('reception')
  openStaff('/staff/checkin')
  const input = screen.getByLabelText(/booking reference or ticket code/i)
  fireEvent.change(input, { target: { value: 'b'.padEnd(32, '1') } })
  fireEvent.click(screen.getByRole('button', { name: /check ticket/i }))
  expect(screen.getByText(/valid — ready to check in/i)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /record check-in/i }))
  expect(useAppStore.getState().bookings.b.status).toBe('checked-in')
  fireEvent.click(screen.getByRole('button', { name: /check ticket/i }))
  expect(screen.getByText(/already used/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /record check-in/i })).toBeNull()
})

test('reception: on-hold ticket is not valid for entry', () => {
  useAppStore.getState().setRole('reception')
  openStaff('/staff/checkin')
  fireEvent.change(screen.getByLabelText(/booking reference or ticket code/i), { target: { value: 'MG-TEST-AXXX' } })
  fireEvent.click(screen.getByRole('button', { name: /check ticket/i }))
  expect(screen.getByText(/on hold — not valid for entry/i)).toBeInTheDocument()
})
