import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { pendingDecisions } from '../../config/pendingDecisions'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { StaffApp } from './StaffApp'
import { useAppStore } from '../../store/useAppStore'
import { loginAs } from '../../test/loginAs'
import { getConsultant } from '../../store/actions'
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

test('pending decisions: admin edits, adds and resolves (resolve deletes and audits)', async () => {
  useAppStore.setState({ decisions: pendingDecisions })
  loginAs('admin')
  openStaff('/staff/decisions')
  const item = await screen.findByRole('listitem', { name: /Meeting platform for online consultations/ })
  expect(screen.getAllByRole('button', { name: /resolve/i })).toHaveLength(pendingDecisions.length)

  fireEvent.click(within(item).getByRole('button', { name: /edit/i }))
  fireEvent.change(screen.getByLabelText('Decision (English)'), { target: { value: 'Google Meet or Zoom?' } })
  fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'Hassan' } })
  fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
  const edited = await screen.findByRole('listitem', { name: 'Google Meet or Zoom?' })
  expect(within(edited).getByText('Hassan')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /add decision/i }))
  fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
  expect(screen.getByText(/write the decision in english or arabic/i)).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Decision (Arabic)'), { target: { value: 'عنوان فرع قنا' } })
  fireEvent.change(screen.getByLabelText('Area (English)'), { target: { value: 'Operations' } })
  expect(screen.getByLabelText('Area (Arabic)')).toHaveValue('التشغيل')
  fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
  await screen.findByRole('listitem', { name: 'عنوان فرع قنا' })
  expect(useAppStore.getState().decisions).toHaveLength(pendingDecisions.length + 1)

  fireEvent.click(within(edited).getByRole('button', { name: /resolve/i }))
  fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }))
  await waitFor(() => expect(screen.queryByRole('listitem', { name: 'Google Meet or Zoom?' })).toBeNull())
  expect(useAppStore.getState().decisions.some(d => d.question.en === 'Google Meet or Zoom?')).toBe(false)
  expect(useAppStore.getState().audit[0]).toMatchObject({ actor: 'admin', action: 'decision-resolved', to: 'Google Meet or Zoom?' })
}, 20000)

test('audit log shows actions', () => {
  useAppStore.getState().addAudit({ actor: 'finance', action: 'transition', bookingRef: 'MG-AAAA-BBBB', from: 'on-hold', to: 'confirmed' })
  loginAs('admin')
  openStaff('/staff/audit')
  expect(screen.getByText('MG-AAAA-BBBB')).toBeInTheDocument()
})

test('the 5 EGP payment-test consultant is listed for the admin, with a button that opens its booking page', async () => {
  loginAs('admin')
  render(<MemoryRouter initialEntries={['/staff/consultants']}><Routes>
    <Route path="/staff/*" element={<StaffApp />} />
    <Route path="/book/:id" element={<p>BOOKING test-ek-q7m4x9</p>} />
  </Routes></MemoryRouter>)
  expect(screen.getByText('Payment test')).toBeInTheDocument()
  expect(screen.getByText('Payment test · 5 EGP')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /book a test payment/i }))
  expect(await screen.findByText('BOOKING test-ek-q7m4x9')).toBeInTheDocument()
  expect(localStorage.getItem('mg-admin-test-key')).toBe('demo')
})
