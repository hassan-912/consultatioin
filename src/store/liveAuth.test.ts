import type { SupabaseClient } from '@supabase/supabase-js'
import { signUpWithEmail, openRecoveryLink, requestPasswordReset, restoreStaffSession, setNewPassword, signInWithEmail, watchStaffAuth } from './liveAuth'
import { useAppStore } from './useAppStore'

type Profile = { role: string; consultant_id: string | null; display_name: string; active: boolean } | null
function mockClient(profile: Profile, over: { signIn?: unknown; session?: unknown } = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: profile, error: null })
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  let listener: (event: string) => void = () => {}
  const auth = {
    signInWithPassword: vi.fn().mockResolvedValue(over.signIn ?? { data: { user: { id: 'u1', email: 'staff@example.com' } }, error: null }),
    getSession: vi.fn().mockResolvedValue({ data: { session: over.session ?? null } }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    updateUser: vi.fn().mockResolvedValue({ error: null }),
    setSession: vi.fn().mockResolvedValue({ error: null }),
    exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: vi.fn((fn: (e: string) => void) => { listener = fn; return { data: { subscription: { unsubscribe: vi.fn() } } } }),
  }
  const client = { auth, from: vi.fn(() => ({ select })) } as unknown as SupabaseClient
  return { client, auth, select, eq, emit: (e: string) => listener(e) }
}

beforeEach(() => useAppStore.setState({ staffSession: null, role: 'reception' }))

test('active profile signs in with the profile role, not anything the browser supplies', async () => {
  const { client, auth, select, eq } = mockClient({ role: 'finance', consultant_id: null, display_name: 'Fin', active: true })
  expect(await signInWithEmail('  Staff@Example.com ', 'pw', client)).toBe('ok')
  expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'staff@example.com', password: 'pw' })
  expect(select).toHaveBeenCalledWith('role,consultant_id,display_name,active')
  expect(eq).toHaveBeenCalledWith('user_id', 'u1')
  expect(useAppStore.getState().staffSession).toEqual({ username: 'staff@example.com', role: 'finance', consultantId: null })
  expect(useAppStore.getState().role).toBe('finance')
})

test('consultant session carries only their own consultant id', async () => {
  const { client } = mockClient({ role: 'consultant', consultant_id: 'ahmed-tarek', display_name: 'AT', active: true })
  await signInWithEmail('a@example.com', 'pw', client)
  expect(useAppStore.getState().staffSession).toMatchObject({ role: 'consultant', consultantId: 'ahmed-tarek' })
  expect(useAppStore.getState().staffConsultantId).toBe('ahmed-tarek')
})

test('a deactivated profile is refused and the auth session is ended', async () => {
  const { client, auth } = mockClient({ role: 'admin', consultant_id: null, display_name: 'X', active: false })
  expect(await signInWithEmail('x@example.com', 'pw', client)).toBe('inactive')
  expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  expect(useAppStore.getState().staffSession).toBeNull()
})

test('no profile yet: an access request is filed and the person waits for approval with no staff access', async () => {
  const { client, auth } = mockClient(null)
  const rpc = vi.fn().mockResolvedValue({ data: 'pending', error: null })
  Object.assign(client, { rpc })
  expect(await signInWithEmail('x@example.com', 'pw', client)).toBe('pending')
  expect(rpc).toHaveBeenCalledWith('request_staff_access', { p_display_name: '' })
  expect(auth.signOut).not.toHaveBeenCalled()
  expect(useAppStore.getState().staffSession).toBeNull()
  expect(useAppStore.getState().staffPending).toEqual({ email: 'staff@example.com', name: '' })
})

test('wrong password is invalid; a network failure is unavailable; neither opens a session', async () => {
  const bad = mockClient(null, { signIn: { data: { user: null }, error: { name: 'AuthApiError', status: 400 } } })
  expect(await signInWithEmail('x@example.com', 'no', bad.client)).toBe('invalid')
  const down = mockClient(null)
  down.auth.signInWithPassword.mockRejectedValue(new Error('offline'))
  expect(await signInWithEmail('x@example.com', 'pw', down.client)).toBe('unavailable')
  expect(useAppStore.getState().staffSession).toBeNull()
  expect(await signInWithEmail('x@example.com', 'pw', null)).toBe('unavailable')
})

