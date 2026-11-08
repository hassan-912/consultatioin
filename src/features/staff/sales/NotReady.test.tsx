import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { StaffApp } from '../StaffApp'
import { useAppStore } from '../../../store/useAppStore'
import { loginAs } from '../../../test/loginAs'
import type { ReadinessRequest } from '../../../data/types'

const open = (path = '/staff/not-ready') =>
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/staff/*" element={<StaffApp />} /></Routes></MemoryRouter>)

const karim: ReadinessRequest = {
  id: 'r1', createdAt: Date.now() - 3600_000, status: 'open',
  name: 'Karim Adel', phone: '+201005550199', email: 'karim@example.com', lang: 'ar',
  program: 'tourism', consultantId: 'mohamed-gamal', format: 'online', wantedIso: '2030-01-05T10:00:00.000Z',
  score: 42, scoreMax: 100, answers: { bank: 'bank_opt_5' },
  reasons: [{ en: 'Egyptian account with less than 250,000 EGP', ar: 'حساب بالجنيه برصيد أقل من 250 ألف جنيه' }],
}

beforeEach(() => {
  useAppStore.getState().setLang('en')
  useAppStore.setState({ seeded: true, audit: [], readinessRules: {}, readinessRequests: { r1: karim } })
})

test('the sales manager sees who was not ready: score, name, phone, email, program, why; and marks it contacted', async () => {
  loginAs('sales', null, true)
  open()
  const item = await screen.findByRole('listitem', { name: 'Karim Adel' })
  expect(within(item).getByText('+201005550199')).toBeInTheDocument()
  expect(within(item).getByText('karim@example.com')).toBeInTheDocument()
  expect(item).toHaveTextContent('42 / 100')
  expect(item).toHaveTextContent('Tourism')
  expect(within(item).getByText('Egyptian account with less than 250,000 EGP')).toBeInTheDocument()
  expect(screen.queryByText(/rules: who is not ready/i)).toBeNull() // the rules are the admin's
  fireEvent.click(within(item).getByRole('button', { name: /mark contacted/i }))
  await waitFor(() => expect(useAppStore.getState().readinessRequests.r1.status).toBe('contacted'))
  expect(screen.queryByRole('listitem', { name: 'Karim Adel' })).toBeNull()
  fireEvent.click(screen.getByRole('tab', { name: /contacted/i }))
  expect(await screen.findByRole('listitem', { name: 'Karim Adel' })).toBeInTheDocument()
})

test('the sales manager assigns the client to a salesperson', async () => {
  loginAs('sales', null, true)
  open()
  const item = await screen.findByRole('listitem', { name: 'Karim Adel' })
  const select = within(item).getByLabelText('Assigned to Karim Adel')
  expect(select).toHaveValue('')
  await waitFor(() => expect(within(item).getByRole('option', { name: 'test.sales' })).toBeInTheDocument())
  fireEvent.change(select, { target: { value: 'test.sales' } })
  await waitFor(() => expect(useAppStore.getState().readinessRequests.r1).toMatchObject({ assignedTo: 'test.sales', assignedName: 'test.sales' }))
  fireEvent.change(within(item).getByLabelText('Assigned to Karim Adel'), { target: { value: '' } })
  await waitFor(() => expect(useAppStore.getState().readinessRequests.r1.assignedTo).toBeUndefined())
})

test('an ordinary sales account does not get the list', () => {
  loginAs('sales')
  open()
  expect(screen.queryByRole('listitem', { name: 'Karim Adel' })).toBeNull()
  expect(screen.queryByRole('link', { name: /not ready clients/i })).toBeNull()
})

test('the admin sees the list and edits the rules', async () => {
  loginAs('admin')
  open()
  await screen.findByRole('listitem', { name: 'Karim Adel' })
  fireEvent.click(screen.getByText(/rules: who is not ready/i))
  const min = await screen.findByLabelText(/minimum file strength/i)
  expect(min).toHaveValue(60)
  fireEvent.change(min, { target: { value: '55' } })
  fireEvent.click(screen.getByLabelText(/egyptian account under 250,000/i))
  fireEvent.click(screen.getByRole('button', { name: /save rules/i }))
  expect(await screen.findByText(/new bookings use these rules/i)).toBeInTheDocument()
  expect(useAppStore.getState().readinessRules).toMatchObject({ tourismMinScore: 55, tourismLowBank: false })
})
