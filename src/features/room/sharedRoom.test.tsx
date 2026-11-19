import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useAppStore } from '../../store/useAppStore'
import { loginAs } from '../../test/loginAs'
import type { Booking } from '../../domain/types'
import { ConsultantRoomPanel } from './ConsultantRoomPanel'
import { ClientRoomSide } from './ClientRoomParts'
import type { RoomChannel, RoomMessage } from './sharedAssessment'

/** Two ends of one in-memory call: what one sends, the other hears (like Daily app messages). */
function pair(): [RoomChannel, RoomChannel] {
  const ears = [new Set<(m: RoomMessage) => void>(), new Set<(m: RoomMessage) => void>()]
  const end = (me: number): RoomChannel => ({
    send: m => queueMicrotask(() => ears[1 - me].forEach(fn => fn(structuredClone(m)))),
    listen: fn => { ears[me].add(fn); return () => ears[me].delete(fn) },
  })
  return [end(0), end(1)]
}

const START = Date.now()
const b: Booking = {
  id: 'room-1', reference: 'MG-ROOM-0001', qrToken: 'q'.repeat(32), manageToken: 'm'.repeat(32),
  consultantId: 'ahmed-tarek', branchId: 'sheikh-zayed', format: 'online', durationMin: 45,
  startIso: new Date(START).toISOString(), endIso: new Date(START + 45 * 60_000).toISOString(),
  tz: 'Africa/Cairo', price: { amount: 1000, currency: 'EGP' },
  customer: { name: 'Kamel', phone: '+201001234567', email: '', channel: 'whatsapp', consultationLang: 'en', program: 'tourism', note: '' },
  status: 'checked-in', holdExpiresAt: 0, createdAt: START,
}

beforeEach(() => {
  useAppStore.getState().setLang('en')
  useAppStore.setState({ seeded: true, bookings: { 'room-1': b }, assessments: {}, meetingSummaries: {}, timeOffsetMs: 0 })
  loginAs('consultant', 'ahmed-tarek')
})

test('Send to room opens the card for the client, the client edits it, and the consultant saves the edit', async () => {
  const [staffEnd, clientEnd] = pair()
  render(
    <MemoryRouter>
      <div data-testid="staff"><ConsultantRoomPanel booking={b} ctx={{ channel: staffEnd, call: null }} /></div>
      <div data-testid="client"><ClientRoomSide ctx={{ channel: clientEnd, call: null }} consultantName="Ahmed Tarek" /></div>
    </MemoryRouter>,
  )
  const staff = within(screen.getByTestId('staff'))
  const client = within(screen.getByTestId('client'))

  fireEvent.change(staff.getByLabelText(/programme/i), { target: { value: 'tourism' } })
  // Nothing is in the room until the consultant sends it.
  expect(client.queryByText(/your file assessment/i)).not.toBeInTheDocument()
  fireEvent.click(staff.getByRole('button', { name: /send to room/i }))
  expect(await client.findByText(/your file assessment/i)).toBeInTheDocument()
  // The score stays on the consultant's side.
  expect(client.queryByText(/only you see this/i)).not.toBeInTheDocument()

  fireEvent.click(client.getByLabelText('25-44 years'))
  await waitFor(() => expect(staff.getByLabelText('25-44 years')).toBeChecked())
  await waitFor(() => expect(useAppStore.getState().assessments['room-1']).toEqual({ program: 'tourism', answers: { age_bracket: 'age_opt_2' } }), { timeout: 3000 })

  fireEvent.click(staff.getByRole('button', { name: /stop sharing/i }))
  await waitFor(() => expect(client.queryByText(/your file assessment/i)).not.toBeInTheDocument())
})

test('a client who arrives late gets the card that is already shared', async () => {
  const [staffEnd, clientEnd] = pair()
  const view = render(<MemoryRouter><ConsultantRoomPanel booking={b} ctx={{ channel: staffEnd, call: null }} /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText(/programme/i), { target: { value: 'immigration' } })
  fireEvent.click(screen.getByRole('button', { name: /send to room/i }))
  await act(async () => { await Promise.resolve() })
  view.rerender(
    <MemoryRouter>
      <ConsultantRoomPanel booking={b} ctx={{ channel: staffEnd, call: null }} />
      <div data-testid="client"><ClientRoomSide ctx={{ channel: clientEnd, call: null }} consultantName="Ahmed Tarek" /></div>
    </MemoryRouter>,
  )
  expect(await within(screen.getByTestId('client')).findByText(/your file assessment/i)).toBeInTheDocument()
})
