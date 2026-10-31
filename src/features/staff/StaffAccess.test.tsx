import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { StaffApp } from './StaffApp'
import { useAppStore, todayIn } from '../../store/useAppStore'
import { loginAs } from '../../test/loginAs'
import { zonedDateTimeToIso } from '../../domain/time'
import type { Booking } from '../../domain/types'

const today = todayIn('Africa/Cairo')
const mk = (id: string, consultantId: string): Booking => ({
  id, reference: `MG-OWN-${id.toUpperCase()}`, qrToken: id.padEnd(32, '0'), manageToken: `m${id}`.padEnd(32, '0'),
  consultantId, branchId: 'nasr-city', format: 'in-person', durationMin: 30,
  startIso: zonedDateTimeToIso(today, 23 * 60, 'Africa/Cairo'), endIso: zonedDateTimeToIso(today, 23 * 60 + 30, 'Africa/Cairo'),
  tz: 'Africa/Cairo', price: { amount: 1000, currency: 'EGP' },
  customer: { name: `Customer ${id}`, phone: '+201001234567', email: 'c@example.com', channel: 'email', consultationLang: 'ar', program: 'immigration', note: '' },
  status: 'confirmed', holdExpiresAt: Date.now() + 1e6, createdAt: Date.now(), payment: { method: 'instapay', txnRef: `TX-${id}`, submittedAt: Date.now() },
})

const openStaff = (path: string) =>
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/staff/*" element={<StaffApp />} /></Routes></MemoryRouter>)

beforeEach(() => {
  useAppStore.getState().setLang('en')
  useAppStore.setState({ seeded: true, audit: [], timeOffsetMs: 0, bookings: { a: mk('a', 'ahmed-tarek'), b: mk('b', 'mohamed-gamal') } })
})

test('admin sees the Staff accounts screen; prototype mode lists demo accounts read-only', () => {
  loginAs('admin')
  openStaff('/staff/staff-accounts')
  expect(screen.getAllByRole('link', { name: /staff accounts/i }).length).toBeGreaterThan(0)
  expect(screen.getByRole('heading', { name: /staff accounts/i })).toBeInTheDocument()
  expect(screen.getByText(/real invitations and role changes need the live site/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /send invitation/i })).toBeNull()
})

test('finance has no Staff accounts nav and is redirected away from the URL', () => {
  loginAs('finance')
  openStaff('/staff/staff-accounts')
  expect(screen.queryByRole('link', { name: /staff accounts/i })).toBeNull()
  expect(screen.queryByRole('heading', { name: /staff accounts/i })).toBeNull()
})

test('a consultant session only shows their own bookings', () => {
  loginAs('consultant', 'ahmed-tarek')
  openStaff('/staff/my-bookings')
  expect(screen.getByText(/Customer a/)).toBeInTheDocument()
  expect(screen.queryByText(/Customer b/)).toBeNull()
  expect(screen.queryByRole('link', { name: /staff accounts/i })).toBeNull()
})
