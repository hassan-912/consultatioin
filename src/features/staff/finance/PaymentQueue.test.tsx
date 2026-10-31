import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { StaffApp } from '../StaffApp'
import { useAppStore, todayIn } from '../../../store/useAppStore'
import { loginAs } from '../../../test/loginAs'
import { zonedDateTimeToIso } from '../../../domain/time'
import type { Booking } from '../../../domain/types'

const today = todayIn('Africa/Cairo')
const mk = (id: string, customer: Partial<Booking['customer']>): Booking => ({
  id, reference: `MG-SEND-${id.toUpperCase()}`, qrToken: id.padEnd(32, '0'), manageToken: `m${id}`.padEnd(32, '0'),
  consultantId: 'mohamed-gamal', branchId: 'nasr-city', format: 'in-person', durationMin: 30,
  startIso: zonedDateTimeToIso(today, 23 * 60, 'Africa/Cairo'), endIso: zonedDateTimeToIso(today, 23 * 60 + 30, 'Africa/Cairo'),
  tz: 'Africa/Cairo', price: { amount: 1000, currency: 'EGP' },
  customer: { name: `Customer ${id}`, phone: '+201001234567', email: 'c@example.com', channel: 'whatsapp', consultationLang: 'en', program: 'immigration', note: '', ...customer },
  status: 'confirmed', holdExpiresAt: Date.now() + 1e6, createdAt: Date.now(),
  payment: { method: 'instapay', txnRef: `TX-${id}`, submittedAt: Date.now() },
})
const openToSend = () => {
  render(<MemoryRouter initialEntries={['/staff/payments']}><Routes><Route path="/staff/*" element={<StaffApp />} /></Routes></MemoryRouter>)
  fireEvent.click(screen.getByRole('tab', { name: /to send/i }))
}

beforeEach(() => {
  try { localStorage.clear() } catch { /* ignore */ }
  useAppStore.getState().setLang('en')
  loginAs('finance')
})

test('finance can send by email even when the customer preferred WhatsApp', () => {
  useAppStore.setState({ seeded: true, audit: [], timeOffsetMs: 0, bookings: { w: mk('w', { channel: 'whatsapp' }) } })
  openToSend()
  const card = screen.getByRole('article', { name: 'MG-SEND-W' })
  expect(within(card).getByRole('radio', { name: 'WhatsApp' })).toBeChecked()
  fireEvent.click(within(card).getByRole('radio', { name: 'Email' }))
  fireEvent.click(within(card).getByRole('button', { name: /send by email/i }))
  expect(useAppStore.getState().bookings.w.ticketSentVia).toBe('email')
})

test('finance can switch an email-preferring customer to WhatsApp; email is disabled without an address', () => {
  useAppStore.setState({ seeded: true, audit: [], timeOffsetMs: 0, bookings: { e: mk('e', { channel: 'email' }), n: mk('n', { channel: 'whatsapp', email: '' }) } })
  openToSend()
  const emailCard = screen.getByRole('article', { name: 'MG-SEND-E' })
  expect(within(emailCard).getByRole('radio', { name: 'Email' })).toBeChecked()
  fireEvent.click(within(emailCard).getByRole('radio', { name: 'WhatsApp' }))
  expect(within(emailCard).getByLabelText(/your name/i)).toBeInTheDocument()
  expect(within(screen.getByRole('article', { name: 'MG-SEND-N' })).getByRole('radio', { name: 'Email' })).toBeDisabled()
})
