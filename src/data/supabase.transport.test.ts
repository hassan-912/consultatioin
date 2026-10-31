import { createBackendClients } from '../lib/supabase'
import { createSupabaseRepo, STAFF_BOOKING_COLUMNS } from './supabase'
import { SlotTaken } from './types'

const row = {
  id: 'c36de880-ff66-4ea8-a724-80dcc0a48800', reference: 'MG-ABCD-EFGH', consultant_id: 'mohamed-gamal', branch_id: 'nasr-city',
  format: 'online', starts_at: '2026-11-02T10:00:00Z', ends_at: '2026-11-02T10:30:00Z', tz: 'Africa/Cairo',
  price_amount: 1000, price_currency: 'EGP', customer_name: 'Sara', customer_phone: '+201001234567', customer_email: null,
  channel: 'whatsapp', lang: 'en', program: 'immigration', note: null, status: 'confirmed',
  hold_expires_at: '2026-11-02T09:00:00Z', created_at: '2026-11-01T10:00:00Z',
}
type RequestLog = { url: URL; headers: Headers; body: any; method: string }
let clientNumber = 0
function harness(handler: (r: RequestLog) => any) {
  const calls: RequestLog[] = []
  const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const r = { url: new URL(String(input)), headers: new Headers(init?.headers), body: init?.body, method: init?.method ?? 'GET' }
    if (typeof r.body === 'string') { try { r.body = JSON.parse(r.body) } catch { /* not JSON */ } }
    calls.push(r)
    const response = await handler(r)
    return response instanceof Response ? response : new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  const clients = createBackendClients('http://127.0.0.1:54321', 'sb_publishable_test-only', request, `mg-transport-test-${clientNumber++}`)
  vi.spyOn(clients.staff.auth, 'getSession').mockResolvedValue({ data: { session: { access_token: 'real-staff-jwt', expires_at: 9999999999, user: { id: 'staff' } } }, error: null } as any)
  return { clients, calls, repo: createSupabaseRepo(clients) }
}
test('anonymous RPC requests cannot inherit staff Authorization; customer auth is disabled', async () => {
  const h = harness(() => ['2026-11-02T10:00:00+02:00'])
  expect(h.clients.customer).not.toBe(h.clients.staff)
  expect(() => h.clients.customer.auth.getSession).toThrow(/accessToken/)
  const slots = await h.repo.availableSlots('mohamed-gamal', '2026-11-02', 'online')
  expect(slots[0]).toEqual({ startIso: '2026-11-02T08:00:00.000Z', endIso: '2026-11-02T08:30:00.000Z' })
  expect(h.calls[0].headers.get('authorization')).not.toContain('real-staff-jwt')
  expect(h.calls[0].body).toEqual({ p_consultant_id: 'mohamed-gamal', p_date: '2026-11-02', p_format: 'online' })
})
test('reschedule availability uses capability-scoped RPC, never arbitrary booking exclusions', async () => {
  const h = harness(() => [])
  await h.repo.availableSlots('ignored', '2026-11-02', 'online', 'customer-capability')
  expect(h.calls[0].url.pathname).toBe('/rest/v1/rpc/reschedule_slots')
  expect(h.calls[0].body).toEqual({ p_manage_token: 'customer-capability', p_date: '2026-11-02' })
})
test('signed receipt capability is requested without Authorization, uploaded, then submitted', async () => {
  const h = harness(r => {
    if (r.url.pathname.includes('/functions/')) return { bucket: 'receipts', booking_id: row.id, path: `${row.id}/receipt.png`, token: 'upload-token', signedUrl: 'unused' }
    if (r.url.pathname.includes('/storage/')) return { Key: `${row.id}/receipt.png` }
    return { ...row, customer: { name: 'Sara', phone: '+201001234567', channel: 'whatsapp', lang: 'en' }, manage_token: 'manage', qr_token: 'qr', status: 'on-hold' }
  })
  await h.repo.submitPayment('manage', { method: 'instapay', txnRef: 'TX1234', receiptImage: 'data:image/png;base64,YWJj' })
  expect(h.calls).toHaveLength(3)
  expect(h.calls[0].headers.has('authorization')).toBe(false)
  expect(h.calls[0].headers.get('apikey')).toBe('sb_publishable_test-only')
  expect(h.calls[0].body).toEqual({ manage_token: 'manage', mime_type: 'image/png' })
  expect(h.calls[1].url.pathname).toContain(`/object/upload/sign/receipts/${row.id}/receipt.png`)
  expect(h.calls[1].url.searchParams.get('token')).toBe('upload-token')
  expect(h.calls[1].headers.get('x-upsert')).toBe('false')
  expect(h.calls[2].body.p_receipt_path).toBe(`${row.id}/receipt.png`)
})
test('receipt upload failure rejects and does not submit payment', async () => {
  const h = harness(r => r.url.pathname.includes('/functions/')
    ? { bucket: 'receipts', path: `${row.id}/receipt.pdf`, token: 'upload-token' }
    : new Response(JSON.stringify({ message: 'permission denied' }), { status: 403 }))
  await expect(h.repo.submitPayment('manage', { method: 'instapay', txnRef: 'TX1234', receipt: new Blob(['pdf'], { type: 'application/pdf' }) })).rejects.toMatchObject({ code: 'UPLOAD_FAILED' })
  expect(h.calls.some(r => r.url.pathname.endsWith('submit_payment'))).toBe(false)
})
test('staff rows use explicit columns and map payment metadata without acquiring customer capabilities', async () => {
  const h = harness(r => r.url.pathname.endsWith('/payments')
    ? [{ booking_id: row.id, method: 'instapay', txn_ref: 'TX1234', receipt_path: `${row.id}/receipt.pdf`, submitted_at: row.created_at }]
    : [row])
  const list = await h.repo.staffList({})
  expect(h.calls[0].url.searchParams.get('select')).toBe(STAFF_BOOKING_COLUMNS)
  expect(h.calls[0].headers.get('authorization')).toBe('Bearer real-staff-jwt')
  expect(list[0]).toMatchObject({ manageToken: '', qrToken: '', payment: { txnRef: 'TX1234', hasReceipt: true, receiptPath: `${row.id}/receipt.pdf` } })
  expect(h.calls.some(r => r.url.pathname.includes('staff_manage_token'))).toBe(false)
})
test('minimal check-in response refetches authorized columns instead of inventing a full booking', async () => {
  const h = harness(r => r.url.pathname.endsWith('/check_in') ? { verdict: 'ok', booking: { id: row.id, status: 'checked-in' } } : r.url.pathname.endsWith('/payments') ? [] : { ...row, status: 'checked-in' })
  const r = await h.repo.checkIn('MG-ABCD-EFGH')
  expect(r).toMatchObject({ verdict: 'ok', booking: { id: row.id, status: 'checked-in', customer: { phone: row.customer_phone }, qrToken: '', manageToken: '' } })
  expect(h.calls[1].url.searchParams.get('select')).toBe(STAFF_BOOKING_COLUMNS)
})
test('missing authenticated session rejects staff reads before a request', async () => {
  const h = harness(() => [])
  vi.mocked(h.clients.staff.auth.getSession).mockResolvedValue({ data: { session: null }, error: null })
  await expect(h.repo.staffList({})).rejects.toMatchObject({ code: 'FORBIDDEN' })
  expect(h.calls).toHaveLength(0)
})
test('only an explicit staff action requests a manage capability', async () => {
  const h = harness(() => 'customer-capability')
  expect(await h.repo.staffManageToken(row.id)).toBe('customer-capability')
  expect(h.calls[0].url.pathname).toBe('/rest/v1/rpc/staff_manage_token')
  expect(h.calls[0].headers.get('authorization')).toBe('Bearer real-staff-jwt')
})
test('RPC errors and fetch failures reject with actionable repository errors', async () => {
  const h = harness(() => new Response(JSON.stringify({ message: 'SLOT_TAKEN', code: 'P0001' }), { status: 400, headers: { 'Content-Type': 'application/json' } }))
  await expect(h.repo.cancel('manage')).rejects.toBeInstanceOf(SlotTaken)
  const broken = harness(() => { throw new TypeError('Failed to fetch') })
  await expect(broken.repo.find('ref', 'phone')).rejects.toMatchObject({ code: 'NETWORK' })
})
test('receipt viewer signs with the staff client and returns only an ephemeral URL', async () => {
  const h = harness(r => r.url.pathname.endsWith('/current_staff_role') ? 'finance' : r.url.pathname.endsWith('/payments') ? [{ receipt_path: `${row.id}/receipt.pdf` }] : { signedURL: '/object/sign/receipts/receipt.pdf?token=short-lived' })
  const url = await h.repo.receiptUrl(row.id)
  expect(url).toContain('token=short-lived')
  expect(h.calls.every(r => r.headers.get('authorization') === 'Bearer real-staff-jwt')).toBe(true)
})
test('reception cannot request signed receipt URLs even with an authenticated session', async () => {
  const h = harness(() => 'reception')
  await expect(h.repo.receiptUrl(row.id)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  expect(h.calls).toHaveLength(1)
  expect(h.calls[0].url.pathname).toBe('/rest/v1/rpc/current_staff_role')
})
test('Realtime is staff-only invalidation requesting id/status, and unsubscribe detaches it', () => {
  const h = harness(() => [])
  const channel = { on: vi.fn(), subscribe: vi.fn() }
  channel.on.mockReturnValue(channel)
  channel.subscribe.mockReturnValue(channel)
  vi.spyOn(h.clients.staff, 'channel').mockReturnValue(channel as any)
  const remove = vi.spyOn(h.clients.staff, 'removeChannel').mockResolvedValue('ok')
  const listener = vi.fn()
  const off = h.repo.subscribe(listener)
  expect(channel.on.mock.calls[0][1]).toEqual({ event: '*', schema: 'public', table: 'bookings', select: ['id', 'status'] })
  channel.on.mock.calls[0][2]({ new: { id: row.id, status: 'confirmed' } })
  expect(listener).toHaveBeenCalledOnce()
  off()
  expect(remove).toHaveBeenCalledWith(channel)
})
test('a failed storage upload surfaces as UPLOAD_FAILED, not a generic network error', async () => {
  const h = harness(r => r.url.pathname.includes('/functions/')
    ? { bucket: 'receipts', path: `${row.id}/receipt.png`, token: 'upload-token' }
    : new Response(JSON.stringify({ message: 'boom' }), { status: 500 }))
  await expect(h.repo.submitPayment('manage', { method: 'instapay', txnRef: 'TX1234', receiptImage: 'data:image/png;base64,YWJj' })).rejects.toMatchObject({ code: 'UPLOAD_FAILED' })
})
test('missing live configuration is refused rather than falling back to local data', () => {
  expect(() => createBackendClients('', '')).toThrow('LIVE_CONFIG_MISSING')
})
test('default and supplied fetch are never invoked as a method of another object', async () => {
  const receivers: unknown[] = []
  const native = vi.fn(async function (this: unknown) {
    receivers.push(this)
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation')
    return new Response(JSON.stringify({ error: 'x' }), { status: 500 })
  })
  vi.stubGlobal('fetch', native)
  try {
    for (const clients of [createBackendClients('http://127.0.0.1:54321', 'k', undefined, 'mg-bind-default'), createBackendClients('http://127.0.0.1:54321', 'k', native as unknown as typeof fetch, 'mg-bind-native')]) {
      await expect(createSupabaseRepo(clients).submitPayment('manage', { method: 'instapay', txnRef: 'TX1234', receiptImage: 'data:image/png;base64,YWJj' })).rejects.not.toMatchObject({ cause: expect.objectContaining({ message: 'Illegal invocation' }) })
    }
    expect(receivers.length).toBeGreaterThanOrEqual(2)
    expect(receivers.every(r => r === undefined || r === globalThis)).toBe(true)
  } finally { vi.unstubAllGlobals() }
})
