import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { StaffApp } from './StaffApp'
import { useAppStore } from '../../store/useAppStore'
import { loginAs } from '../../test/loginAs'
import { getConsultant } from '../../store/actions'
import { slotsFor } from '../shared/availability'
import { addDays } from '../../domain/time'
import { todayIn } from '../../store/useAppStore'
import { publicTotals } from '../../domain/stats'
import { buildSeed } from '../../demo/seed'

const openStaff = (path: string) =>
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/staff/*" element={<StaffApp />} /></Routes></MemoryRouter>)

beforeEach(() => {
  useAppStore.getState().setLang('en')
  useAppStore.setState({
    seeded: true, audit: [], bookings: buildSeed(Date.now()), consultantOverrides: {}, scheduleOverrides: {}, records: {},
  })
})

test('admin edits Mohamed Esmail spelling; directory data updates and edit is audited', () => {
  loginAs('admin')
  openStaff('/staff/consultants')
  expect(screen.getByText('Spelling to confirm')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /edit profile.*mohamed esmail/i }))
  fireEvent.change(screen.getByLabelText('Name (English)'), { target: { value: 'Mohamed Ismail' } })
  fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
  expect(getConsultant('mohamed-esmail').name.en).toBe('Mohamed Ismail')
  expect(useAppStore.getState().audit[0]).toMatchObject({ actor: 'admin', action: 'edited' })
})

test('adding leave removes slots for those dates', () => {
  const day = (() => {
    for (let i = 1; i < 14; i++) {
      const d = addDays(todayIn('Africa/Cairo'), i)
      if (slotsFor('mohamed-gamal', d, 'online').length) return d
    }
    throw new Error('none')
  })()
  loginAs('admin')
  openStaff('/staff/availability')
  fireEvent.change(screen.getByLabelText('From'), { target: { value: day } })
  fireEvent.change(screen.getByLabelText('To'), { target: { value: day } })
  fireEvent.click(screen.getByRole('button', { name: /add leave/i }))
  expect(slotsFor('mohamed-gamal', day, 'online')).toEqual([])
})

test('consultant marks completed (counts) vs no-show (does not count)', () => {
  const s = useAppStore.getState()
  const confirmed = Object.values(s.bookings).filter(b => b.status === 'confirmed' && b.consultantId === 'mohamed-gamal')
  expect(confirmed.length).toBeGreaterThanOrEqual(2)
  const before = publicTotals(Object.values(s.bookings), 'mohamed-gamal', Date.now()).total
  loginAs('consultant', 'mohamed-gamal')
  openStaff('/staff/my-bookings')
  fireEvent.click(screen.getAllByRole('button', { name: /mark no-show/i })[0])
  expect(publicTotals(Object.values(useAppStore.getState().bookings), 'mohamed-gamal', Date.now()).total).toBe(before)
  fireEvent.click(screen.getAllByRole('button', { name: /mark completed/i })[0])
  expect(publicTotals(Object.values(useAppStore.getState().bookings), 'mohamed-gamal', Date.now()).total).toBe(before + 1)
})

test('consultant role sees only their own bookings', () => {
  loginAs('consultant', 'mohamed-abdelaziz')
  openStaff('/staff/my-bookings')
  const refs = screen.getAllByRole('article').map(a => a.getAttribute('aria-label'))
  const own = Object.values(useAppStore.getState().bookings).filter(b => b.consultantId === 'mohamed-abdelaziz').map(b => b.reference)
  expect(refs.every(r => own.includes(r!))).toBe(true)
})

test('pending decisions board lists unresolved items', () => {
  loginAs('admin')
  openStaff('/staff/decisions')
  expect(screen.getAllByText('Unresolved').length).toBeGreaterThanOrEqual(10)
})

test('audit log shows actions', () => {
  useAppStore.getState().addAudit({ actor: 'finance', action: 'transition', bookingRef: 'MG-AAAA-BBBB', from: 'on-hold', to: 'confirmed' })
  loginAs('admin')
  openStaff('/staff/audit')
  expect(screen.getByText('MG-AAAA-BBBB')).toBeInTheDocument()
})
