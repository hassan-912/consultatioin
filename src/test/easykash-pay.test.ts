import { easykashPayHandler, easykashMobile, PAYMENT_OPTIONS, type Dependencies } from '../../supabase/functions/easykash-pay/handler'

const TOKEN = 'a'.repeat(32)
const SITE = 'https://consultatioin.vercel.app'
const attempt = { customer_reference: 'MG-AB12-1', amount: 21, currency: 'USD' as const, name: 'Sara', email: null, phone: '+201001234567' }

function setup(over: Partial<Dependencies> = {}, easykash: (path: string, body: any) => unknown = () => ({ redirectUrl: 'https://www.easykash.net/DirectPayV1/ABC123' })) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const body = easykash(new URL(url).pathname, JSON.parse(String(init.body)))
    return new Response(JSON.stringify(body), { status: body ? 200 : 500 })
  })
  const deps = {
    siteUrl: SITE, anonKey: 'anon', apiKey: 'ek-key',
    rates: vi.fn().mockResolvedValue({ USD: 0.0201, EUR: 0.0185, AED: 0.0738 }),
    start: vi.fn().mockResolvedValue(attempt),
    openAttempt: vi.fn().mockResolvedValue('MG-AB12-1'),
    record: vi.fn().mockResolvedValue(true),
    apply: vi.fn().mockResolvedValue('confirmed'),
    fetch: fetchMock as unknown as typeof fetch,
    ...over,
  } satisfies Dependencies
  const call = (body: unknown, headers: Record<string, string> = {}) => easykashPayHandler(deps)(new Request('https://x.supabase.co/functions/v1/easykash-pay', {
    method: 'POST', headers: { 'Content-Type': 'application/json', origin: SITE, ...headers }, body: JSON.stringify(body),
  }))
  return { deps, call, fetchMock }
}

test('start: server-side amount, instant methods only, no secrets in the return link', async () => {
  const { deps, call, fetchMock } = setup()
  const res = await call({ action: 'start', manage_token: TOKEN, currency: 'USD' })
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ redirectUrl: 'https://www.easykash.net/DirectPayV1/ABC123' })
  expect(deps.start).toHaveBeenCalledWith(TOKEN, 'USD', 0.0201)
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('https://back.easykash.net/api/directpayv1/pay')
  expect((init.headers as Record<string, string>).authorization).toBe('ek-key')
  const sent = JSON.parse(String(init.body))
  expect(sent).toMatchObject({ amount: 21, currency: 'USD', paymentOptions: PAYMENT_OPTIONS, mobile: '01001234567', customerReference: 'MG-AB12-1', redirectUrl: `${SITE}/#/pay/return` })
  expect(sent.redirectUrl).not.toContain(TOKEN)
  expect(sent.email).toBeTruthy()
})

test('EGP needs no exchange rate', async () => {
  const { deps, call } = setup({ start: vi.fn().mockResolvedValue({ ...attempt, currency: 'EGP', amount: 1000 }) })
  await call({ action: 'start', manage_token: TOKEN, currency: 'EGP' })
  expect(deps.rates).not.toHaveBeenCalled()
  expect(deps.start).toHaveBeenCalledWith(TOKEN, 'EGP', 1)
})

test('refuses bad input, other origins, staff tokens, and answers 503 before the key is set', async () => {
  const { call } = setup()
  expect((await call({ action: 'start', manage_token: 'short', currency: 'USD' })).status).toBe(400)
  expect((await call({ action: 'start', manage_token: TOKEN, currency: 'GBP' })).status).toBe(400)
  expect((await call({ action: 'start', manage_token: TOKEN, currency: 'USD' }, { origin: 'https://evil.example' })).status).toBe(403)
  expect((await call({ action: 'start', manage_token: TOKEN, currency: 'USD' }, { authorization: 'Bearer staff-jwt' })).status).toBe(403)
  expect((await setup({ apiKey: undefined }).call({ action: 'start', manage_token: TOKEN, currency: 'USD' })).status).toBe(503)
})

