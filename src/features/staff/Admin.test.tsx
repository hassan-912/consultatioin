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

test('admin edits a consultant bio and picks a new photo; the profile changes and the edit is audited with what changed', async () => {
  const createUrl = vi.fn(() => 'blob:new-photo')
  Object.assign(URL, { createObjectURL: createUrl })
  loginAs('admin')
  openStaff('/staff/consultants')
  fireEvent.click(screen.getByRole('button', { name: /edit profile.*mohamed esmail/i }))
  fireEvent.change(screen.getByLabelText('Biography (English)'), { target: { value: 'New English bio' } })
  const photo = new File(['x'], 'me.webp', { type: 'image/webp' })
  fireEvent.change(screen.getByLabelText(/choose a new photo/i), { target: { files: [photo] } })
  await waitFor(() => expect(createUrl).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
  await waitFor(() => expect(getConsultant('mohamed-esmail').bio?.en).toBe('New English bio'))
  expect(getConsultant('mohamed-esmail').photo).toBe('blob:new-photo')
  expect(useAppStore.getState().audit[0]).toMatchObject({ actor: 'admin', action: 'consultant-edited', to: 'mohamed-esmail', note: 'bio, photo' })
})

test('the editor refuses a video over 50 MB', () => {
  loginAs('admin')
  openStaff('/staff/consultants')
  fireEvent.click(screen.getByRole('button', { name: /edit profile.*mohamed esmail/i }))
  const big = new File(['x'], 'big.mp4', { type: 'video/mp4' })
  Object.defineProperty(big, 'size', { value: 60 * 1024 * 1024 })
  fireEvent.change(screen.getByLabelText(/choose a new video/i), { target: { files: [big] } })
  expect(screen.getByRole('alert')).toHaveTextContent(/larger than 50 mb/i)
})

test('admin deletes a booking after confirming; it disappears and the audit keeps its reference', async () => {
  loginAs('admin')
  openStaff('/staff/bookings')
  const b = Object.values(useAppStore.getState().bookings)[0]
  const card = screen.getByRole('article', { name: b.reference })
  fireEvent.click(within(card).getByRole('button', { name: /^delete$/i }))
  fireEvent.click(within(card).getByRole('button', { name: /^confirm$/i }))
  await waitFor(() => expect(useAppStore.getState().bookings[b.id]).toBeUndefined())
  expect(screen.queryByRole('article', { name: b.reference })).toBeNull()
  expect(useAppStore.getState().audit[0]).toMatchObject({ action: 'booking-deleted', from: b.status, note: `${b.reference} · ${b.customer.name}` })
})

test('only the admin gets the delete button', () => {
  loginAs('reception')
  openStaff('/staff/bookings')
  expect(screen.queryByRole('button', { name: /^delete$/i })).toBeNull()
})

test('KPI settings are gone', () => {
  loginAs('admin')
  openStaff('/staff/kpi')
  expect(screen.queryByRole('link', { name: /kpi settings/i })).toBeNull()
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

test('audit history: one card per person with what was affected and how it changed', () => {
  const add = useAppStore.getState().addAudit
  add({ actor: 'finance', actorName: 'Mona', action: 'transition', bookingRef: 'MG-AAAA-BBBB', from: 'on-hold', to: 'confirmed' })
  add({ actor: 'finance', actorName: 'Mona', action: 'transition', bookingRef: 'MG-CCCC-DDDD', from: 'on-hold', to: 'rejected' })
  add({ actor: 'admin', actorName: 'Hassan', action: 'consultant-edited', to: 'ahmed-tarek', note: 'bio, video' })
  add({ actor: 'customer', action: 'created', bookingRef: 'MG-EEEE-FFFF', to: 'reserved' })
  loginAs('admin')
  openStaff('/staff/audit')
  const mona = screen.getByRole('heading', { name: 'Mona' }).closest('article') as HTMLElement
  expect(within(mona).getByText('2 actions', { exact: false })).toBeInTheDocument()
  expect(within(mona).getByText('MG-AAAA-BBBB')).toBeInTheDocument()
  expect(within(mona).getByText(/→ Booking confirmed$/)).toBeInTheDocument()
  const hassan = screen.getByRole('heading', { name: 'Hassan' }).closest('article') as HTMLElement
  expect(within(hassan).getByText('Consultant profile edited')).toBeInTheDocument()
  expect(within(hassan).getByText('Ahmed Tarek')).toBeInTheDocument()
  expect(within(hassan).getByText('bio, video')).toBeInTheDocument()
  const client = screen.getByRole('heading', { name: 'Client' }).closest('article') as HTMLElement
  expect(within(client).getAllByText('MG-EEEE-FFFF').length).toBeGreaterThan(0)
  expect(screen.getAllByRole('article')).toHaveLength(3)
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

test('the admin hides a consultant from the home page and shows them again', async () => {
  const { DirectoryPage } = await import('../directory/DirectoryPage')
  const { refreshPublicMetadata } = await import('../../data/hooks')
  const home = () => render(<MemoryRouter><DirectoryPage /></MemoryRouter>)
  const listedNames = () => screen.getAllByRole('article').map(a => a.textContent ?? '')
  useAppStore.setState({ location: 'nasr-city' })

  loginAs('admin')
  const admin = openStaff('/staff/consultants')
  fireEvent.click(screen.getByRole('button', { name: 'Hide Ahmed Salama' }))
  expect(await screen.findByRole('button', { name: 'Show Ahmed Salama' })).toBeInTheDocument()
  expect(useAppStore.getState().audit[0]).toMatchObject({ actor: 'admin', action: 'edited' })
  admin.unmount()

  await refreshPublicMetadata()
  const page = home()
  expect(listedNames().some(t => t.includes('Ahmed Salama'))).toBe(false)
  expect(listedNames().some(t => t.includes('Mohamed Gamal'))).toBe(true)
  page.unmount()

  openStaff('/staff/consultants')
  fireEvent.click(screen.getByRole('button', { name: 'Show Ahmed Salama' }))
  expect(await screen.findByRole('button', { name: 'Hide Ahmed Salama' })).toBeInTheDocument()
  await refreshPublicMetadata()
  home()
  expect(listedNames().some(t => t.includes('Ahmed Salama'))).toBe(true)
})
