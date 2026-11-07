import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PayReturnPage } from './PayReturnPage'
import { useAppStore } from '../../store/useAppStore'
import { forgetPayment, rememberPayment } from '../../data/pendingPayment'
import type { Booking, BookingStatus } from '../../domain/types'

const TOKEN = 'b'.repeat(32)
const booking = (status: BookingStatus): Booking => ({
  id: 'r1', reference: 'MG-RET1-TEST', qrToken: 'q'.repeat(32), manageToken: TOKEN, consultantId: 'mohamed-gamal', branchId: 'nasr-city',
  format: 'online', durationMin: 30, startIso: new Date(Date.now() + 864e5).toISOString(), endIso: new Date(Date.now() + 882e5).toISOString(),
  tz: 'Africa/Cairo', price: { amount: 1000, currency: 'EGP' },
  customer: { name: 'Sara', phone: '+201001234567', email: '', channel: 'whatsapp', consultationLang: 'en', program: 'tourism', note: '' },
  status, holdExpiresAt: Date.now() + 15 * 60000, createdAt: Date.now(),
})
const open = (status: BookingStatus | null, query = '') => {
  if (status) useAppStore.setState({ bookings: { r1: booking(status) } })
  render(
    <MemoryRouter initialEntries={[`/pay/return${query}`]}>
      <Routes>
        <Route path="/pay/return" element={<PayReturnPage />} />
        <Route path="/ticket/:token" element={<p>TICKET PAGE</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => { useAppStore.getState().setLang('en'); useAppStore.setState({ bookings: {}, seeded: true, timeOffsetMs: 0 }); rememberPayment(TOKEN, 'mohamed-gamal') })
afterEach(() => forgetPayment())

test('a confirmed booking goes straight to its ticket and forgets the pending payment', async () => {
  open('confirmed', '?status=success')
  expect(await screen.findByText('TICKET PAGE')).toBeInTheDocument()
})

test('the unsigned ?status=success alone never confirms: a still-unpaid booking keeps waiting', async () => {
  open('reserved', '?status=success')
  expect(await screen.findByText(/confirming your payment/i)).toBeInTheDocument()
  expect(screen.queryByText('TICKET PAGE')).toBeNull()
})

test('a failed payment offers to try again while the hold lasts', async () => {
  open('reserved', '?status=failed')
  expect(await screen.findByText(/didn’t go through/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /try again/i })).toHaveAttribute('href', `/booking/${TOKEN}`)
})

test('a payment finance must look at says so', async () => {
  open('wrong-amount')
  expect(await screen.findByText(/our team will contact you/i)).toBeInTheDocument()
})

test('no pending payment on this device', () => {
  forgetPayment()
  open(null)
  expect(screen.getByText(/no payment in progress/i)).toBeInTheDocument()
})
