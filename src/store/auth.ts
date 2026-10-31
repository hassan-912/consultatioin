import { staffAccounts, type StaffAccount } from '../config/staffAccounts'
import { useAppStore } from './useAppStore'
import { isLive } from '../data/mode'
import { signOutStaff } from './liveAuth'

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

/** Prototype sign-in: compares a password hash in the browser. Not secure; replace with server auth. */
export async function signIn(username: string, password: string, accounts: StaffAccount[] = staffAccounts): Promise<boolean> {
  if (isLive) return false // Live mode signs in through liveAuth.signInWithEmail; prototype hashes are never accepted live.
  const account = accounts.find(a => a.username === username.trim().toLowerCase())
  if (!account || (await sha256(password)) !== account.passwordSha256) return false
  useAppStore.setState(s => ({
    staffSession: { username: account.username, role: account.role, consultantId: account.consultantId },
    role: account.role,
    staffConsultantId: account.consultantId ?? s.staffConsultantId,
  }))
  useAppStore.getState().addAudit({ actor: account.role, action: 'signin', to: account.username })
  return true
}

export function signOut() {
  useAppStore.setState({ staffSession: null })
  if (isLive) void signOutStaff()
}
