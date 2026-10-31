// Pure request validation shared by the invite Edge Function and the staff-accounts form. No imports, no I/O.
export const staffRoles = ['admin', 'finance', 'reception', 'consultant'] as const
export type InviteRole = (typeof staffRoles)[number]
export interface InviteRequest { email: string; displayName: string; role: InviteRole; consultantId: string | null }
export type InviteField = 'email' | 'displayName' | 'role' | 'consultantId'
export type InviteResult = { ok: true; value: InviteRequest } | { ok: false; field: InviteField }

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const idPattern = /^[a-z0-9][a-z0-9-]{0,63}$/

export function validateInvite(input: unknown): InviteResult {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (email.length > 254 || !emailPattern.test(email)) return { ok: false, field: 'email' }
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''
  if (!displayName || displayName.length > 100) return { ok: false, field: 'displayName' }
  const role = body.role
  if (typeof role !== 'string' || !(staffRoles as readonly string[]).includes(role)) return { ok: false, field: 'role' }
  let consultantId: string | null = null
  if (role === 'consultant') {
    if (typeof body.consultantId !== 'string' || !idPattern.test(body.consultantId)) return { ok: false, field: 'consultantId' }
    consultantId = body.consultantId
  }
  return { ok: true, value: { email, displayName, role: role as InviteRole, consultantId } }
}
