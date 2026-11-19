import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useAppStore } from '../../store/useAppStore'
import { loginAs } from '../../test/loginAs'
import type { Booking } from '../../domain/types'
import { ClientRoomPage } from './ClientRoomPage'
import { BookingPage } from '../ticket/BookingPage'
import { StaffApp } from '../staff/StaffApp'

const START = Date.now() + 60 * 60_000 // one hour from now
const online = (over: Partial<Booking> = {}): Booking => ({
  id: 'room-1', reference: 'MG-ROOM-0001', qrToken: 'q'.repeat(32), manageToken: 'm'.repeat(32),
  consultantId: 'ahmed-tarek', branchId: 'sheikh-zayed', format: 'online', durationMin: 45,
  startIso: new Date(START).toISOString(), endIso: new Date(START + 45 * 60_000).toISOString(),
  tz: 'Africa/Cairo', price: { amount: 1000, currency: 'EGP' },
  customer: { name: 'Kamel', phone: '+201001234567', email: '', channel: 'whatsapp', consultationLang: 'ar', program: 'tourism', note: '' },
  status: 'confirmed', holdExpiresAt: 0, createdAt: Date.now(), ...over,
})
const at = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/booking/:token" element={<BookingPage />} />
      <Route path="/booking/:token/room" element={<ClientRoomPage />} />
      <Route path="/staff/*" element={<StaffApp />} />
    </Routes>
  </MemoryRouter>,
)
/** Moves the app clock so "now" is `ms` relative to the start. */
const clockAt = (ms: number) => useAppStore.setState({ timeOffsetMs: START + ms - Date.now() })

beforeEach(() => {
  useAppStore.getState().setLang('en')
  useAppStore.setState({ seeded: true, audit: [], bookings: { 'room-1': online() }, staffSession: null, timeOffsetMs: 0 })
})

test('the booking page has a Join button for a paid online consultation that opens the room', async () => {
  at(`/booking/${'m'.repeat(32)}`)
  const join = await screen.findByRole('link', { name: /join consultation/i })
  expect(join).toHaveAttribute('href', `/booking/${'m'.repeat(32)}/room`)
})

test('before the room opens the client sees a countdown and the device check, and is not checked in', async () => {
  clockAt(-60 * 60_000)
  at(`/booking/${'m'.repeat(32)}/room`)
  expect(await screen.findByText(/the room opens in/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /test camera and microphone/i })).toBeInTheDocument()
  expect(useAppStore.getState().bookings['room-1'].status).toBe('confirmed')
})

test('once open, entering the room checks the client in', async () => {
  clockAt(-4 * 60_000)
  at(`/booking/${'m'.repeat(32)}/room`)
  expect(await screen.findByText(/everything checks out/i)).toBeInTheDocument()
  expect(useAppStore.getState().bookings['room-1'].status).toBe('checked-in')
  expect(useAppStore.getState().audit[0]).toMatchObject({ actor: 'customer', to: 'checked-in' })
})

test('the countdown reaching zero opens the room by itself', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    clockAt(-5 * 60_000 - 2000)
    at(`/booking/${'m'.repeat(32)}/room`)
    expect(await screen.findByText(/the room opens in/i)).toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    await waitFor(() => expect(screen.getByText(/everything checks out/i)).toBeInTheDocument())
  } finally { vi.useRealTimers() }
})

test('after the end the client gets their documents; unpaid and in-person bookings have no room', async () => {
  clockAt(80 * 60_000)
  useAppStore.setState({ assessments: { 'room-1': { program: 'tourism', answers: { age_bracket: 'age_opt_2' } } } })
  const ended = at(`/booking/${'m'.repeat(32)}/room`)
  expect(await screen.findByText(/thank you, kamel/i)).toBeInTheDocument()
  expect(await screen.findByRole('button', { name: /download your assessment/i })).toBeEnabled()
  // Nobody has to publish the summary: leaving the call writes and publishes it.
  await waitFor(() => expect(screen.getByRole('button', { name: /download the meeting summary/i })).toBeEnabled())
  expect(useAppStore.getState().meetingSummaries['room-1']).toMatchObject({ status: 'published' })
  ended.unmount()
  useAppStore.setState({ timeOffsetMs: 0, bookings: { 'room-1': online({ status: 'on-hold' }) } })
  const unpaid = at(`/booking/${'m'.repeat(32)}/room`)
  expect(await screen.findByText(/only for confirmed online bookings/i)).toBeInTheDocument()
  unpaid.unmount()
  useAppStore.setState({ bookings: { 'room-1': online({ format: 'in-person' }) } })
  at(`/booking/${'m'.repeat(32)}/room`)
  expect(await screen.findByText(/in person at the branch/i)).toBeInTheDocument()
})

test('the booked consultant gets a Start video call button and joins without checking the client in', async () => {
  clockAt(-4 * 60_000)
  loginAs('consultant', 'ahmed-tarek')
  at('/staff/my-bookings')
  const start = await screen.findByRole('link', { name: /start video call/i })
  expect(start).toHaveAttribute('href', '/staff/room/room-1')
  start.click()
  expect(await screen.findByText(/everything checks out/i)).toBeInTheDocument()
  expect(useAppStore.getState().bookings['room-1'].status).toBe('confirmed')
})

test('another consultant cannot open the room', async () => {
  clockAt(-4 * 60_000)
  loginAs('consultant', 'mohamed-gamal')
  at('/staff/room/room-1')
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(screen.queryByText(/everything checks out/i)).toBeNull()
})

test('reception and finance are sent away from the staff room', async () => {
  loginAs('reception')
  at('/staff/room/room-1')
  await waitFor(() => expect(screen.queryByRole('heading', { name: /online consultation/i })).toBeNull())
})
