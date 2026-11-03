import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { StaffApp } from './StaffApp'
import { useAppStore } from '../../store/useAppStore'

// Live-mode fixtures: the staff client is a mock, so no cloud call is possible.
const state = vi.hoisted(() => ({ profile: null as null | Record<string, unknown> }))
const client = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn(), onAuthStateChange: vi.fn(),
  },
  from: vi.fn(),
  rpc: vi.fn(),
  functions: { invoke: vi.fn() },
}))
vi.mock('../../data/mode', () => ({ isLive: true, uiStorageKey: 'mg-live-ui-v1' }))
vi.mock('#data-repo', () => ({
  configurationError: null, staffClient: client,
  repo: { staffList: vi.fn().mockResolvedValue([]), staffRecords: vi.fn().mockResolvedValue({}), staffAudit: vi.fn().mockResolvedValue([]), staffSchedules: vi.fn().mockResolvedValue({}), staffAssessments: vi.fn().mockResolvedValue({}), subscribe: vi.fn(() => vi.fn()) },
}))
vi.mock('../../data', () => ({
  configurationError: null, staffClient: client,
  repo: { staffList: vi.fn().mockResolvedValue([]), staffRecords: vi.fn().mockResolvedValue({}), staffAudit: vi.fn().mockResolvedValue([]), staffSchedules: vi.fn().mockResolvedValue({}), staffAssessments: vi.fn().mockResolvedValue({}), subscribe: vi.fn(() => vi.fn()) },
}))

const openStaff = (path = '/staff') =>
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/staff/*" element={<StaffApp />} /></Routes></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  state.profile = null
  useAppStore.getState().setLang('en')
  useAppStore.setState({ staffSession: null })
  client.auth.getSession.mockResolvedValue({ data: { session: null } })
  client.auth.signOut.mockResolvedValue({ error: null })
  client.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  client.auth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u1', email: 'old@example.com' } }, error: null })
  client.from.mockImplementation(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.profile, error: null }) }) }) }))
})

test('live: signed-out visitors get the email sign-in form with a reset option, not prototype usernames', async () => {
  openStaff('/staff/payments')
  expect(await screen.findByRole('heading', { name: /staff sign-in/i })).toBeInTheDocument()
  expect(screen.getByLabelText('Email')).toBeInTheDocument()
  expect(screen.queryByLabelText('Username')).toBeNull()
  expect(screen.getByRole('button', { name: /forgot password/i })).toBeInTheDocument()
})

test('live: a deactivated account is refused with a message and no session', async () => {
  state.profile = { role: 'admin', consultant_id: null, display_name: 'Old', active: false }
  openStaff()
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'old@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-pw' } })
  fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))
  expect(await screen.findByText(/not active/i)).toBeInTheDocument()
  expect(useAppStore.getState().staffSession).toBeNull()
  expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
})

test('live: an active account opens the workspace for its profile role', async () => {
  state.profile = { role: 'finance', consultant_id: null, display_name: 'Fin', active: true }
  openStaff()
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'fin@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-pw' } })
  fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))
  await waitFor(() => expect(useAppStore.getState().staffSession?.role).toBe('finance'))
  expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'fin@example.com', password: 'secret-pw' })
})

test('live: when the invitation email cannot be sent, the admin gets the sign-up link to share', async () => {
  state.profile = { role: 'admin', consultant_id: null, display_name: 'Boss', active: true }
  client.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'a1', email: 'boss@example.com' } } } })
  client.from.mockImplementation(() => ({ select: () => ({
    eq: () => ({ maybeSingle: async () => ({ data: state.profile, error: null }) }),
    order: () => ({ order: async () => ({ data: [], error: null }) }),
  }) }))
  client.functions.invoke.mockResolvedValue({ data: { userId: 'n1', link: 'https://auth.example/verify?token=abc' }, error: null })
  openStaff('/staff/staff-accounts')
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'aya@example.com' } })
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Aya' } })
  fireEvent.click(screen.getByRole('button', { name: /send invitation/i }))
  expect(await screen.findByText(/invitation email couldn’t be sent/i)).toBeInTheDocument()
  expect(screen.getByText('https://auth.example/verify?token=abc')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /send on whatsapp/i }).getAttribute('href')).toContain(encodeURIComponent('https://auth.example/verify?token=abc'))
})

test('live: invite form validates before calling the invite function', async () => {
  state.profile = { role: 'admin', consultant_id: null, display_name: 'Boss', active: true }
  client.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'a1', email: 'boss@example.com' } } } })
  client.from.mockImplementation(() => ({ select: () => ({
    eq: () => ({ maybeSingle: async () => ({ data: state.profile, error: null }) }),
    order: () => ({ order: async () => ({ data: [], error: null }) }),
  }) }))
  openStaff('/staff/staff-accounts')
  fireEvent.click(await screen.findByRole('button', { name: /send invitation/i }))
  expect(await screen.findByText(/valid email address/i)).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: /send invitation/i }))
  expect(await screen.findByText(/name of up to 100/i)).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Nora' } })
  fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'consultant' } })
  fireEvent.click(screen.getByRole('button', { name: /send invitation/i }))
  expect(await screen.findByText(/choose a consultant for this role/i)).toBeInTheDocument()
  expect(client.functions.invoke).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'finance' } })
  client.functions.invoke.mockResolvedValue({ data: { userId: 'n1' }, error: null })
  fireEvent.click(screen.getByRole('button', { name: /send invitation/i }))
  expect(await screen.findByText(/invitation sent to new@example.com/i)).toBeInTheDocument()
  expect(client.functions.invoke).toHaveBeenCalledWith('invite-staff', { body: { email: 'new@example.com', displayName: 'Nora', role: 'finance', consultantId: null } })
})
