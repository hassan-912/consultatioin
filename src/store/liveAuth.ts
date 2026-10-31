import type { SupabaseClient } from '@supabase/supabase-js'
import { staffClient } from '#data-repo'
import type { StaffRole } from '../domain/types'
import { useAppStore } from './useAppStore'

/** Real staff authentication (live mode only). Every function takes the client so tests can inject a mock. */
export type StaffAuthResult = 'ok' | 'invalid' | 'inactive' | 'unavailable'

const roles: StaffRole[] = ['admin', 'finance', 'reception', 'consultant']
type ProfileRow = { role: string; consultant_id: string | null; display_name: string; active: boolean }

const clearSession = () => useAppStore.setState({ staffSession: null })

/** Reads the caller's own profile; an inactive or missing profile ends the session and is refused. */
async function adoptSession(client: SupabaseClient, user: { id: string; email?: string | null }): Promise<'ok' | 'inactive' | 'unavailable'> {
  const { data, error } = await client.from('staff_profiles').select('role,consultant_id,display_name,active').eq('user_id', user.id).maybeSingle()
  if (error) return 'unavailable'
  const profile = data as ProfileRow | null
  if (!profile || !profile.active || !roles.includes(profile.role as StaffRole)
    || (profile.role === 'consultant' && !profile.consultant_id)) {
    clearSession()
    await client.auth.signOut({ scope: 'local' })
    return 'inactive'
  }
  const role = profile.role as StaffRole
  const consultantId = role === 'consultant' ? profile.consultant_id : null
  useAppStore.setState(s => ({
    staffSession: { username: user.email || profile.display_name, role, consultantId },
    role,
    staffConsultantId: consultantId ?? s.staffConsultantId,
  }))
  return 'ok'
}

export async function signInWithEmail(email: string, password: string, client: SupabaseClient | null = staffClient): Promise<StaffAuthResult> {
  if (!client) return 'unavailable'
  try {
    const { data, error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (error) return error.status && error.status >= 500 ? 'unavailable' : error.name === 'AuthRetryableFetchError' ? 'unavailable' : 'invalid'
    const outcome = await adoptSession(client, data.user)
    if (outcome === 'unavailable') { clearSession(); await client.auth.signOut({ scope: 'local' }) }
    return outcome
  } catch {
    clearSession()
    return 'unavailable'
  }
}

/** Restores a persisted session on load. Returns the signed-in outcome without throwing. */
export async function restoreStaffSession(client: SupabaseClient | null = staffClient): Promise<StaffAuthResult | 'none'> {
  if (!client) return 'unavailable'
  try {
    const { data } = await client.auth.getSession()
    if (!data.session) { clearSession(); return 'none' }
    return await adoptSession(client, data.session.user)
  } catch {
    return 'unavailable'
  }
}

/** Follows the client's own sign-out events (expired refresh token, other tab, revoked session). */
export function watchStaffAuth(client: SupabaseClient | null = staffClient): () => void {
  if (!client) return () => {}
  const { data } = client.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') clearSession() })
  return () => data.subscription.unsubscribe()
}

export async function signOutStaff(client: SupabaseClient | null = staffClient) {
  clearSession()
  try { await client?.auth.signOut({ scope: 'local' }) } catch { /* the local session is already cleared */ }
}

const resetUrl = () => {
  const site = import.meta.env.VITE_SITE_URL
  if (!site) throw new Error('LIVE_CONFIG_MISSING')
  return `${new URL(site).origin}/#/staff/reset`
}

export async function requestPasswordReset(email: string, client: SupabaseClient | null = staffClient): Promise<'sent' | 'unavailable'> {
  if (!client) return 'unavailable'
  try {
    const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: resetUrl() })
    return error ? 'unavailable' : 'sent'
  } catch {
    return 'unavailable'
  }
}

/** Turns the emailed link (implicit tokens in the fragment, or a ?code) into a session; false when the link is unusable. */
export async function openRecoveryLink(href: string, client: SupabaseClient | null = staffClient): Promise<boolean> {
  if (!client) return false
  try {
    const fragment = new URLSearchParams(href.split('#').slice(2).join('&'))
    const query = new URL(href).searchParams
    if (fragment.get('error') || fragment.get('error_code') || query.get('error')) return false
    const access = fragment.get('access_token')
    const refresh = fragment.get('refresh_token')
    if (access && refresh) {
      const { error } = await client.auth.setSession({ access_token: access, refresh_token: refresh })
      return !error
    }
    const code = query.get('code')
    if (code) {
      const { error } = await client.auth.exchangeCodeForSession(code)
      return !error
    }
    const { data } = await client.auth.getSession()
    return !!data.session
  } catch {
    return false
  }
}

/** Sets the new password, then ends the recovery session so the person signs in normally. */
export async function setNewPassword(password: string, client: SupabaseClient | null = staffClient): Promise<'ok' | 'unavailable'> {
  if (!client) return 'unavailable'
  try {
    const { error } = await client.auth.updateUser({ password })
    if (error) return 'unavailable'
    await signOutStaff(client)
    return 'ok'
  } catch {
    return 'unavailable'
  }
}
