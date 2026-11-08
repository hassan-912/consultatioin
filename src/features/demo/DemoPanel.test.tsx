import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DemoPanel } from './DemoPanel'
import { useAppStore, emptyDraft } from '../../store/useAppStore'
import { createReservation, submitPayment } from '../../store/actions'
import { slotsFor } from '../shared/availability'
import { addDays, dateInZone } from '../../domain/time'
import { todayIn } from '../../store/useAppStore'

const setup = () => {
  let slot = ''
  for (let i = 1; i < 14 && !slot; i++) slot = slotsFor('mohamed-gamal', addDays(todayIn('Africa/Cairo'), i), 'online', 30)[0]?.startIso ?? ''
  useAppStore.setState({
    bookings: {}, audit: [], timeOffsetMs: 0, seeded: true,
    draft: { ...emptyDraft(), consultantId: 'mohamed-gamal', format: 'online', durationMin: 45, slotStartIso: slot,
      details: { ...emptyDraft().details, name: 'Sara', phone: '+201001234567', email: 's@e.com', program: 'immigration' } },
  })
  return { b: createReservation(), slot }
}

const openPanel = () => {
  render(<MemoryRouter><DemoPanel /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: /prototype controls/i }))
}

beforeEach(() => useAppStore.getState().setLang('en'))

test('skipping 31 minutes expires a fresh reservation and releases its slot', () => {
  const { b, slot } = setup()
  const date = dateInZone(slot, 'Africa/Cairo')
  expect(slotsFor('mohamed-gamal', date, 'online', 45).map(s => s.startIso)).not.toContain(slot)
  openPanel()
  fireEvent.click(screen.getByRole('button', { name: /skip 31 minutes/i }))
  expect(useAppStore.getState().bookings[b.id].status).toBe('expired')
  expect(slotsFor('mohamed-gamal', date, 'online', 45).map(s => s.startIso)).toContain(slot)
})

test('finance verify from the panel confirms the latest booking', () => {
  const { b } = setup()
  submitPayment(b.id, { method: 'instapay', txnRef: 'T1' })
  openPanel()
  fireEvent.click(screen.getByRole('button', { name: /finance verifies payment/i }))
  expect(useAppStore.getState().bookings[b.id].status).toBe('confirmed')
})
