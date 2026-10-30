import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { BookingPage } from './BookingPage'
import { FindBookingPage } from './FindBookingPage'
import { useAppStore } from '../../store/useAppStore'
import type { Booking } from '../../domain/types'

const base: Booking = {
  id: 'b1', reference: 'MG-ABCD-EFGH', qrToken: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6', manageToken: 'f'.repeat(32),
  consultantId: 'mohamed-gamal', branchId: 'nasr-city', format: 'online', durationMin: 30,
  startIso: new Date(Date.now() + 86400000).toISOString(), endIso: new Date(Date.now() + 86400000 + 1800000).toISOString(),
  tz: 'Africa/Cairo', price: { amount: 900, currency: 'EGP' },
  customer: { name: 'Sara Ali', phone: '+201001234567', email: 'sara@example.com', channel: 'email', consultationLang: 'ar', program: 'immigration', note: '' },
  status: 'on-hold', holdExpiresAt: Date.now() + 1e6, createdAt: Date.now(),
  payment: { method: 'instapay', txnRef: 'TX1', submittedAt: Date.now() },
}

const put = (b: Partial<Booking>) => useAppStore.setState({ bookings: { b1: { ...base, ...b } }, seeded: true })

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/booking/:token" element={<BookingPage />} />
        <Route path="/ticket/:token" element={<BookingPage />} />
        <Route path="/find" element={<FindBookingPage />} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => useAppStore.getState().setLang('en'))

test('QR holds only the random token — no name, phone or meeting link', () => {
  put({ status: 'confirmed', meetingUrl: '#/meet/secret-room' })
  open(`/ticket/${base.manageToken}`)
  const qr = document.querySelector('[data-qr-value]')!.getAttribute('data-qr-value')!
  expect(qr).toBe(base.qrToken)
  expect(qr).not.toMatch(/Sara|\+20|meet/)
})

test('on-hold ticket shows the hold banner, not-valid notice and no Join button', () => {
  put({ status: 'on-hold' })
  open(`/ticket/${base.manageToken}`)
  expect(screen.getAllByText('On hold – Payment under review').length).toBeGreaterThan(0)
  expect(screen.getByText(/not valid for entry/i)).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /join consultation/i })).toBeNull()
})

test('confirmed online booking shows Join consultation', () => {
  put({ status: 'confirmed', meetingUrl: '#/meet/abc' })
  open(`/booking/${base.manageToken}`)
  expect(screen.getAllByText('Booking confirmed').length).toBeGreaterThan(0)
  expect(screen.getByRole('link', { name: /join consultation/i })).toBeInTheDocument()
})

test('find booking accepts Arabic-Indic digits in the phone', async () => {
  put({ status: 'confirmed' })
  open('/find')
  fireEvent.change(screen.getByLabelText(/booking reference/i), { target: { value: 'mg-abcd-efgh' } })
  fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '+٢٠١٠٠١٢٣٤٥٦٧' } })
  fireEvent.click(screen.getByRole('button', { name: /find booking/i }))
  expect(await screen.findByText('MG-ABCD-EFGH', {}, { timeout: 2000 })).toBeInTheDocument()
})

test('wrong phone gives a clear not-found message', () => {
  put({ status: 'confirmed' })
  open('/find')
  fireEvent.change(screen.getByLabelText(/booking reference/i), { target: { value: 'MG-ABCD-EFGH' } })
  fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '+201009999999' } })
  fireEvent.click(screen.getByRole('button', { name: /find booking/i }))
  expect(screen.getByText('No booking found with these details.')).toBeInTheDocument()
})

test('unknown token shows not found', () => {
  useAppStore.setState({ bookings: {}, seeded: true })
  open('/booking/nope')
  expect(screen.getByText('No booking found with these details.')).toBeInTheDocument()
})
