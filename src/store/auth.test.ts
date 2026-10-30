import { createHash } from 'node:crypto'
import { signIn, signOut } from './auth'
import { useAppStore } from './useAppStore'
import type { StaffAccount } from '../config/staffAccounts'

const acct = (username: string, role: StaffAccount['role'], password: string, consultantId: string | null = null): StaffAccount => ({
  username, role, consultantId, passwordSha256: createHash('sha256').update(password).digest('hex'),
})
const accounts = [acct('finance', 'finance', 'pw-fin-1'), acct('ahmed.tarek', 'consultant', 'pw-at-2', 'ahmed-tarek')]

beforeEach(() => useAppStore.setState({ staffSession: null }))

test('correct credentials sign in with the account role', async () => {
  expect(await signIn('finance', 'pw-fin-1', accounts)).toBe(true)
  expect(useAppStore.getState().staffSession).toMatchObject({ username: 'finance', role: 'finance' })
  expect(useAppStore.getState().role).toBe('finance')
})

test('consultant login is tied to their own consultant id; username is case-insensitive', async () => {
  expect(await signIn('  Ahmed.Tarek ', 'pw-at-2', accounts)).toBe(true)
  expect(useAppStore.getState().staffConsultantId).toBe('ahmed-tarek')
})

test('wrong password or unknown user is refused', async () => {
  expect(await signIn('finance', 'nope', accounts)).toBe(false)
  expect(await signIn('ghost', 'pw-fin-1', accounts)).toBe(false)
  expect(useAppStore.getState().staffSession).toBeNull()
})

test('sign out clears the session', async () => {
  await signIn('finance', 'pw-fin-1', accounts)
  signOut()
  expect(useAppStore.getState().staffSession).toBeNull()
})