test('a stored session is restored from the profile; an inactive profile is not', async () => {
  const ok = mockClient({ role: 'admin', consultant_id: null, display_name: 'A', active: true }, { session: { user: { id: 'u1', email: 'a@example.com' } } })
  expect(await restoreStaffSession(ok.client)).toBe('ok')
  expect(useAppStore.getState().staffSession?.role).toBe('admin')
  const gone = mockClient({ role: 'admin', consultant_id: null, display_name: 'A', active: false }, { session: { user: { id: 'u1' } } })
  expect(await restoreStaffSession(gone.client)).toBe('inactive')
  expect(useAppStore.getState().staffSession).toBeNull()
  expect(await restoreStaffSession(mockClient(null).client)).toBe('none')
})

test('auth sign-out events clear the staff session', () => {
  const { client, emit } = mockClient(null)
  useAppStore.setState({ staffSession: { username: 'a', role: 'admin', consultantId: null } })
  const stop = watchStaffAuth(client)
  emit('TOKEN_REFRESHED')
  expect(useAppStore.getState().staffSession).not.toBeNull()
  emit('SIGNED_OUT')
  expect(useAppStore.getState().staffSession).toBeNull()
  stop()
})

test('password reset links to the hash-routed reset screen on the configured site', async () => {
  vi.stubEnv('VITE_SITE_URL', 'https://mg.example.com/app/')
  const { client, auth } = mockClient(null)
  expect(await requestPasswordReset(' Staff@Example.com ', client)).toBe('sent')
  expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('staff@example.com', { redirectTo: 'https://mg.example.com/#/staff/reset' })
  vi.stubEnv('VITE_SITE_URL', '')
  expect(await requestPasswordReset('x@example.com', client)).toBe('unavailable')
  vi.unstubAllEnvs()
})

test('recovery links: fragment tokens or code open a session, errors do not; new password ends the session', async () => {
  const { client, auth } = mockClient(null)
  expect(await openRecoveryLink('https://mg.example.com/#/staff/reset#access_token=a&refresh_token=r&type=recovery', client)).toBe(true)
  expect(auth.setSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' })
  expect(await openRecoveryLink('https://mg.example.com/?code=abc#/staff/reset', client)).toBe(true)
  expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc')
  expect(await openRecoveryLink('https://mg.example.com/#/staff/reset#error=access_denied&error_code=otp_expired', client)).toBe(false)
  expect(await openRecoveryLink('https://mg.example.com/#/staff/reset', client)).toBe(false)
  expect(await setNewPassword('long-enough-1', client)).toBe('ok')
  expect(auth.updateUser).toHaveBeenCalledWith({ password: 'long-enough-1' })
  expect(auth.signOut).toHaveBeenCalled()
})

test('self sign-up: a new login waits for approval, confirmation emails and existing addresses are reported', async () => {
  vi.stubEnv('VITE_SITE_URL', 'https://mg.example.com')
  const make = (result: unknown) => {
    const { client, auth } = mockClient(null)
    Object.assign(auth, { signUp: vi.fn().mockResolvedValue(result) })
    Object.assign(client, { rpc: vi.fn().mockResolvedValue({ data: 'pending', error: null }) })
    return { client, auth: auth as typeof auth & { signUp: ReturnType<typeof vi.fn> } }
  }
  const user = { id: 'u2', email: 'aya@example.com', identities: [{}], user_metadata: { display_name: 'Aya' } }
  const ok = make({ data: { user, session: { access_token: 'a' } }, error: null })
  expect(await signUpWithEmail('Aya', 'Aya@Example.com', 'longpassword', ok.client)).toBe('pending')
  expect(ok.auth.signUp).toHaveBeenCalledWith({ email: 'aya@example.com', password: 'longpassword',
    options: { data: { display_name: 'Aya' }, emailRedirectTo: 'https://mg.example.com/#/staff/oauth' } })
  expect(useAppStore.getState().staffPending).toEqual({ email: 'aya@example.com', name: 'Aya' })
  expect(useAppStore.getState().staffSession).toBeNull()

  expect(await signUpWithEmail('Aya', 'aya@example.com', 'longpassword', make({ data: { user, session: null }, error: null }).client)).toBe('confirm')
  expect(await signUpWithEmail('Aya', 'aya@example.com', 'longpassword', make({ data: { user: { ...user, identities: [] }, session: null }, error: null }).client)).toBe('exists')
  vi.unstubAllEnvs()
})
