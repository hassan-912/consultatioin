import type { SupabaseClient } from '@supabase/supabase-js'
import { staffClient } from '#data-repo'
import { RepoError } from '../data/types'
import type { StaffRole } from '../domain/types'
import type { InviteRequest } from '../../supabase/functions/invite-staff/validate'

export interface StaffProfile { userId: string; displayName: string; role: StaffRole; consultantId: string | null; active: boolean }

const known = new Set(['FORBIDDEN', 'NOT_FOUND', 'INVALID_INPUT', 'ALREADY_EXISTS', 'UNAUTHENTICATED'])
const codeOf = (message: unknown) => (typeof message === 'string' && known.has(message) ? message : 'NETWORK')
const need = (client: SupabaseClient | null) => { if (!client) throw new RepoError('LIVE_CONFIG_MISSING'); return client }

export async function listStaff(client: SupabaseClient | null = staffClient): Promise<StaffProfile[]> {
  const { data, error } = await need(client).from('staff_profiles').select('user_id,display_name,role,consultant_id,active').order('display_name').order('user_id')
  if (error) throw new RepoError('NETWORK')
  return (data ?? []).map(r => ({ userId: r.user_id, displayName: r.display_name, role: r.role, consultantId: r.consultant_id, active: r.active }))
}

/** Role / consultant / active changes go through the admin-only set_staff_role RPC (it audits and blocks self-lockout). */
export async function saveStaff(p: StaffProfile, client: SupabaseClient | null = staffClient): Promise<void> {
  const { error } = await need(client).rpc('set_staff_role', {
    p_user_id: p.userId, p_display_name: p.displayName.trim(), p_role: p.role,
    p_consultant_id: p.role === 'consultant' ? p.consultantId : null, p_active: p.active,
  })
  if (error) throw new RepoError(codeOf(error.message))
}

/** Invitations go through the admin-only Edge Function; the service-role key never reaches the browser. */
export async function inviteStaff(request: InviteRequest, client: SupabaseClient | null = staffClient): Promise<void> {
  const { error } = await need(client).functions.invoke('invite-staff', { body: request })
  if (!error) return
  let code = 'NETWORK'
  try {
    const body = await (error as { context?: Response }).context?.json()
    code = codeOf(body?.error)
  } catch { /* not an HTTP error body */ }
  throw new RepoError(code)
}
