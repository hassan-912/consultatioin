import type { SupabaseClient } from '@supabase/supabase-js'
import { staffClient } from '#data-repo'
import { RepoError } from '../data/types'
import type { StaffRole } from '../domain/types'
import type { InviteRequest } from '../../supabase/functions/invite-staff/validate'

export interface StaffProfile { userId: string; displayName: string; role: StaffRole; consultantId: string | null; active: boolean; salesManager?: boolean }
export interface AccessRequest { userId: string; email: string; displayName: string; provider: string; createdAt: number }

const known = new Set(['FORBIDDEN', 'NOT_FOUND', 'INVALID_INPUT', 'ALREADY_EXISTS', 'UNAUTHENTICATED'])
const codeOf = (message: unknown) => (typeof message === 'string' && known.has(message) ? message : 'NETWORK')
const need = (client: SupabaseClient | null) => { if (!client) throw new RepoError('LIVE_CONFIG_MISSING'); return client }

export async function listStaff(client: SupabaseClient | null = staffClient): Promise<StaffProfile[]> {
  const { data, error } = await need(client).from('staff_profiles').select('user_id,display_name,role,consultant_id,active,sales_manager').order('display_name').order('user_id')
  if (error) throw new RepoError('NETWORK')
  return (data ?? []).map(r => ({ userId: r.user_id, displayName: r.display_name, role: r.role, consultantId: r.consultant_id, active: r.active, salesManager: !!r.sales_manager }))
}

/** Role / consultant / active changes go through the admin-only set_staff_role RPC (it audits and blocks self-lockout). */
export async function saveStaff(p: StaffProfile, client: SupabaseClient | null = staffClient): Promise<void> {
  const { error } = await need(client).rpc('set_staff_role', {
    p_user_id: p.userId, p_display_name: p.displayName.trim(), p_role: p.role,
    p_consultant_id: p.role === 'consultant' ? p.consultantId : null, p_active: p.active,
  })
  if (error) throw new RepoError(codeOf(error.message))
}

/** Admin: this account also sees the clients who weren't ready (audited). */
export async function setSalesManager(userId: string, on: boolean, client: SupabaseClient | null = staffClient): Promise<void> {
  const { error } = await need(client).rpc('admin_set_sales_manager', { p_user_id: userId, p_on: on })
  if (error) throw new RepoError(codeOf(error.message))
}

/** People who signed themselves up and wait for an admin. */
export async function listAccessRequests(client: SupabaseClient | null = staffClient): Promise<AccessRequest[]> {
  const { data, error } = await need(client).from('staff_access_requests').select('user_id,email,display_name,provider,created_at').order('created_at').order('user_id')
  if (error) throw new RepoError('NETWORK')
  return (data ?? []).map(r => ({ userId: r.user_id, email: r.email, displayName: r.display_name, provider: r.provider, createdAt: Date.parse(r.created_at) }))
}

/** Admin: give the person a staff profile with this role (audited); the request is removed. */
export async function approveAccessRequest(userId: string, role: StaffRole, consultantId: string | null, client: SupabaseClient | null = staffClient): Promise<void> {
  const { error } = await need(client).rpc('approve_staff_request', { p_user_id: userId, p_role: role, p_consultant_id: role === 'consultant' ? consultantId : null })
  if (error) throw new RepoError(codeOf(error.message))
}

/** Admin: refuse access (audited). Their login stays but opens nothing; signing in again files a new request. */
export async function declineAccessRequest(userId: string, client: SupabaseClient | null = staffClient): Promise<void> {
  const { error } = await need(client).rpc('decline_staff_request', { p_user_id: userId })
  if (error) throw new RepoError(codeOf(error.message))
}

/** Invitations go through the admin-only Edge Function; the service-role key never reaches the browser. */
/** Resolves to the sign-up link when the email could not be sent and the admin has to share it. */
export async function inviteStaff(request: InviteRequest, client: SupabaseClient | null = staffClient): Promise<{ link?: string }> {
  const { data, error } = await need(client).functions.invoke('invite-staff', { body: request })
  if (!error) return { link: typeof data?.link === 'string' ? data.link : undefined }
  let code = 'NETWORK'
  try {
    const body = await (error as { context?: Response }).context?.json()
    code = codeOf(body?.error)
  } catch { /* not an HTTP error body */ }
  throw new RepoError(code)
}