test('database refusals pass through; EasyKash failures and odd redirect links do not leak', async () => {
  const expired = setup({ start: vi.fn().mockRejectedValue(new Error('HOLD_EXPIRED')) })
  const res = await expired.call({ action: 'start', manage_token: TOKEN, currency: 'EGP' })
  expect(res.status).toBe(409)
  expect(await res.json()).toEqual({ error: 'HOLD_EXPIRED' })
  expect((await setup({}, () => null).call({ action: 'start', manage_token: TOKEN, currency: 'EGP' })).status).toBe(502)
  expect((await setup({}, () => ({ redirectUrl: 'https://phish.example/pay' })).call({ action: 'start', manage_token: TOKEN, currency: 'EGP' })).status).toBe(502)
})

test('check: a PAID inquiry is stored and applied; anything else changes nothing', async () => {
  const paid = setup({}, () => ({ status: 'PAID', easykashRef: '777', Amount: '1000', PaymentMethod: 'Credit & Debit Card' }))
  const res = await paid.call({ action: 'check', manage_token: TOKEN })
  expect(await res.json()).toEqual({ status: 'paid', outcome: 'confirmed' })
  expect(paid.deps.record).toHaveBeenCalledWith(expect.objectContaining({ easykashRef: '777', customerReference: 'MG-AB12-1', status: 'PAID' }))
  expect(paid.deps.apply).toHaveBeenCalledWith('777')

  const pending = setup({}, () => ({ status: 'NEW' }))
  expect(await (await pending.call({ action: 'check', manage_token: TOKEN })).json()).toEqual({ status: 'new' })
  expect(pending.deps.apply).not.toHaveBeenCalled()

  const none = setup({ openAttempt: vi.fn().mockResolvedValue(null) })
  expect(await (await none.call({ action: 'check', manage_token: TOKEN })).json()).toEqual({ status: 'none' })
  expect(none.fetchMock).not.toHaveBeenCalled()
})

test('mobile numbers in the format EasyKash expects', () => {
  expect(easykashMobile('+201001234567')).toBe('01001234567')
  expect(easykashMobile('+971501234567')).toBe('971501234567')
})

test('background check: only with the shared secret; asks EasyKash about each due attempt and applies PAID ones', async () => {
  const replies: Record<string, unknown> = { 'MG-A-1': { status: 'PAID', easykashRef: '901', Amount: '1000' }, 'MG-B-1': { status: 'NEW' } }
  const { deps } = setup({ sweepSecret: 'shh', claimChecks: vi.fn().mockResolvedValue(['MG-A-1', 'MG-B-1']) }, (_path, body) => replies[body.customerReference])
  const sweep = (secret: string) => easykashPayHandler(deps)(new Request('https://x.supabase.co/functions/v1/easykash-pay', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-webhook-secret': secret }, body: '{"action":"sweep"}',
  }))
  expect((await sweep('wrong')).status).toBe(401)
  expect(deps.claimChecks).not.toHaveBeenCalled()
  const res = await sweep('shh')
  expect(await res.json()).toEqual({ checked: 2, outcomes: { confirmed: 1, new: 1 } })
  expect(deps.record).toHaveBeenCalledTimes(1)
  expect(deps.apply).toHaveBeenCalledWith('901')
})

test('background check is off when no secret is configured', async () => {
  const { deps } = setup({ claimChecks: vi.fn() })
  const res = await easykashPayHandler(deps)(new Request('https://x.supabase.co/functions/v1/easykash-pay', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-webhook-secret': '' }, body: '{"action":"sweep"}',
  }))
  expect(res.status).toBe(401)
})

test('"payment is not attempted yet" from EasyKash means not paid, not an error', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: 'Error your payment is not attempted yet!' }), { status: 400 }))
  const { call } = setup({ fetch: fetchMock as unknown as typeof fetch })
  const res = await call({ action: 'check', manage_token: TOKEN })
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ status: 'not_attempted' })
})
