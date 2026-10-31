import { validateInvite, type InviteRequest } from './validate.ts'

export type CallerProfile = { role: string; active: boolean } | null
export type Dependencies = {
  siteUrl: string
  /** Verifies the caller's JWT and returns the auth user id, or null when it is not a valid session. */
  verifyUser: (jwt: string) => Promise<string | null>
  /** Service-role read of the caller's staff_profiles row. */
  callerProfile: (userId: string) => Promise<CallerProfile>
  consultantExists: (consultantId: string) => Promise<boolean>
  /** auth.admin.inviteUserByEmail; throws Error('ALREADY_EXISTS') when the address is already registered. */
  invite: (email: string, redirectTo: string) => Promise<string>
  /** Calls the insert-only, audited SQL function; throws Error('ALREADY_EXISTS') when a profile exists. Never overwrites. */
  grantProfile: (actorId: string, userId: string, request: InviteRequest) => Promise<void>
}

const statuses: Record<string, number> = { UNAUTHENTICATED: 401, FORBIDDEN: 403, INVALID_INPUT: 400, ALREADY_EXISTS: 409 }

/** Admin-only staff invitation. The service-role key lives only in the Deno entry point that builds `deps`. */
export function inviteHandler(deps: Dependencies) {
  const allowedOrigin = new URL(deps.siteUrl).origin
  const redirectTo = `${allowedOrigin}/#/staff/reset`
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin')
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
      ...(origin === allowedOrigin ? { 'Access-Control-Allow-Origin': origin } : {}) }
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers })
    const fail = (code: string, extra: Record<string, unknown> = {}) => reply(statuses[code] ?? 500, { error: code, ...extra })
    if (origin && origin !== allowedOrigin) return fail('FORBIDDEN')
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers,
      'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' } })
    if (request.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' })
    const jwt = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1]
    if (!jwt) return fail('UNAUTHENTICATED')
    if (!request.headers.get('content-type')?.startsWith('application/json')) return fail('INVALID_INPUT')
    if (Number(request.headers.get('content-length')) > 4096) return reply(413, { error: 'REQUEST_TOO_LARGE' })
    try {
      const userId = await deps.verifyUser(jwt)
      if (!userId) return fail('UNAUTHENTICATED')
      const caller = await deps.callerProfile(userId)
      if (!caller || !caller.active || caller.role !== 'admin') return fail('FORBIDDEN')
      const parsed = validateInvite(await request.json())
      if (!parsed.ok) return fail('INVALID_INPUT', { field: parsed.field })
      const { value } = parsed
      if (value.consultantId && !(await deps.consultantExists(value.consultantId))) return fail('INVALID_INPUT', { field: 'consultantId' })
      const invitedId = await deps.invite(value.email, redirectTo)
      await deps.grantProfile(userId, invitedId, value)
      return reply(200, { userId: invitedId })
    } catch (error) {
      if (error instanceof SyntaxError) return fail('INVALID_INPUT')
      const message = error instanceof Error ? error.message : ''
      return message in statuses ? fail(message) : fail('INVITE_UNAVAILABLE')
    }
  }
}
