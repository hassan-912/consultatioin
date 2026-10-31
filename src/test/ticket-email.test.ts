import { buildTicketEmail, manageLink, escapeHtml } from '../../supabase/functions/send-ticket-email/email'
import { ticketEmailHandler, secretMatches, type ClaimedEmail, type Config, type Dependencies } from '../../supabase/functions/send-ticket-email/handler'

const config: Config = { webhookSecret: 'whsec-test', resendApiKey: 're_test_key', emailFrom: 'MG <tickets@example.com>', siteUrl: 'https://mg.example.com/app/' }
const row = (over: Partial<ClaimedEmail> = {}): ClaimedEmail => ({
  outbox_id: 'o-1', idempotency_key: 'ticket-email/o-1', attempt_count: 1, reference: 'MG-AB12', manage_token: 'tok_ABCDEFGH12345678',
  customer_name: 'Sara <img src=x onerror=alert(1)>', customer_email: 'sara@example.com', lang: 'en',
  starts_at: '2026-11-20T10:00:00Z', tz: 'Africa/Cairo', format: 'in-person', ...over,
})
function setup(over: Partial<Dependencies> = {}, rows: ClaimedEmail[] = [row()]) {
  const deps = {
    config,
    claim: vi.fn().mockResolvedValue(rows),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
    fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'prov-1' }), { status: 200 })),
    log: vi.fn(),
    ...over,
  } satisfies Dependencies
  const call = (headers: Record<string, string> = { 'x-webhook-secret': 'whsec-test' }, method = 'POST') =>
    ticketEmailHandler(deps)(new Request('https://x.example/functions/v1/send-ticket-email', { method, headers, body: method === 'POST' ? '{}' : undefined }))
  return { deps, call }
}

describe('email builder', () => {
  const base = { name: 'Sara', reference: 'MG-AB12', startsAt: '2026-11-20T10:00:00Z', tz: 'Africa/Cairo', format: 'in-person' as const, manageUrl: 'https://mg.example.com/#/ticket/abc' }
  test('escapes user fields in html but not in plain text', () => {
    const e = buildTicketEmail({ ...base, lang: 'en', name: '<script>x</script> & "q"', reference: 'R<1>' })
    expect(e.html).not.toContain('<script>')
    expect(e.html).toContain('&lt;script&gt;x&lt;/script&gt; &amp; &quot;q&quot;')
    expect(e.html).toContain('R&lt;1&gt;')
    expect(e.text).toContain('<script>x</script> & "q"')
    expect(escapeHtml("'")).toBe('&#39;')
  })
  test('english vs arabic: lang, direction, MG details, manage link and PDF fallback', () => {
    const en = buildTicketEmail({ ...base, lang: 'en' })
    const ar = buildTicketEmail({ ...base, lang: 'ar' })
    expect(en.html).toContain('lang="en" dir="ltr"')
    expect(ar.html).toContain('lang="ar" dir="rtl"')
    expect(en.subject).toBe('Your MG consultation is confirmed (MG-AB12)')
    expect(ar.subject).toContain('تم تأكيد')
    for (const m of [en, ar]) {
      expect(m.text).toContain('17621'); expect(m.text).toContain('Info@mg-visa.com')
      expect(m.text).toContain(base.manageUrl); expect(m.html).toContain(`href="${base.manageUrl}"`)
    }
    expect(en.text).toContain('Download PDF')
    expect(ar.text).toContain('PDF')
  })
  test('online consultations are information only (no meeting URL)', () => {
    const e = buildTicketEmail({ ...base, lang: 'en', format: 'online' })
    expect(e.text).toContain('Zoom or Google Meet')
    expect(e.text).not.toMatch(/zoom\.us|meet\.google/)
  })
  test('manage link uses the fixed hash-router origin and rejects unsafe config', () => {
    expect(manageLink('https://mg.example.com/app/', 'tok_ABCDEFGH12345678')).toBe('https://mg.example.com/app/#/ticket/tok_ABCDEFGH12345678')
    expect(manageLink('https://mg.example.com', 'tok_ABCDEFGH12345678')).toBe('https://mg.example.com/#/ticket/tok_ABCDEFGH12345678')
    expect(manageLink('http://localhost:5173', 'tok_ABCDEFGH12345678')).toBe('http://localhost:5173/#/ticket/tok_ABCDEFGH12345678')
    expect(manageLink('http://mg.example.com', 'tok_ABCDEFGH12345678')).toBeNull()
    expect(manageLink('not a url', 'tok_ABCDEFGH12345678')).toBeNull()
    expect(manageLink('https://mg.example.com', '../evil')).toBeNull()
  })
})

