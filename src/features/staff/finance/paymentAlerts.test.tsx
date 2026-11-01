import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { StaffApp } from '../StaffApp'
import { useAppStore } from '../../../store/useAppStore'
import { loginAs } from '../../../test/loginAs'
import { zonedDateTimeToIso } from '../../../domain/time'
import { todayIn } from '../../../store/useAppStore'
import type { Booking } from '../../../domain/types'

const today = todayIn('Africa/Cairo')
const mk = (id: string, over: Partial<Booking> = {}): Booking => ({
  id, reference: `MG-ALRT-${id.toUpperCase()}`, qrToken: id.padEnd(32, '0'), manageToken: `m${id}`.padEnd(32, '0'),
  consultantId: 'mohamed-gamal', branchId: 'nasr-city', format: 'in-person', durationMin: 30,
  startIso: zonedDateTimeToIso(today, 23 * 60, 'Africa/Cairo'), endIso: zonedDateTimeToIso(today, 23 * 60 + 30, 'Africa/Cairo'),
  tz: 'Africa/Cairo', price: { amount: 1000, currency: 'EGP' },
  customer: { name: `Customer ${id}`, phone: '+201001234567', email: 'c@example.com', channel: 'email', consultationLang: 'ar', program: 'immigration', note: '' },
  status: 'on-hold', holdExpiresAt: Date.now() + 1e6, createdAt: Date.now(),
  payment: { method: 'instapay', txnRef: `TX-${id}`, submittedAt: Date.now() }, ...over,
})
const openStaff = (path = '/staff') =>
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/staff/*" element={<StaffApp />} /></Routes></MemoryRouter>)
const badge = (n: number) => screen.queryAllByLabelText(`${n} payments awaiting review`)

beforeEach(() => {
  try { localStorage.clear() } catch { /* ignore */ }
  useAppStore.getState().setLang('en')
  useAppStore.setState({ seeded: true, audit: [], timeOffsetMs: 0, bookings: { a: mk('a'), b: mk('b', { status: 'confirmed' }), c: mk('c', { status: 'wrong-amount' }) } })
})

test('finance and admin see a live count badge on Payment review; reception does not', () => {
  loginAs('finance')
  const { unmount } = openStaff()
  expect(badge(2).length).toBeGreaterThan(0)
  expect(screen.getAllByRole('link', { name: /payment review/i })[0]).toHaveTextContent('2')
  act(() => useAppStore.setState(s => ({ bookings: { ...s.bookings, d: mk('d') } })))
  expect(badge(3).length).toBeGreaterThan(0)
  act(() => useAppStore.setState(s => ({ bookings: { ...s.bookings, a: { ...s.bookings.a, status: 'confirmed' }, c: { ...s.bookings.c, status: 'confirmed' }, d: { ...s.bookings.d, status: 'confirmed' } } })))
  expect(screen.queryAllByLabelText(/payments awaiting review/)).toHaveLength(0)
  unmount()
  useAppStore.setState({ bookings: { a: mk('a') } }); loginAs('admin'); openStaff(); expect(screen.queryAllByLabelText(/payments awaiting review/).length).toBeGreaterThan(0)
})

test('reception sees no badge and no payment notice', () => {
  loginAs('reception')
  openStaff()
  expect(screen.queryAllByLabelText(/payments awaiting review/)).toHaveLength(0)
  act(() => useAppStore.setState(s => ({ bookings: { ...s.bookings, d: mk('d') } })))
  expect(screen.queryByText(/new payment received/i)).toBeNull()
})

test('a newly arrived on-hold payment is announced politely with a link; existing items are not', () => {
  loginAs('finance')
  openStaff('/staff/payments')
  expect(screen.queryByText(/new payment received/i)).toBeNull()
  act(() => useAppStore.setState(s => ({ bookings: { ...s.bookings, d: mk('d') } })))
  const text = screen.getByText('New payment received — MG-ALRT-D')
  const region = text.closest('[aria-live="polite"]')!
  const link = within(region as HTMLElement).getByRole('link', { name: /open payment/i })
  expect(link.getAttribute('href')).toContain('/staff/payments?focus=d')
  fireEvent.click(link)
  expect(screen.queryByText(/new payment received/i)).toBeNull()
  expect(screen.getByRole('article', { name: 'MG-ALRT-D' })).toHaveFocus()
})

test('dismiss clears the notice and an already seen item does not re-announce', () => {
  loginAs('finance')
  openStaff('/staff/payments')
  act(() => useAppStore.setState(s => ({ bookings: { ...s.bookings, d: mk('d') } })))
  fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
  expect(screen.queryByText(/new payment received/i)).toBeNull()
  act(() => useAppStore.setState(s => ({ bookings: { ...s.bookings, d: { ...s.bookings.d } } })))
  expect(screen.queryByText(/new payment received/i)).toBeNull()
})

test('sound is on by default and desktop pop-up permission is only requested on click', () => {
  const request = vi.fn()
  vi.stubGlobal('Notification', Object.assign(vi.fn(), { requestPermission: request, permission: 'default' }))
  loginAs('finance')
  openStaff('/staff/payments')
  expect(screen.getByRole('checkbox', { name: /play a sound/i })).toBeChecked()
  act(() => useAppStore.setState(s => ({ bookings: { ...s.bookings, d: mk('d') } })))
  expect(request).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /show desktop pop-ups/i }))
  expect(request).toHaveBeenCalledTimes(1)
  vi.unstubAllGlobals()
})

test('Arabic strings render with the badge', () => {
  useAppStore.getState().setLang('ar')
  loginAs('finance')
  openStaff()
  expect(screen.queryAllByLabelText(/مدفوعات بانتظار المراجعة/).length).toBeGreaterThan(0)
})
