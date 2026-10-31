import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ConnectionIndicator, NewPaymentNotice, PaymentBadge } from './paymentAlerts'
import { useAppStore } from '../../../store/useAppStore'
import { useLiveData } from '../../../data/liveState'
import { loginAs } from '../../../test/loginAs'
import type { Booking } from '../../../domain/types'

vi.mock('../../../data/mode', () => ({ isLive: true, uiStorageKey: 'test-live' }))

const mk = (id: string, status: Booking['status'] = 'on-hold'): Booking => ({
  id, reference: `MG-LIVE-${id}`, qrToken: '', manageToken: '', consultantId: 'x', branchId: 'nasr-city', format: 'in-person', durationMin: 30,
  startIso: new Date().toISOString(), endIso: new Date().toISOString(), tz: 'Africa/Cairo', price: { amount: 1, currency: 'EGP' },
  customer: { name: 'N', phone: '1', email: '', channel: 'email', consultationLang: 'en', program: '', note: '' },
  status, holdExpiresAt: 0, createdAt: Date.now(), payment: { method: 'instapay', txnRef: 'T', submittedAt: Date.now() },
})
const byId = (...b: Booking[]) => Object.fromEntries(b.map(x => [x.id, x]))

beforeEach(() => {
  useAppStore.getState().setLang('en')
  loginAs('finance')
  useLiveData.setState({ bookings: {}, staffKey: null, loading: true, error: null, connection: 'idle' })
})

test('live: snapshot after loading seeds silently, then a new on-hold row is announced; badge follows live data', () => {
  render(<MemoryRouter><PaymentBadge /><NewPaymentNotice /></MemoryRouter>)
  act(() => useLiveData.setState({ bookings: byId(mk('a')), staffKey: 'k', loading: false }))
  expect(screen.queryByText(/new payment received/i)).toBeNull()
  expect(screen.getByLabelText('1 payments awaiting review')).toBeInTheDocument()
  act(() => useLiveData.setState({ bookings: byId(mk('a'), mk('b')) }))
  expect(screen.getByText('New payment received — MG-LIVE-b')).toBeInTheDocument()
  expect(screen.getByLabelText('2 payments awaiting review')).toBeInTheDocument()
})

test('live: a hydration reset re-seeds instead of announcing the whole queue', () => {
  render(<MemoryRouter><NewPaymentNotice /></MemoryRouter>)
  act(() => useLiveData.setState({ bookings: byId(mk('a')), staffKey: 'k1', loading: false }))
  act(() => useLiveData.setState({ bookings: {}, staffKey: 'k2', loading: true }))
  act(() => useLiveData.setState({ bookings: byId(mk('a'), mk('z')), staffKey: 'k2', loading: false }))
  expect(screen.queryByText(/new payment received/i)).toBeNull()
})

test('live: a visible, announced reconnecting indicator appears when the subscription drops and clears on recovery', () => {
  render(<ConnectionIndicator />)
  expect(screen.queryByText(/reconnecting/i)).toBeNull()
  act(() => useLiveData.setState({ connection: 'connected' }))
  expect(screen.queryByText(/reconnecting/i)).toBeNull()
  act(() => useLiveData.setState({ connection: 'reconnecting' }))
  const msg = screen.getByText(/live updates are disconnected/i)
  expect(msg.closest('[aria-live]')).toHaveAttribute('aria-live', 'polite')
  act(() => useLiveData.setState({ connection: 'connected' }))
  expect(screen.queryByText(/reconnecting/i)).toBeNull()
})