describe('handler', () => {
  test('secret is verified before any database or provider access', async () => {
    const { deps, call } = setup()
    expect((await call({})).status).toBe(401)
    expect((await call({ 'x-webhook-secret': 'wrong' })).status).toBe(401)
    expect((await call(undefined, 'GET')).status).toBe(405)
    expect(deps.claim).not.toHaveBeenCalled(); expect(deps.fetch).not.toHaveBeenCalled()
    expect(secretMatches('a', 'a')).toBe(true); expect(secretMatches('a', 'ab')).toBe(false); expect(secretMatches(null, 'a')).toBe(false)
  })
  test('missing webhook secret config fails closed', async () => {
    const { deps, call } = setup({ config: { ...config, webhookSecret: undefined } })
    expect((await call()).status).toBe(503)
    expect(deps.claim).not.toHaveBeenCalled()
  })
  test.each([['RESEND_API_KEY', { resendApiKey: undefined }], ['EMAIL_FROM', { emailFrom: undefined }], ['SITE_URL', { siteUrl: undefined }], ['SITE_URL http', { siteUrl: 'http://mg.example.com' }]])(
    'missing %s: nothing is claimed or sent, events stay pending', async (_n, patch) => {
      const { deps, call } = setup({ config: { ...config, ...patch } })
      const res = await call()
      expect(await res.json()).toMatchObject({ status: 'NOT_CONFIGURED', sent: 0 })
      expect(deps.claim).not.toHaveBeenCalled(); expect(deps.fetch).not.toHaveBeenCalled(); expect(deps.complete).not.toHaveBeenCalled()
    })
  test('sends with a stable Idempotency-Key, escapes, honors lang, records success after acceptance', async () => {
    const { deps, call } = setup({}, [row({ lang: 'ar' })])
    const res = await call()
    expect(await res.json()).toMatchObject({ sent: 1, failed: 0 })
    const [url, init] = vi.mocked(deps.fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    const headers = init.headers as Record<string, string>
    expect(headers['Idempotency-Key']).toBe('ticket-email/o-1')
    expect(headers.Authorization).toBe('Bearer re_test_key')
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({ from: config.emailFrom, to: ['sara@example.com'] })
    expect(body.html).toContain('dir="rtl"')
    expect(body.html).not.toContain('<img')
    expect(body.text).toContain('https://mg.example.com/app/#/ticket/tok_ABCDEFGH12345678')
    expect(deps.complete).toHaveBeenCalledWith('o-1', 'prov-1')
    expect(deps.fail).not.toHaveBeenCalled()
  })
  test('retry of the same row uses the same Idempotency-Key', async () => {
    const { deps, call } = setup()
    await call(); await call()
    const keys = vi.mocked(deps.fetch).mock.calls.map(([, i]) => (i!.headers as Record<string, string>)['Idempotency-Key'])
    expect(keys).toEqual(['ticket-email/o-1', 'ticket-email/o-1'])
  })
  test.each([[500, false], [429, false], [409, false], [422, true], [403, true]])('provider %i: no success timestamp, permanent=%s', async (status, permanent) => {
    const { deps, call } = setup({ fetch: vi.fn().mockResolvedValue(new Response('{"message":"secret detail sara@example.com"}', { status })) })
    expect(await (await call()).json()).toMatchObject({ sent: 0, failed: 1 })
    expect(deps.complete).not.toHaveBeenCalled()
    expect(deps.fail).toHaveBeenCalledWith('o-1', `PROVIDER_${status}`, permanent)
  })
  test('network error and timeout leave the row retryable; logs carry no tokens or PII', async () => {
    const { deps, call } = setup({ fetch: vi.fn().mockRejectedValue(new TypeError('connect re_test_key sara@example.com')) })
    await call()
    expect(deps.complete).not.toHaveBeenCalled()
    expect(deps.fail).toHaveBeenCalledWith('o-1', 'PROVIDER_NETWORK', false)
    const timeout = setup({ fetch: vi.fn().mockRejectedValue(new DOMException('t', 'TimeoutError')) })
    await timeout.call()
    expect(timeout.deps.fail).toHaveBeenCalledWith('o-1', 'PROVIDER_TIMEOUT', false)
    const logged = JSON.stringify(vi.mocked(deps.log!).mock.calls)
    for (const secret of ['re_test_key', 'sara@example.com', 'whsec-test', 'tok_ABCDEFGH12345678']) expect(logged).not.toContain(secret)
  })
  test('a failure to record after provider acceptance is not reported as sent', async () => {
    const { deps, call } = setup({ complete: vi.fn().mockRejectedValue(new Error('db down')) })
    expect(await (await call()).json()).toMatchObject({ sent: 0 })
    expect(deps.log).toHaveBeenCalledWith('record_failed', { outbox: 'o-1' })
  })
  test('an unusable manage token is a permanent failure and sends nothing', async () => {
    const { deps, call } = setup({}, [row({ manage_token: '../bad' })])
    await call()
    expect(deps.fetch).not.toHaveBeenCalled()
    expect(deps.fail).toHaveBeenCalledWith('o-1', 'BAD_MANAGE_LINK', true)
  })
})
