// Customer-facing: starts an EasyKash payment for a held booking, or asks EasyKash whether it was paid.
// The amount is always worked out server-side (start_easykash_attempt); the browser only picks the currency.

export const CURRENCIES = ['EGP', 'USD', 'EUR', 'AED'] as const
export type Currency = typeof CURRENCIES[number]
/** Instant methods only (a 30-minute hold rules out cash): cards, mobile wallet, Meeza, Apple Pay. */
export const PAYMENT_OPTIONS = [2, 4, 6, 31]
const EASYKASH = 'https://back.easykash.net'

export type Attempt = { customer_reference: string; amount: number; currency: Currency; name: string; email: string | null; phone: string }
export type Dependencies = {
  siteUrl: string
  anonKey: string
  apiKey?: string
  /** Units of USD/EUR/AED per 1 EGP. */
  rates: () => Promise<Record<Exclude<Currency, 'EGP'>, number>>
  start: (token: string, currency: Currency, unitsPerEgp: number) => Promise<Attempt>
  openAttempt: (token: string) => Promise<string | null>
  /** Keeps an inquiry result as if it were a callback; resolves once stored. */
  record: (payload: Record<string, string>) => Promise<unknown>
  apply: (easykashRef: string) => Promise<string>
  fetch: typeof fetch
  log?: (event: string, fields: Record<string, string | number>) => void
}

/** EasyKash wants a local number: Egyptian +20… becomes 0…; others are sent as digits only. */
export function easykashMobile(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return phone.startsWith('+20') ? '0' + digits.slice(2) : digits
}

export function easykashPayHandler(deps: Dependencies) {
  const allowedOrigin = new URL(deps.siteUrl).origin
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin')
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
      ...(origin === allowedOrigin ? { 'Access-Control-Allow-Origin': origin } : {}) }
    const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers })
    if (origin && origin !== allowedOrigin) return reply(403, { error: 'FORBIDDEN' })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers,
      'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' } })
    if (request.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' })
    // Public endpoint: only the anonymous project credential, never a staff JWT.
    const authorization = request.headers.get('authorization')
    if (authorization && authorization !== `Bearer ${deps.anonKey}`) return reply(403, { error: 'FORBIDDEN' })
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415, { error: 'INVALID_INPUT' })

    let body: { action?: unknown; manage_token?: unknown; currency?: unknown }
    try {
      const text = await request.text()
      if (text.length > 1024) return reply(413, { error: 'REQUEST_TOO_LARGE' })
      body = JSON.parse(text)
    } catch { return reply(400, { error: 'INVALID_INPUT' }) }
    const token = body?.manage_token
    if (typeof token !== 'string' || !/^[0-9a-f]{32}$/.test(token)) return reply(400, { error: 'INVALID_INPUT' })
    if (!deps.apiKey) { deps.log?.('not_configured', {}); return reply(503, { error: 'NOT_CONFIGURED' }) }

    const easykash = async (path: string, payload: unknown) => {
      const res = await deps.fetch(`${EASYKASH}${path}`, {
        method: 'POST', headers: { authorization: deps.apiKey!, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) { deps.log?.('easykash_error', { path, status: res.status }); throw new Error('PAYMENT_UNAVAILABLE') }
      return data as Record<string, unknown>
    }

    try {
      if (body.action === 'start') {
        const currency = body.currency as Currency
        if (!CURRENCIES.includes(currency)) return reply(400, { error: 'INVALID_INPUT' })
        const rate = currency === 'EGP' ? 1 : (await deps.rates())[currency]
        const a = await deps.start(token, currency, rate)
        const data = await easykash('/api/directpayv1/pay', {
          amount: Number(a.amount), currency: a.currency, paymentOptions: PAYMENT_OPTIONS,
          name: a.name, email: a.email || 'payments@mg-visa.com', mobile: easykashMobile(a.phone),
          redirectUrl: `${deps.siteUrl.replace(/\/$/, '')}/#/pay/return`, customerReference: a.customer_reference,
        })
        const url = String(data.redirectUrl ?? '')
        if (!/^https:\/\/(www\.)?easykash\.net\//.test(url)) { deps.log?.('bad_redirect', {}); throw new Error('PAYMENT_UNAVAILABLE') }
        deps.log?.('started', { currency })
        return reply(200, { redirectUrl: url })
      }
      if (body.action === 'check') {
        const ref = await deps.openAttempt(token)
        if (!ref) return reply(200, { status: 'none' })
        const data = await easykash('/api/cash-api/inquire', { customerReference: ref })
        const status = String(data.status ?? '').toUpperCase()
        if (status === 'PAID' && data.easykashRef) {
          // Straight from EasyKash's API with our key, so it needs no signature; stored like a callback.
          const payload = Object.fromEntries(Object.entries({ ...data, customerReference: ref })
            .filter(([, v]) => v !== null && typeof v !== 'object').map(([k, v]) => [k, String(v)]))
          await deps.record(payload)
          const outcome = await deps.apply(String(data.easykashRef))
          deps.log?.('checked', { outcome })
          return reply(200, { status: 'paid', outcome })
        }
        return reply(200, { status: status.toLowerCase() || 'unknown' })
      }
      return reply(400, { error: 'INVALID_INPUT' })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      const statuses: Record<string, number> = { NOT_FOUND: 404, INVALID_INPUT: 400, HOLD_EXPIRED: 409, INVALID_TRANSITION: 409, RATE_LIMITED: 429 }
      return reply(statuses[message] ?? 502, { error: statuses[message] ? message : 'PAYMENT_UNAVAILABLE' })
    }
  }
}
