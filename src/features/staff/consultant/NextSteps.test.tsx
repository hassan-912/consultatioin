import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { StaffApp } from '../StaffApp'
import { useAppStore, todayIn } from '../../../store/useAppStore'
import { loginAs } from '../../../test/loginAs'
import { addDays, zonedDateTimeToIso } from '../../../domain/time'
import type { Booking } from '../../../domain/types'

const today = todayIn('Africa/Cairo')
const mk = (id: string, name: string, phone: string, status: Booking['status'], day = today, minutes = 14 * 60, lang: 'ar' | 'en' = 'ar'): Booking => ({
  id, reference: `MG-NXT-${id.toUpperCase()}`, qrToken: id.padEnd(32, '0'), manageToken: `m${id}`.padEnd(32, '0'),
  consultantId: 'mohamed-gamal', branchId: 'nasr-city', format: 'in-person', durationMin: 45,
  startIso: zonedDateTimeToIso(day, minutes, 'Africa/Cairo'), endIso: zonedDateTimeToIso(day, minutes + 45, 'Africa/Cairo'),
  tz: 'Africa/Cairo', price: { amount: 1000, currency: 'EGP' },
  customer: { name, phone, email: '', channel: 'whatsapp', consultationLang: lang, program: 'tourism', note: '' },
  status, holdExpiresAt: 0, createdAt: Date.now(),
})
const open = (path: string) => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/staff/*" element={<StaffApp />} /></Routes></MemoryRouter>)

beforeEach(() => {
  useAppStore.getState().setLang('en')
  useAppStore.setState({
    seeded: true, audit: [], records: {}, timeOffsetMs: 0, assessments: {},
    bookings: {
      a: mk('a', 'Sara Ali', '+201001234567', 'completed'),
      b: mk('b', 'Omar Hassan', '+201117654321', 'completed', today, 15 * 60, 'en'),
      c: mk('c', 'Laila Adel', '+201112223334', 'confirmed', addDays(today, 2)),
      d: mk('d', 'Old Client', '+201009998887', 'completed', addDays(today, -5)),
    },
  })
})

test('contract and refund decisions reach finance; finance can mark them handled; notes never do', async () => {
  loginAs('consultant', 'mohamed-gamal')
  useAppStore.setState({ records: { a: { notes: 'Private: wife is pregnant', outcome: 'none' } } })
  const { unmount } = open('/staff/records')
  fireEvent.click(screen.getByRole('tab', { name: /^all/i })) // Sara already has notes, so she's under "All"
  const sara = screen.getByRole('article', { name: 'MG-NXT-A' })
  fireEvent.click(within(sara).getByRole('radio', { name: /will sign the contract/i }))
  fireEvent.change(within(sara).getByLabelText(/recommended program/i), { target: { value: 'immigration' } })
  fireEvent.click(within(sara).getByRole('button', { name: /save next step/i }))
  expect(await within(sara).findByText(/finance can see this now/i)).toBeInTheDocument()
  const omar = screen.getByRole('article', { name: 'MG-NXT-B' })
  fireEvent.click(within(omar).getByRole('radio', { name: /wants a refund/i }))
  fireEvent.click(within(omar).getByRole('button', { name: /save next step/i }))
  await within(omar).findByText(/finance can see this now/i)
  expect(useAppStore.getState().records.a.notes).toBe('Private: wife is pregnant') // the next step doesn't touch notes
  unmount()

  loginAs('finance')
  open('/staff/contracts-refunds')
  const contract = await screen.findByRole('listitem', { name: 'MG-NXT-A' })
  expect(within(contract).getByText('Will sign the contract')).toBeInTheDocument()
  expect(within(contract).getByText('Immigration')).toBeInTheDocument() // the consultant's recommendation, not the booked Tourism
  expect(screen.getByRole('listitem', { name: 'MG-NXT-B' })).toHaveTextContent(/wants a refund/i)
  expect(document.body.textContent).not.toMatch(/pregnant/)
  fireEvent.click(within(contract).getByRole('button', { name: /mark handled/i }))
  await waitFor(() => expect(screen.queryByRole('listitem', { name: 'MG-NXT-A' })).toBeNull())
  fireEvent.click(screen.getByRole('tab', { name: /handled/i }))
  expect(await screen.findByRole('listitem', { name: 'MG-NXT-A' })).toHaveTextContent(/handled/i)
})

test('"will think about it" becomes a follow-up reminder for the consultant only, with the WhatsApp message', async () => {
  loginAs('consultant', 'mohamed-gamal')
  const { unmount } = open('/staff/records')
  const sara = screen.getByRole('article', { name: 'MG-NXT-A' })
  fireEvent.click(within(sara).getByRole('radio', { name: /will think about it/i }))
  fireEvent.change(within(sara).getByLabelText(/recommended program/i), { target: { value: 'immigration' } })
  fireEvent.click(within(sara).getByRole('button', { name: /save next step/i }))
  await within(sara).findByText(/follow-up reminders/i)
  unmount()

  const home = open('/staff')
  const reminders = screen.getByRole('region', { name: /follow-up reminders/i })
  // Sara booked in Arabic, so her reminder is in Arabic and names her consultant.
  expect(within(reminders).getByText('أخبار حضرتك إيه؟ معاك محمد جمال من شركة MG. كنت حابب أعرف: خدنا قرار ولا لأ؟')).toBeInTheDocument()
  const wa = within(reminders).getByRole('link', { name: /send on whatsapp/i })
  expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/201001234567\?text=/)
  fireEvent.click(within(reminders).getByRole('button', { name: /mark followed up/i }))
  expect(await within(reminders).findByText(/no clients waiting/i)).toBeInTheDocument()
  home.unmount()

  loginAs('finance')
  open('/staff/contracts-refunds')
  expect(await screen.findByText(/nothing to handle/i)).toBeInTheDocument() // "thinking" never reaches finance
})

test('the consultant sees today, upcoming and past consultations with name, phone, date and status, and can download them', async () => {
  loginAs('consultant', 'mohamed-gamal')
  open('/staff/history')
  const table = screen.getByRole('table')
  expect(within(table).getByRole('columnheader', { name: 'Phone number' })).toBeInTheDocument()
  expect(within(table).getByText('Sara Ali')).toBeInTheDocument()
  expect(within(table).getByText('+201001234567')).toBeInTheDocument()
  expect(within(table).queryByText('Laila Adel')).toBeNull()
  fireEvent.click(screen.getByRole('tab', { name: /upcoming/i }))
  expect(within(screen.getByRole('table')).getByText('Laila Adel')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: /past/i }))
  expect(within(screen.getByRole('table')).getByText('Old Client')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: /^all/i }))
  expect(screen.getAllByRole('row')).toHaveLength(5) // header + 4
  expect(screen.getByRole('button', { name: /download excel/i })).toBeEnabled()
})

test('a consultant cannot open finance or admin screens; finance cannot open consultant history', () => {
  loginAs('consultant', 'mohamed-gamal')
  const a = open('/staff/contracts-refunds')
  expect(screen.queryByText(/clients whose consultant recorded/i)).toBeNull()
  a.unmount()
  loginAs('finance')
  open('/staff/history')
  expect(screen.queryByRole('table')).toBeNull()
})

test('the admin lists every consultant\'s free times by date, on the hour', async () => {
  loginAs('admin')
  open('/staff/available-times')
  const gamal = await screen.findByRole('region', { name: 'Mohamed Gamal' })
  const times = within(gamal).getAllByText(/^\d{2}:00$/)
  expect(times.length).toBeGreaterThan(0)
  expect(within(gamal).queryByText(/:30$/)).toBeNull()
  expect(screen.getByRole('region', { name: 'Mohamed Abdelaziz' })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Payment test' })).toBeNull() // the hidden test consultant isn't listed for "all"
})

test('the admin rewrites the follow-up message; consultants then send the new wording, and can restore the default', async () => {
  loginAs('admin')
  const { unmount } = open('/staff/messages')
  const editor = screen.getByRole('region', { name: 'Consultant follow-up' })
  const box = within(editor).getByLabelText('Message')
  expect(box).toHaveValue('أخبار حضرتك إيه؟ معاك {consultant} من شركة MG. كنت حابب أعرف: خدنا قرار ولا لأ؟')
  fireEvent.change(box, { target: { value: 'مساء الخير {client}، معاك {consultant}. ' } })
  fireEvent.click(within(editor).getByRole('button', { name: /\{program\}/ }))
  expect(within(editor).getByText('مساء الخير سارة علي، معاك محمد جمال. {program}'.replace('{program}', 'الهجرة'))).toBeInTheDocument() // live preview
  fireEvent.click(within(editor).getByRole('button', { name: /save message/i }))
  expect(await within(editor).findByText(/staff will use the new wording/i)).toBeInTheDocument()
  expect(within(editor).getByText('Edited')).toBeInTheDocument()
  unmount()

  loginAs('consultant', 'mohamed-gamal')
  useAppStore.setState({ records: { a: { notes: '', outcome: 'none', nextStep: 'thinking', recommendedProgram: 'immigration', nextStepAt: Date.now() } } })
  const home = open('/staff')
  expect(within(screen.getByRole('region', { name: /follow-up reminders/i })).getByText('مساء الخير Sara Ali، معاك محمد جمال. الهجرة')).toBeInTheDocument()
  home.unmount()

  loginAs('admin')
  open('/staff/messages')
  const again = screen.getByRole('region', { name: 'Consultant follow-up' })
  fireEvent.click(within(again).getByRole('button', { name: /restore default/i }))
  expect(await within(again).findByText(/back to the default wording/i)).toBeInTheDocument()
  expect(within(again).getByLabelText('Message')).toHaveValue('أخبار حضرتك إيه؟ معاك {consultant} من شركة MG. كنت حابب أعرف: خدنا قرار ولا لأ؟')
})

test('only the admin can open the messages screen', () => {
  loginAs('finance')
  open('/staff/messages')
  expect(screen.queryByRole('region', { name: 'Consultant follow-up' })).toBeNull()
})
