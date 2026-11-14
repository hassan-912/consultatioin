import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { StaffApp } from '../StaffApp'
import { useAppStore, todayIn } from '../../../store/useAppStore'
import { loginAs } from '../../../test/loginAs'
import { zonedDateTimeToIso } from '../../../domain/time'
import type { Booking } from '../../../domain/types'

const today = todayIn('Africa/Cairo')
const b: Booking = {
  id: 'sa', reference: 'MG-SEND-SA', qrToken: 'q'.repeat(32), manageToken: 'e'.repeat(32), consultantId: 'mohamed-gamal', branchId: 'nasr-city', format: 'in-person',
  durationMin: 45, startIso: zonedDateTimeToIso(today, 9 * 60, 'Africa/Cairo'), endIso: zonedDateTimeToIso(today, 9 * 60 + 45, 'Africa/Cairo'),
  tz: 'Africa/Cairo', price: { amount: 1000, currency: 'EGP' },
  customer: { name: 'Sara Ali', phone: '+201001234567', email: '', channel: 'whatsapp', consultationLang: 'en', program: 'tourism', note: '' },
  status: 'completed', holdExpiresAt: 0, createdAt: Date.now(),
}
const open = () => render(<MemoryRouter initialEntries={[`/staff/client/${b.id}`]}><Routes><Route path="/staff/*" element={<StaffApp />} /></Routes></MemoryRouter>)
let opened: string[] = []

beforeEach(() => {
  opened = []
  vi.spyOn(window, 'open').mockImplementation(((url?: string | URL) => { if (url) opened.push(String(url)); return { location: { set href(v: string) { opened.push(v) } }, close() {} } as unknown as Window }) as typeof window.open)
  useAppStore.getState().setLang('en')
  useAppStore.setState({ seeded: true, audit: [], records: {}, timeOffsetMs: 0, assessments: {}, bookings: { [b.id]: b } })
  loginAs('consultant', 'mohamed-gamal')
})
afterEach(() => vi.restoreAllMocks())

test('after Thinking about it, Send assessment on WhatsApp opens wa.me with the link', async () => {
  useAppStore.setState({ records: { sa: { notes: '', outcome: 'none', nextStep: 'thinking' } } })
  open()
  fireEvent.click(await screen.findByRole('button', { name: 'Send assessment on WhatsApp' }))
  await waitFor(() => expect(opened.some(u => u.startsWith('https://wa.me/201001234567'))).toBe(true))
  const url = decodeURIComponent(opened.find(u => u.startsWith('https://wa.me/'))!)
  expect(url).toContain('Sara')
  expect(url).toContain(`/#/booking/${b.manageToken}/assessment`)
  expect(useAppStore.getState().bookings.sa.assessmentSentAt).toBeGreaterThan(0)
})

test('after sending it shows Sent and no button', async () => {
  useAppStore.setState({ records: { sa: { notes: '', outcome: 'none', nextStep: 'contract' } }, bookings: { [b.id]: { ...b, assessmentSentAt: Date.now() } } })
  open()
  const panel = await screen.findByRole('region', { name: 'Next step' })
  expect(within(panel).getByText(/Assessment sent/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Send assessment on WhatsApp' })).toBeNull()
})

test('no button for refund', async () => {
  useAppStore.setState({ records: { sa: { notes: '', outcome: 'none', nextStep: 'refund', refundReason: 'x' } } })
  open()
  await screen.findByRole('region', { name: 'Next step' })
  expect(screen.queryByRole('button', { name: 'Send assessment on WhatsApp' })).toBeNull()
})

test('a stale tab whose send was already stamped elsewhere does not open WhatsApp again', async () => {
  const { repo } = await import('../../../data')
  vi.spyOn(repo, 'markAssessmentSent').mockResolvedValue(Date.now() - 3_600_000)
  useAppStore.setState({ records: { sa: { notes: '', outcome: 'none', nextStep: 'thinking' } } })
  open()
  fireEvent.click(await screen.findByRole('button', { name: 'Send assessment on WhatsApp' }))
  await waitFor(() => expect(repo.markAssessmentSent).toHaveBeenCalled())
  await new Promise(r => setTimeout(r, 50))
  expect(opened.some(u => u.startsWith('https://wa.me/'))).toBe(false)
})
