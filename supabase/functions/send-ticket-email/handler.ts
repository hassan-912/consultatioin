import { buildTicketEmail, manageLink } from './email.ts'

export type ClaimedEmail = {
  outbox_id: string; idempotency_key: string; attempt_count: number; reference: string; manage_token: string
  customer_name: string; customer_email: string; lang: string; starts_at: string; tz: string; format: string
}
export type Config = { webhookSecret?: string; resendApiKey?: string; emailFrom?: string; siteUrl?: string }
export type Dependencies = {
  config: Config
  claim: (limit: number) => Promise<ClaimedEmail[]>
  complete: (outboxId: string, providerMessageId: string | null) => Promise<void>
  fail: (outboxId: string, code: string, permanent: boolean) => Promise<void>
  fetch: typeof fetch
  /** Safe logging only: event name plus fields that are never tokens or personal data. */
  log?: (event: string, fields: Record<string, string | number>) => void
}

const BATCH = 10
const TIMEOUT_MS = 10_000
const RESEND_URL = 'https://api.resend.com/emails'
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

/** Constant-time comparison of two strings (length is not secret here). */
export function secretMatches(given: string | null, expected: string): boolean {
  if (given === null) return false
  const a = new TextEncoder().encode(given), b = new TextEncoder().encode(expected)
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

export function configured(c: Config): c is Required<Config> {
  return !!(c.resendApiKey && c.emailFrom && c.siteUrl && manageLink(c.siteUrl, 'x'.repeat(16)))
}

type Outcome = { ok: true; id: string | null } | { ok: false; code: string; permanent: boolean }

async function send(deps: Dependencies, cfg: Required<Config>, row: ClaimedEmail): Promise<Outcome> {
  const url = manageLink(cfg.siteUrl, row.manage_token)
  if (!url) return { ok: false, code: 'BAD_MANAGE_LINK', permanent: true }
  const email = buildTicketEmail({
    lang: row.lang === 'ar' ? 'ar' : 'en', name: row.customer_name, reference: row.reference,
    startsAt: row.starts_at, tz: row.tz, format: row.format === 'online' ? 'online' : 'in-person', manageUrl: url,
  })
  let response: Response
  try {
    response = await deps.fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.resendApiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': row.idempotency_key },
      body: JSON.stringify({ from: cfg.emailFrom, to: [row.customer_email], subject: email.subject, html: email.html, text: email.text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    return { ok: false, code: error instanceof DOMException && error.name === 'TimeoutError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_NETWORK', permanent: false }
  }
  if (response.ok) {
    const body = await response.json().catch(() => null) as { id?: unknown } | null
    return { ok: true, id: typeof body?.id === 'string' ? body.id : null }
  }
  const retryable = response.status >= 500 || [408, 409, 425, 429].includes(response.status)
  return { ok: false, code: `PROVIDER_${response.status}`, permanent: !retryable }
}

/** Internal webhook: the secret is verified before any database access or provider call. */
export function ticketEmailHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' })
    const expected = deps.config.webhookSecret
    if (!expected) return json(503, { error: 'WEBHOOK_SECRET_MISSING' })
    if (!secretMatches(request.headers.get('x-webhook-secret'), expected)) return json(401, { error: 'UNAUTHENTICATED' })
    // Without provider/sender/site configuration nothing is claimed or sent: events stay pending.
    if (!configured(deps.config)) { deps.log?.('not_configured', {}); return json(200, { status: 'NOT_CONFIGURED', sent: 0 }) }
    const cfg = deps.config as Required<Config>
    let rows: ClaimedEmail[]
    try { rows = await deps.claim(BATCH) } catch { deps.log?.('claim_failed', {}); return json(500, { error: 'CLAIM_FAILED' }) }
    let sent = 0, failed = 0
    for (const row of rows) {
      const outcome = await send(deps, cfg, row)
      try {
        if (outcome.ok) { await deps.complete(row.outbox_id, outcome.id); sent++; deps.log?.('sent', { outbox: row.outbox_id, attempt: row.attempt_count }) }
        else { await deps.fail(row.outbox_id, outcome.code, outcome.permanent); failed++; deps.log?.('send_failed', { outbox: row.outbox_id, attempt: row.attempt_count, code: outcome.code }) }
      } catch {
        // Record failed after the provider answered: the lease expires and the retry reuses the same Idempotency-Key.
        deps.log?.('record_failed', { outbox: row.outbox_id })
      }
    }
    return json(200, { status: 'OK', claimed: rows.length, sent, failed })
  }
}
