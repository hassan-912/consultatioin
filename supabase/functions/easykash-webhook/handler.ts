export type Config = { hmacSecret?: string }
export type Dependencies = {
  config: Config
  /** Keeps a verified callback; false when the same payment was already kept. */
  record: (payload: Record<string, string>) => Promise<boolean>
  /** Settles the recorded payment against its booking (idempotent). Resolves to the outcome. */
  apply?: (easykashRef: string) => Promise<string>
  /** Safe logging only: event name plus fields that are never secrets or personal data. */
  log?: (event: string, fields: Record<string, string | number>) => void
}

// EasyKash signs these values, concatenated in this exact order with no separator (HMAC-SHA512, hex).
export const SIGNED_FIELDS = ['ProductCode', 'Amount', 'ProductType', 'PaymentMethod', 'status', 'easykashRef', 'customerReference'] as const
const KNOWN = [...SIGNED_FIELDS, 'BuyerEmail', 'BuyerMobile', 'BuyerName', 'Timestamp', 'voucher', 'VoucherData', 'signatureHash']

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export async function signature(payload: Record<string, string>, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(SIGNED_FIELDS.map(f => payload[f] ?? '').join('')))
  return [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time comparison (length is not secret here). */
function same(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

/** Values as sent: query string for GET (EasyKash's setup), JSON or form body for POST. Values stay strings. */
async function readPayload(req: Request): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  new URL(req.url).searchParams.forEach((v, k) => { out[k] = v })
  if (req.method === 'POST') {
    const type = req.headers.get('content-type') ?? ''
    const text = await req.text()
    if (text) {
      if (type.includes('application/x-www-form-urlencoded')) new URLSearchParams(text).forEach((v, k) => { out[k] = v })
      else {
        try {
          const body = JSON.parse(text)
          if (body && typeof body === 'object') for (const [k, v] of Object.entries(body)) if (v !== null && typeof v !== 'object') out[k] = String(v)
        } catch { /* not JSON: nothing more to read */ }
      }
    }
  }
  return Object.fromEntries(Object.entries(out).filter(([k]) => KNOWN.includes(k)))
}

/**
 * EasyKash callback. Opened with nothing attached (EasyKash's URL check, Postman) it answers 200. With payment
 * details it keeps them only when the HMAC signature matches our secret, so a forged link changes nothing.
 */
export function easykashHandler(deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'GET' && req.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' })
    const payload = await readPayload(req)
    if (!payload.signatureHash && !payload.easykashRef) return json(200, { ok: true })
    if (!deps.config.hmacSecret) { deps.log?.('not_configured', {}); return json(503, { error: 'NOT_CONFIGURED' }) }
    if (!payload.signatureHash || !payload.easykashRef) return json(400, { error: 'INVALID_CALLBACK' })
    const expected = await signature(payload, deps.config.hmacSecret)
    if (!same(payload.signatureHash.toLowerCase(), expected)) { deps.log?.('bad_signature', {}); return json(401, { error: 'BAD_SIGNATURE' }) }
    try {
      const fresh = await deps.record(payload)
      deps.log?.(fresh ? 'recorded' : 'duplicate', { status: payload.status ?? '' })
      // Applied on repeats too: if a previous delivery was recorded but not applied, a retry finishes it.
      if (deps.apply) {
        const outcome = await deps.apply(payload.easykashRef)
        deps.log?.('applied', { outcome })
      }
      return json(200, { ok: true })
    } catch {
      deps.log?.('record_failed', {})
      return json(500, { error: 'RECORD_FAILED' })
    }
  }
}
