import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { StaffApp } from '../StaffApp'
import { useAppStore, todayIn } from '../../../store/useAppStore'
import { loginAs } from '../../../test/loginAs'
import { addDays, zonedDateTimeToIso } from '../../../domain/time'
import type { Booking, BookingStatus } from '../../../domain/types'
import { permissions } from '../permissions'

const writeXlsxFile = vi.fn()
vi.mock('write-excel-file/browser', () => ({ default: (...args: unknown[]) => { writeXlsxFile(...args); return { toFile: vi.fn().mockResolvedValue(undefined) } } }))

const today = todayIn('Africa/Cairo')
const mk = (id: string, name: string, over: Partial<Booking> & { day?: string; minutes?: number; status?: BookingStatus } = {}): Booking => {
  const day = over.day ?? today, minutes = over.minutes ?? 12 * 60
  return {
    id, reference: `MG-${id.toUpperCase()}`, qrToken: '', manageToken: '', consultantId: 'mohamed-gamal', branchId: 'nasr-city', format: 'in-person', durationMin: 30,
    startIso: zonedDateTimeToIso(day, minutes, 'Africa/Cairo'), endIso: zonedDateTimeToIso(day, minutes + 30, 'Africa/Cairo'), tz: 'Africa/Cairo',
    price: { amount: 1000, currency: 'EGP' },
    customer: { name, phone: '+201001234567', email: `${id}@example.com`, channel: 'whatsapp', consultationLang: 'en', program: 'tourism', note: '' },
    status: 'confirmed', holdExpiresAt: 0, createdAt: Date.now(), ...over,
  }
}
const open = () => render(<MemoryRouter initialEntries={['/staff/customers']}><Routes><Route path="/staff/*" element={<StaffApp />} /></Routes></MemoryRouter>)
const names = () => screen.queryAllByRole('rowheader').map(c => c.textContent)

beforeEach(() => {
  writeXlsxFile.mockClear()
  useAppStore.getState().setLang('en')
  useAppStore.setState({
    seeded: true, audit: [], timeOffsetMs: 0, bookings: {
      a: mk('a', 'Sara Ali', { minutes: 14 * 60, salesName: 'Aya Ashraf', consultantId: 'ahmed-salama' }),
      b: mk('b', 'Omar Adel', { minutes: 11 * 60, status: 'checked-in' }),
      c: mk('c', 'Old Client', { day: addDays(today, -3) }),
      held: mk('held', 'Never Paid', { status: 'reserved' }),
      gone: mk('gone', 'Expired Hold', { status: 'expired' }),
    },
  })
})

test('reception and finance (and admin) have the customers sheet; sales and consultants do not', () => {
  for (const role of ['reception', 'finance', 'admin'] as const) expect(permissions[role]).toContain('customers')
  for (const role of ['sales', 'consultant'] as const) expect(permissions[role]).not.toContain('customers')
})

test('today’s customers in time order with contact, consultant and sales person; unpaid holds are left out', async () => {
  loginAs('reception')
  open()
  expect(await screen.findByRole('heading', { name: 'Customers sheet' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /today 2/i })).toHaveAttribute('aria-selected', 'true')
  expect(names()).toEqual(['Omar Adel', 'Sara Ali'])
  const sara = screen.getByRole('rowheader', { name: 'Sara Ali' }).closest('tr')!
  expect(within(sara).getByText('+201001234567')).toBeInTheDocument()
  expect(within(sara).getByText('a@example.com')).toBeInTheDocument()
  expect(within(sara).getByText('Ahmed Salama')).toBeInTheDocument()
  expect(within(sara).getByText('Aya Ashraf')).toBeInTheDocument()
  expect(screen.queryByText('Never Paid')).toBeNull()
  expect(screen.queryByText('Expired Hold')).toBeNull()
})

