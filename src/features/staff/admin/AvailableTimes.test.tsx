import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { StaffApp } from '../StaffApp'
import { useAppStore, todayIn } from '../../../store/useAppStore'
import { loginAs } from '../../../test/loginAs'
import { getRules } from '../../../store/actions'
import { slotsFor } from '../../shared/availability'
import { addDays, weekday } from '../../../domain/time'
import { bookableTimes } from './FreeSlotsAdmin'

const open = (path = '/staff/available-times') =>
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/staff/*" element={<StaffApp />} /></Routes></MemoryRouter>)

const ID = 'mohamed-gamal'
const pick = () => fireEvent.change(screen.getByLabelText('Consultant'), { target: { value: ID } })
const openDay = () => {
  for (let i = 1; i < 14; i++) {
    const d = addDays(todayIn('Africa/Cairo'), i)
    if (slotsFor(ID, d, 'online').length) return d
  }
  throw new Error('no open day')
}

beforeEach(() => {
  useAppStore.getState().setLang('en')
  useAppStore.setState({ seeded: true, audit: [], bookings: {}, consultantOverrides: {}, scheduleOverrides: {}, records: {} })
})

test('bookable times are on the hour and skip the break', () => {
  expect(bookableTimes(12 * 60, 16 * 60)).toEqual([720, 780, 840, 900])
  expect(bookableTimes(12 * 60, 16 * 60, { start: 13 * 60, end: 14 * 60 })).toEqual([720, 840, 900])
})

test('the old Calendar & availability screen is gone', () => {
  loginAs('admin')
  open('/staff')
  expect(screen.queryByRole('link', { name: /calendar & availability/i })).toBeNull()
  expect(screen.getAllByRole('link', { name: /available times/i }).length).toBeGreaterThan(0)
})

test('the admin edits a consultant\'s working hours', async () => {
  loginAs('admin')
  open()
  pick()
  const day = weekday(openDay())
  const name = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]
  fireEvent.change(screen.getByLabelText(`${name} from`), { target: { value: String(10 * 60) } })
  fireEvent.change(screen.getByLabelText(`${name} to`), { target: { value: String(12 * 60) } })
  fireEvent.click(screen.getByRole('button', { name: /save hours/i }))
  expect(await screen.findByText(/customers see the new times/i)).toBeInTheDocument()
  expect(getRules(ID, useAppStore.getState().scheduleOverrides).weekly[day]).toEqual([{ start: 600, end: 720 }])
})

test('the admin gives a day off, then takes it back', async () => {
  const d = openDay()
  loginAs('admin')
  open()
  pick()
  const box = screen.getByRole('region', { name: 'Days off' })
  fireEvent.change(within(box).getByLabelText('Day off from'), { target: { value: d } })
  fireEvent.click(within(box).getByRole('button', { name: /add day off/i }))
  expect(await within(box).findByText('Day off added.')).toBeInTheDocument()
  expect(slotsFor(ID, d, 'online')).toEqual([])
  const item = within(box).getAllByRole('listitem').find(li => within(li).queryByRole('button', { name: /remove/i }))!
  const before = within(box).getAllByRole('button', { name: /remove/i }).length
  fireEvent.click(within(item).getByRole('button', { name: /remove/i }))
  await waitFor(() => expect(within(box).queryAllByRole('button', { name: /remove/i }).length).toBe(before - 1))
})

test('the admin blocks one time; customers can no longer book it; unblocking opens it again', async () => {
  const d = openDay()
  const first = slotsFor(ID, d, 'online')[0]
  loginAs('admin')
  open()
  pick()
  const box = screen.getByRole('region', { name: 'Block a time' })
  fireEvent.change(within(box).getByLabelText('Date'), { target: { value: d } })
  const hh = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Cairo' }).format(new Date(first.startIso))
  fireEvent.click(within(box).getByRole('button', { name: `${hh} — Open` }))
  expect(await within(box).findByRole('button', { name: `${hh} — Blocked` })).toBeInTheDocument()
  expect(slotsFor(ID, d, 'online').some(s => s.startIso === first.startIso)).toBe(false)
  fireEvent.click(within(box).getByRole('button', { name: `${hh} — Blocked` }))
  expect(await within(box).findByRole('button', { name: `${hh} — Open` })).toBeInTheDocument()
  expect(slotsFor(ID, d, 'online').some(s => s.startIso === first.startIso)).toBe(true)
})

test('the admin turns in-person off but cannot turn both formats off', async () => {
  loginAs('admin')
  open()
  pick()
  const box = screen.getByRole('region', { name: 'Formats offered' })
  const boxes = within(box).getAllByRole('checkbox')
  boxes.forEach(b => { if ((b as HTMLInputElement).checked) fireEvent.click(b) })
  await waitFor(() => expect(getRules(ID, useAppStore.getState().scheduleOverrides).formats.length).toBe(1))
})

