import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { StaffApp } from '../features/staff/StaffApp'
import { useBookingLookup } from './useBookings'
import { useSlots, useStaffHydration } from './hooks'
import { repo } from './index'
import { useAppStore } from '../store/useAppStore'
import { useLiveData } from './liveState'
import type { Booking } from '../domain/types'
import { signIn } from '../store/auth'

vi.mock('./mode', () => ({ isLive: true, uiStorageKey: 'mg-live-ui-v1' }))
vi.mock('./index', () => ({ repo: {
  getByManageToken: vi.fn(), availableSlots: vi.fn(), staffList: vi.fn(), staffRecords: vi.fn(), staffAudit: vi.fn(), staffSchedules: vi.fn(), subscribe: vi.fn(),
} }))
const booking = { id: 'real', manageToken: 'real-token', status: 'confirmed' } as Booking
beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState({ staffSession: null, bookings: { prototype: { ...booking, id: 'prototype', manageToken: 'prototype-token' } }, audit: [], records: {} })
  useLiveData.setState({ bookings: {}, records: {}, audit: [], schedules: {}, metadata: null, error: null, actionError: null, loading: true })
  vi.mocked(repo.subscribe).mockReturnValue(vi.fn())
})
test('live customer lookup ignores prototype data and distinguishes loading, missing, failure and success', async () => {
  let resolve!: (b: Booking | null) => void
  vi.mocked(repo.getByManageToken).mockImplementation(() => new Promise(r => { resolve = r }))
  const { result, rerender } = renderHook(({ token }) => useBookingLookup(token), { initialProps: { token: 'prototype-token' } })
  expect(result.current.loading).toBe(true)
  expect(result.current.booking).toBeUndefined()
  await act(async () => resolve(null))
  expect(result.current).toMatchObject({ loading: false, booking: undefined, error: null })
  vi.mocked(repo.getByManageToken).mockRejectedValueOnce(new Error('network'))
  rerender({ token: 'failed' })
  await waitFor(() => expect(result.current.error).toBeTruthy())
  vi.mocked(repo.getByManageToken).mockResolvedValueOnce(booking)
  rerender({ token: 'real-token' })
  await waitFor(() => expect(result.current.booking).toEqual(booking))
  expect(useAppStore.getState().bookings).not.toHaveProperty('real')
})
test('late customer lookup cannot replace a different token and polling stops after unmount', async () => {
  vi.useFakeTimers()
  try {
    let resolveOld!: (b: Booking) => void
    vi.mocked(repo.getByManageToken).mockImplementation(token => token === 'old' ? new Promise(r => { resolveOld = r }) : Promise.resolve(booking))
    const { result, rerender, unmount } = renderHook(({ token }) => useBookingLookup(token), { initialProps: { token: 'old' } })
    rerender({ token: 'real-token' })
    await act(async () => {})
    await act(async () => resolveOld({ ...booking, id: 'old' }))
    expect(result.current.booking?.id).toBe('real')
    await act(async () => vi.advanceTimersByTime(5000))
    expect(repo.getByManageToken).toHaveBeenCalledTimes(3)
    unmount()
    await act(async () => vi.advanceTimersByTime(5000))
    expect(repo.getByManageToken).toHaveBeenCalledTimes(3)
  } finally { vi.useRealTimers() }
})
test('live slot picker passes the reschedule capability and clears stale slots on errors', async () => {
  vi.mocked(repo.availableSlots).mockResolvedValueOnce([{ startIso: 'server-slot', endIso: 'server-end' }])
  const { result, rerender } = renderHook(({ date }) => useSlots('mohamed-gamal', date, 'online', 30, 'booking-id', 'capability'), { initialProps: { date: '2026-11-01' } })
  await waitFor(() => expect(result.current.slots).toHaveLength(1))
  expect(repo.availableSlots).toHaveBeenCalledWith('mohamed-gamal', '2026-11-01', 'online', 'capability')
  vi.mocked(repo.availableSlots).mockRejectedValueOnce(new Error('permission'))
  rerender({ date: '2026-11-02' })
  await waitFor(() => expect(result.current.error).toBeTruthy())
  expect(result.current.slots).toHaveLength(0)
  expect(result.current.loading).toBe(false)
})
test('staff hydration uses authorized rows, clears snapshots on logout, and keeps customer capabilities separate', async () => {
  const off = vi.fn()
  vi.mocked(repo.subscribe).mockReturnValue(off)
  vi.mocked(repo.staffList).mockResolvedValue([{ ...booking, manageToken: '', qrToken: '' }])
  vi.mocked(repo.staffAudit).mockResolvedValue([])
  vi.mocked(repo.staffSchedules).mockResolvedValue({})
  useAppStore.setState({ staffSession: { username: 'finance', role: 'finance', consultantId: null } })
  const { unmount } = renderHook(() => useStaffHydration())
  await waitFor(() => expect(useLiveData.getState().bookings.real).toBeTruthy())
  expect(useLiveData.getState().staffKey).toBe(JSON.stringify(['finance', 'finance', null]))
  expect(repo.staffRecords).not.toHaveBeenCalled()
  expect(useLiveData.getState().bookings.real.manageToken).toBe('')
  unmount()
  expect(off).toHaveBeenCalledOnce()
  expect(useLiveData.getState().bookings).toEqual({})
  expect(useLiveData.getState().staffKey).toBeNull()
})
test('live UI persistence excludes bookings, records, audit, staff session and customer draft', () => {
  useAppStore.setState({ staffSession: { username: 'prototype', role: 'admin', consultantId: null }, records: { secret: { notes: 'private', outcome: 'none' } } })
  const stored = JSON.parse(localStorage.getItem('mg-live-ui-v1')!)
  expect(Object.keys(stored.state).sort()).toEqual(['filters', 'lang', 'senderName'])
  expect(localStorage.getItem('mg-proto-v1')).toBeNull()
})
test('live rehydration ignores staff session/records and leaves existing prototype persistence untouched', async () => {
  const prototype = JSON.stringify({ state: { bookings: { retained: 'original' } }, version: 0 })
  localStorage.setItem('mg-proto-v1', prototype)
  localStorage.setItem('mg-live-ui-v1', JSON.stringify({ state: { lang: 'en', staffSession: { username: 'admin', role: 'admin' }, bookings: { secret: booking }, records: { private: 'notes' } }, version: 0 }))
  useAppStore.setState({ staffSession: null, bookings: {}, records: {} })
  // Set the storage after setState, which persists only allowed UI keys.
  localStorage.setItem('mg-live-ui-v1', JSON.stringify({ state: { lang: 'en', staffSession: { username: 'admin', role: 'admin' }, bookings: { secret: booking }, records: { private: 'notes' } }, version: 0 }))
  await useAppStore.persist.rehydrate()
  expect(useAppStore.getState()).toMatchObject({ staffSession: null, bookings: {}, records: {}, lang: 'en' })
  expect(localStorage.getItem('mg-proto-v1')).toBe(prototype)
  expect(await signIn('admin', 'anything')).toBe(false)
})
test('a different staff identity cannot render the previous account snapshot while hydration starts', () => {
  useAppStore.getState().setLang('en')
  useAppStore.setState({ role: 'finance', staffSession: { username: 'new-finance', role: 'finance', consultantId: null } })
  useLiveData.setState({ staffKey: JSON.stringify(['old-admin', 'admin', null]), loading: false, bookings: { private: { ...booking, reference: 'MG-OLD-PRIVATE' } } })
  vi.mocked(repo.staffList).mockReturnValue(new Promise(() => {}))
  vi.mocked(repo.staffAudit).mockResolvedValue([])
  vi.mocked(repo.staffSchedules).mockResolvedValue({})
  render(<MemoryRouter initialEntries={['/staff/bookings']}><StaffApp /></MemoryRouter>)
  expect(screen.queryByText('MG-OLD-PRIVATE')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Loading')
})