test('all customers, sorting, and search across any value in the sheet', async () => {
  loginAs('finance')
  open()
  fireEvent.click(await screen.findByRole('tab', { name: /all customers 3/i }))
  expect(names()).toEqual(['Sara Ali', 'Omar Adel', 'Old Client']) // newest first
  fireEvent.click(screen.getByRole('button', { name: /^customer/i }))
  expect(names()).toEqual(['Old Client', 'Omar Adel', 'Sara Ali'])
  const search = (value: string) => fireEvent.change(screen.getByLabelText('Search'), { target: { value } })
  search('0100 123'); expect(names()).toHaveLength(3) // phone digits
  search('sara'); expect(names()).toEqual(['Sara Ali']) // name
  search('aya ash'); expect(names()).toEqual(['Sara Ali']) // sales person
  search('ahmed salama'); expect(names()).toEqual(['Sara Ali']) // consultant
  search('checked in'); expect(names()).toEqual(['Omar Adel']) // status label
  search('mg-c'); expect(names()).toEqual(['Old Client']) // booking reference
  search('b@example'); expect(names()).toEqual(['Omar Adel']) // email
})

test('Excel-style column filters: tick values, chips show them, clear restores everything', async () => {
  loginAs('reception')
  open()
  fireEvent.click(await screen.findByRole('tab', { name: /all customers 3/i }))
  // Customer details have no filter; the other columns do.
  expect(screen.queryByRole('button', { name: 'Filter Customer' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Filter Phone' })).toBeNull()
  for (const c of ['Appointment', 'Branch', 'Consultant', 'Sales person', 'Status', 'Paid by', 'Booking ref']) expect(screen.getByRole('button', { name: `Filter ${c}` })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Filter Consultant' }))
  const menu = screen.getByRole('dialog', { name: 'Filter: Consultant' })
  expect(within(menu).getAllByRole('checkbox').map(c => c.closest('label')!.textContent)).toEqual(['Select all', 'Ahmed Salama1', 'Mohamed Gamal2'])
  fireEvent.click(within(menu).getByRole('checkbox', { name: /mohamed gamal/i }))
  expect(names()).toEqual(['Sara Ali'])
  fireEvent.click(within(menu).getByRole('button', { name: 'Done' }))
  expect(screen.getByRole('button', { name: 'Filter Consultant (on)' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Remove the Consultant filter' })).toHaveTextContent('Consultant 1')

  // Sales person filter lists the empty value too.
  fireEvent.click(screen.getByRole('button', { name: 'Remove the Consultant filter' }))
  expect(names()).toHaveLength(3)
  fireEvent.click(screen.getByRole('button', { name: 'Filter Sales person' }))
  const sales = screen.getByRole('dialog', { name: 'Filter: Sales person' })
  fireEvent.click(within(sales).getByRole('checkbox', { name: 'Select all' }))
  expect(names()).toEqual([])
  fireEvent.click(within(sales).getByRole('checkbox', { name: /no sales person/i }))
  expect(names()).toEqual(['Omar Adel', 'Old Client'])
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }))
  expect(names()).toHaveLength(3)
})

test('Download Excel writes exactly the rows on screen, phones kept as text', async () => {
  loginAs('reception')
  open()
  fireEvent.click(await screen.findByRole('button', { name: /download excel/i }))
  await waitFor(() => expect(writeXlsxFile).toHaveBeenCalledTimes(1))
  const [data, options] = writeXlsxFile.mock.calls[0] as [{ value: unknown; type?: unknown }[][], Record<string, unknown>]
  expect(data[0].map(c => c.value)).toEqual(['#', 'Customer', 'Phone', 'Email', 'Date', 'Time', 'Branch', 'Consultant', 'Sales person', 'Status', 'Paid by', 'Amount (EGP)', 'Booking ref'])
  expect(data.slice(1).map(r => r[1].value)).toEqual(['Omar Adel', 'Sara Ali'])
  expect(data[2][2]).toMatchObject({ value: '+201001234567', type: String })
  expect(data[2][8].value).toBe('Aya Ashraf')
  expect(options).toMatchObject({ sheet: 'Today', stickyRowsCount: 1, rightToLeft: false })
})
