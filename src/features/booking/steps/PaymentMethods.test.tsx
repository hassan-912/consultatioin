import { render, screen, waitFor, within } from '@testing-library/react'
import { PaymentStep } from './PaymentStep'
import { useAppStore } from '../../../store/useAppStore'
import { resetFxRates } from '../../../data/fxRates'
import type { Booking } from '../../../domain/types'

const b = (phone: string): Booking => ({
  id: 'p1', reference: 'MG-PAY1-TEST', qrToken: 'q'.repeat(32), manageToken: 'm'.repeat(32), consultantId: 'mohamed-gamal', branchId: 'nasr-city',
  format: 'online', durationMin: 30, startIso: new Date(Date.now() + 864e5).toISOString(), endIso: new Date(Date.now() + 882e5).toISOString(),
  tz: 'Africa/Cairo', price: { amount: 1000, currency: 'EGP' },
  customer: { name: 'Sara', phone, email: '', channel: 'whatsapp', consultationLang: 'en', program: 'tourism', note: '' },
  status: 'reserved', holdExpiresAt: Date.now() + 15 * 60000, createdAt: Date.now(),
})
const show = (phone: string) => render(<PaymentStep booking={b(phone)} onSubmit={async () => {}} onExpiredRestart={() => {}} />)

beforeEach(() => { useAppStore.getState().setLang('en'); useAppStore.setState({ timeOffsetMs: 0 }); resetFxRates() })
afterEach(() => { vi.unstubAllGlobals(); resetFxRates() })

test('Egyptian numbers start on InstaPay with the real link; no placeholder warning', () => {
  show('+201001234567')
  expect(screen.getByRole('radio', { name: /instapay/i })).toBeChecked()
  expect(screen.getByRole('link', { name: /pay with instapay/i })).toHaveAttribute('href', 'https://ipn.eg/S/mostafa.elsayed912358/instapay/5kt4Qy')
  expect(screen.queryByText(/placeholders until the company/i)).toBeNull()
  expect(screen.getByText('Inside Egypt')).toBeInTheDocument()
  expect(screen.getByText('From outside Egypt')).toBeInTheDocument()
})

test('UAE numbers start on the AED account with the Mashreq details and a live-rate equivalent', async () => {
  resetFxRates({ AED: 0.0752, USD: 0.0205, EUR: 0.0189 })
  show('+971501234567')
  expect(screen.getByRole('radio', { name: /bank transfer · aed/i })).toBeChecked()
  for (const v of ['Mashreq Bank Dubai', 'MG I Portal', '019101981645', 'AE850330000019101981645']) expect(screen.getByText(v)).toBeInTheDocument()
  const box = screen.getByText(/approximate amount to transfer/i).parentElement as HTMLElement
  expect(within(box).getByText(/AED\s*76|76\s*AED/)).toBeInTheDocument() // 1000 × 0.0752 = 75.2 → rounded up
})

test('other countries start on the USD / EUR account at Banque du Caire with SWIFT', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: 'success', base_code: 'EGP', rates: { AED: 0.075, USD: 0.0204, EUR: 0.0188 } }) }))
  show('+447700900123')
  expect(screen.getByRole('radio', { name: /usd \/ eur/i })).toBeChecked()
  for (const v of ['Banque du Caire', 'MG IMMIGRATION', '01946010001238', 'EG560004119400001946010001238', 'BCAIEGCXXXX']) expect(screen.getByText(v)).toBeInTheDocument()
  await waitFor(() => expect(screen.getByText(/\$21/)).toBeInTheDocument())
  expect(screen.getByText(/€19/)).toBeInTheDocument()
})
