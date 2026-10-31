import { inviteHandler, type Dependencies } from '../../supabase/functions/invite-staff/handler'
import { validateInvite } from '../../supabase/functions/invite-staff/validate'

test('validator normalises and rejects bad invitations field by field', () => {
  expect(validateInvite({ email: ' New@Example.COM ', displayName: ' Nora ', role: 'finance', consultantId: 'ignored' }))
    .toEqual({ ok: true, value: { email: 'new@example.com', displayName: 'Nora', role: 'finance', consultantId: null } })
  expect(validateInvite({ email: 'a@b.co', displayName: 'C', role: 'consultant', consultantId: 'ahmed-tarek' }))
    .toMatchObject({ ok: true, value: { consultantId: 'ahmed-tarek' } })
  expect(validateInvite({ email: 'nope', displayName: 'N', role: 'admin' })).toEqual({ ok: false, field: 'email' })
  expect(validateInvite({ email: 'a@b.co', displayName: '  ', role: 'admin' })).toEqual({ ok: false, field: 'displayName' })
  expect(validateInvite({ email: 'a@b.co', displayName: 'x'.repeat(101), role: 'admin' })).toEqual({ ok: false, field: 'displayName' })
  expect(validateInvite({ email: 'a@b.co', displayName: 'N', role: 'owner' })).toEqual({ ok: false, field: 'role' })
  expect(validateInvite({ email: 'a@b.co', displayName: 'N', role: 'consultant' })).toEqual({ ok: false, field: 'consultantId' })
  expect(validateInvite({ email: 'a@b.co', displayName: 'N', role: 'consultant', consultantId: '../x' })).toEqual({ ok: false, field: 'consultantId' })
  expect(validateInvite(null)).toEqual({ ok: false, field: 'email' })
})

const body = { email: 'new@example.com', displayName: 'Nora', role: 'reception' }
function setup(over: Partial<Dependencies> = {}) {
  const deps = {
    siteUrl: 'https://mg.example.com/app',
    verifyUser: vi.fn().mockResolvedValue('admin-id'),
    callerProfile: vi.fn().mockResolvedValue({ role: 'admin', active: true }),
    consultantExists: vi.fn().mockResolvedValue(true),
    invite: vi.fn().mockResolvedValue('new-id'),
    grantProfile: vi.fn().mockResolvedValue(undefined),
    ...over,
  } satisfies Dependencies
  const call = (init: { headers?: Record<string, string>; body?: unknown; method?: string } = {}) =>
    inviteHandler(deps)(new Request('https://x.example/functions/v1/invite-staff', {
      method: init.method ?? 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer jwt', ...init.headers },
      body: init.method === 'GET' ? undefined : JSON.stringify(init.body ?? body),
    }))
  return { deps, call }
}

test('active admin invites: redirect goes to the reset screen and the profile is written', async () => {
  const { deps, call } = setup()
  const res = await call()
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ userId: 'new-id' })
  expect(deps.invite).toHaveBeenCalledWith('new@example.com', 'https://mg.example.com/#/staff/reset')
  expect(deps.grantProfile).toHaveBeenCalledWith('admin-id', 'new-id', { email: 'new@example.com', displayName: 'Nora', role: 'reception', consultantId: null })
})

test('missing or invalid JWT is 401 and nothing is invited', async () => {
  const { deps, call } = setup({ verifyUser: vi.fn().mockResolvedValue(null) })
  expect((await call()).status).toBe(401)
  expect((await setup().call({ headers: { authorization: '' } })).status).toBe(401)
  expect(deps.invite).not.toHaveBeenCalled()
})

test('non-admin, inactive admin and unknown caller are 403', async () => {
  for (const profile of [{ role: 'finance', active: true }, { role: 'admin', active: false }, null]) {
    const { deps, call } = setup({ callerProfile: vi.fn().mockResolvedValue(profile) })
    expect((await call()).status).toBe(403)
    expect(deps.invite).not.toHaveBeenCalled()
    expect(deps.grantProfile).not.toHaveBeenCalled()
  }
})

test('invalid input, unknown consultant, existing account and provider failure map to stable codes', async () => {
  const bad = await setup().call({ body: { ...body, email: 'nope' } })
  expect(bad.status).toBe(400)
  expect(await bad.json()).toEqual({ error: 'INVALID_INPUT', field: 'email' })
  const unknown = setup({ consultantExists: vi.fn().mockResolvedValue(false) })
  expect((await unknown.call({ body: { ...body, role: 'consultant', consultantId: 'ghost' } })).status).toBe(400)
  const dup = setup({ invite: vi.fn().mockRejectedValue(new Error('ALREADY_EXISTS')) })
  const res = await dup.call()
  expect(res.status).toBe(409)
  expect(dup.deps.grantProfile).not.toHaveBeenCalled()
  const broken = setup({ invite: vi.fn().mockRejectedValue(new Error('boom: secret detail')) })
  const failed = await broken.call()
  expect(failed.status).toBe(500)
  expect(await failed.json()).toEqual({ error: 'INVITE_UNAVAILABLE' })
})

test('an existing staff profile (pending or not) is a 409 and the grant is not retried or overwritten', async () => {
  const { deps, call } = setup({ grantProfile: vi.fn().mockRejectedValue(new Error('ALREADY_EXISTS')) })
  const res = await call()
  expect(res.status).toBe(409)
  expect(await res.json()).toEqual({ error: 'ALREADY_EXISTS' })
  expect(deps.grantProfile).toHaveBeenCalledOnce()
})

test('foreign origins and non-POST methods are refused', async () => {
  expect((await setup().call({ headers: { origin: 'https://evil.example' } })).status).toBe(403)
  expect((await setup().call({ method: 'GET' })).status).toBe(405)
})
