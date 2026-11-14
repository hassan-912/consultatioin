import type { SupabaseClient } from '@supabase/supabase-js'
import { staffClient } from '#data-repo'
import type { StaffRole } from '../domain/types'
import { useAppStore } from './useAppStore'

/** Real staff authentication (live mode only). Every function takes the client so tests can inject a mock. */
export type StaffAuthResult = 'ok' | 'pending' | 'invalid' | 'inactive' | 'unavailable'

const roles: StaffRole[] = ['admin', 'finance', 'reception', 'consultant', 'sales']
type ProfileRow = { role: string; consultant_id: string | null; display_name: string; active: boolean }

const clearSession = () => useAppStore.setState({ staffSession: null, staffPending: null })
type AuthUser = { id: string; email?: string | null; user_metadata?: Record<string, unknown> }
const metaName = (u: AuthUser) => ['full_name', 'name', 'display_name'].map(k => u.user_metadata?.[k]).find(v => typeof v === 'string' && v.trim()) as string | undefined
const siteOrigin = () => {
  const site = import.meta.env.VITE_SITE_URL
  if (!site) throw new Error('LIVE_CONFIG_MISSING')
  return new URL(site).origin
}

/**
 * Reads the caller's own profile. No profile yet: the person signed themselves up. Their request is filed once
 * they choose a username (given here, or asked for on the pending screen); they wait for an admin, still signed in.
 * An inactive profile ends the session and is refused.
 */
async function adoptSession(client: SupabaseClient, user: AuthUser, username = ''): Promise<'ok' | 'pending' | 'inactive' | 'unavailable'> {
  const { data, error } = await client.from('staff_profiles').select('role,consultant_id,display_name,active').eq('user_id', user.id).maybeSingle()
  if (error) return 'unavailable'
  const profile = data as ProfileRow | null
  if (!profile) {
    const request = await client.rpc('request_staff_access', { p_display_name: username.trim() })
    if (request.error) return 'unavailable'
    const filed = request.data === 'pending'
    useAppStore.setState({ staffSession: null, staffPending: {
      email: user.email ?? '', name: username.trim() || (metaName(user) ?? ''),
      needsName: !filed, taken: request.data === 'taken',
    } })
    return 'pending'
  }
  if (!profile.active || !roles.includes(profile.role as StaffRole)
    || (profile.role === 'consultant' && !profile.consultant_id)) {
    clearSession()
    await client.auth.signOut({ scope: 'local' })
    return 'inactive'
  }
  const role = profile.role as StaffRole
  const consultantId = role === 'consultant' ? profile.consultant_id : null
  // Older databases have no such check yet: then nobody is a sales manager.
  let manager = false
  try { manager = (await client.rpc('is_sales_manager')).data === true } catch { manager = false }
  useAppStore.setState(s => ({
    staffSession: { username: profile.display_name.trim() || user.email || '', role, consultantId, salesManager: manager },
    staffPending: null,
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

const resetUrl = () => `${siteOrigin()}/#/staff/reset`
/** Google and email-confirmation links come back here and are turned into a session. */
const returnUrl = () => `${siteOrigin()}/#/staff/oauth`

/**
 * Self sign-up. Creates the login only; access waits for an admin. 'confirm' means Supabase emailed a
 * confirmation link first (when "Confirm email" is on in the project's auth settings).
 */
export async function signUpWithEmail(name: string, email: string, password: string, client: SupabaseClient | null = staffClient): Promise<'pending' | 'confirm' | 'exists' | 'weak' | 'unavailable'> {
  if (!client) return 'unavailable'
  try {
    const { data, error } = await client.auth.signUp({
      email: email.trim().toLowerCase(), password, options: { data: { display_name: name.trim() }, emailRedirectTo: returnUrl() },
    })
    if (error) return /already|registered|exists/i.test(error.message) ? 'exists' : /password/i.test(error.message) ? 'weak' : 'unavailable'
    // Supabase hides existing addresses behind an empty identities list instead of an error.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return 'exists'
    if (!data.session || !data.user) return 'confirm'
    const outcome = await adoptSession(client, data.user, name)
    return outcome === 'pending' ? 'pending' : outcome === 'ok' ? 'pending' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

/** Files the signed-up person's request under the username they chose; 'taken' when someone already has it. */
export async function chooseStaffUsername(username: string, client: SupabaseClient | null = staffClient): Promise<'pending' | 'taken' | 'invalid' | 'unavailable'> {
  const name = username.trim()
  if (name.length < 2 || name.length > 40) return 'invalid'
  if (!client) return 'unavailable'
  try {
    const { data, error } = await client.rpc('request_staff_access', { p_display_name: name })
    if (error) return /INVALID_INPUT/.test(error.message) ? 'invalid' : 'unavailable'
    if (data === 'taken') return 'taken'
    if (data !== 'pending') return 'unavailable'
    useAppStore.setState(s => ({ staffPending: s.staffPending && { ...s.staffPending, name, needsName: false, taken: false } }))
    return 'pending'
  } catch {
    return 'unavailable'
  }
}

/** Sends the browser to Google. It returns to /#/staff/oauth, which finishes the sign-in. */
export async function signInWithGoogle(client: SupabaseClient | null = staffClient): Promise<'unavailable' | void> {
  if (!client) return 'unavailable'
  try {
    const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: returnUrl() } })
    if (error) return 'unavailable'
  } catch {
    return 'unavailable'
  }
}

/** Completes a Google or email-confirmation return: tokens from the address bar become the staff session. */
export async function finishOAuthReturn(href: string, client: SupabaseClient | null = staffClient): Promise<StaffAuthResult | 'none'> {
  if (!(await openRecoveryLink(href, client))) return 'invalid'
  return restoreStaffSession(client)
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
