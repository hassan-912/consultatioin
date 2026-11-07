import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PaymentStep } from './PaymentStep'
import { useAppStore } from '../../../store/useAppStore'
import { resetFxRates } from '../../../data/fxRates'
import { HoldExpired, RepoError } from '../../../data'
import type { Booking } from '../../../domain/types'

const b = (phone: string): Booking => ({
  id: 'p1', reference: 'MG-PAY1-TEST', qrToken: 'q'.repeat(32), manageToken: 'm'.repeat(32), consultantId: 'mohamed-gamal', branchId: 'nasr-city',
  format: 'online', durationMin: 30, startIso: new Date(Date.now() + 864e5).toISOString(), endIso: new Date(Date.now() + 882e5).toISOString(),
  tz: 'Africa/Cairo', price: { amount: 1000, currency: 'EGP' },
  customer: { name: 'Sara', phone, email: '', channel: 'whatsapp', consultationLang: 'en', program: 'tourism', note: '' },
  status: 'reserved', holdExpiresAt: Date.now() + 15 * 60000, createdAt: Date.now(),
})
const show = (phone: string, onPay = vi.fn().mockResolvedValue(undefined)) => {
  render(<PaymentStep booking={b(phone)} onPay={onPay} onExpiredRestart={() => {}} />)
  return onPay
}

beforeEach(() => { useAppStore.getState().setLang('en'); useAppStore.setState({ timeOffsetMs: 0 }); resetFxRates() })
afterEach(() => { vi.unstubAllGlobals(); resetFxRates() })

test('Egyptian numbers pay in EGP; no manual transfer details are shown', () => {
  const onPay = show('+201001234567')
  expect(screen.getByRole('radio', { name: 'EGP' })).toBeChecked()
  expect(screen.getByTestId('pay-amount')).toHaveTextContent(/1,000/)
  expect(screen.queryByText(/instapay|vodafone|iban|transaction reference/i)).toBeNull()
  for (const m of ['Credit & debit cards', 'Mobile wallets', 'Meeza', 'Apple Pay']) expect(screen.getByText(m)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /pay .* securely/i }))
  expect(onPay).toHaveBeenCalledWith('EGP')
})

test('UAE numbers start in AED at the live rate, rounded up; the customer can switch currency', () => {
  resetFxRates({ AED: 0.0752, USD: 0.0205, EUR: 0.0189 })
  const onPay = show('+971501234567')
  expect(screen.getByRole('radio', { name: 'AED' })).toBeChecked()
  expect(screen.getByTestId('pay-amount')).toHaveTextContent(/AED\s*76|76\s*AED/) // 1000 × 0.0752 = 75.2 → 76
  expect(screen.getByText(/today’s exchange rate/i)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('radio', { name: 'EUR' }))
  expect(screen.getByTestId('pay-amount')).toHaveTextContent('€19')
  fireEvent.click(screen.getByRole('button', { name: /pay .* securely/i }))
  expect(onPay).toHaveBeenCalledWith('EUR')
})

test('other countries default to USD, fetching today’s rate', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: 'success', base_code: 'EGP', rates: { AED: 0.075, USD: 0.0204, EUR: 0.0188 } }) }))
  show('+447700900123')
  expect(screen.getByRole('radio', { name: 'USD' })).toBeChecked()
  await waitFor(() => expect(screen.getByTestId('pay-amount')).toHaveTextContent('$21'))
})

test('a failed start shows the reason; an expired hold switches to the expired screen', async () => {
  show('+201001234567', vi.fn().mockRejectedValue(new RepoError('PAYMENT_UNAVAILABLE')))
  fireEvent.click(screen.getByRole('button', { name: /pay .* securely/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/online payment is unavailable/i)
})

test('an expired hold from the server shows the expired screen', async () => {
  show('+201001234567', vi.fn().mockRejectedValue(new HoldExpired()))
  fireEvent.click(screen.getByRole('button', { name: /pay .* securely/i }))
  expect(await screen.findByText('Reservation expired')).toBeInTheDocument()
})
