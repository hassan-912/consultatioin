import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { BookingPage } from './BookingPage'
import { useAppStore } from '../../store/useAppStore'
import type { Booking } from '../../domain/types'

const b = (status: Booking['status']): Booking => ({
  id: 'nc', reference: 'MG-NOCANCEL', qrToken: 'c'.repeat(32), manageToken: 'b'.repeat(32), consultantId: 'mohamed-gamal', branchId: 'nasr-city',
  format: 'in-person', durationMin: 45, startIso: new Date(Date.now() + 3 * 86400000).toISOString(), endIso: new Date(Date.now() + 3 * 86400000 + 2700000).toISOString(),
  tz: 'Africa/Cairo', price: { amount: 1000, currency: 'EGP' },
  customer: { name: 'Sara Ali', phone: '+201001234567', email: '', channel: 'whatsapp', consultationLang: 'en', program: '', note: '' },
  status, holdExpiresAt: Date.now() + 600000, createdAt: Date.now(),
})
const open = () => render(<MemoryRouter initialEntries={[`/booking/${'b'.repeat(32)}`]}><Routes><Route path="/booking/:token" element={<BookingPage />} /></Routes></MemoryRouter>)

beforeEach(() => useAppStore.getState().setLang('en'))

test('a confirmed booking (ticket issued) has no Cancel booking button', async () => {
  useAppStore.setState({ bookings: { nc: b('confirmed') }, seeded: true, timeOffsetMs: 0 })
  open()
  await screen.findAllByText('MG-NOCANCEL')
  expect(screen.queryByRole('button', { name: 'Cancel booking' })).toBeNull()
})

test('a booking under payment review can still be cancelled', async () => {
  useAppStore.setState({ bookings: { nc: b('on-hold') }, seeded: true, timeOffsetMs: 0 })
  open()
  expect(await screen.findByRole('button', { name: 'Cancel booking' })).toBeInTheDocument()
})
