import { createClient } from 'npm:@supabase/supabase-js@2.49.8'
import { easykashPayHandler } from './handler.ts'

// The service-role key exists only in the Edge runtime. Never return it or import this module into the frontend.
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await admin.rpc(fn, args)
  // Database error codes (HOLD_EXPIRED, NOT_FOUND, ...) pass through as the message.
  if (error) throw new Error(error.message?.match(/NOT_FOUND|HOLD_EXPIRED|INVALID_TRANSITION|INVALID_INPUT|RATE_LIMITED/)?.[0] ?? 'PAYMENT_UNAVAILABLE')
  return data as T
}

Deno.serve(easykashPayHandler({
  siteUrl: Deno.env.get('SITE_URL')!,
  anonKey: Deno.env.get('SUPABASE_ANON_KEY')!,
  apiKey: Deno.env.get('EASYKASH_API_KEY') || undefined,
  async rates() {
    // Same public provider the payment step and file assessment use. No key, no customer data sent.
    const res = await fetch('https://open.er-api.com/v6/latest/EGP', { signal: AbortSignal.timeout(10000) })
    const d = await res.json()
    const r = d?.rates ?? {}
    if (d?.result !== 'success' || !(r.USD > 0 && r.EUR > 0 && r.AED > 0)) throw new Error('PAYMENT_UNAVAILABLE')
    return { USD: r.USD, EUR: r.EUR, AED: r.AED }
  },
  start: (token, currency, rate) => rpc('start_easykash_attempt', { p_manage_token: token, p_currency: currency, p_units_per_egp: rate }),
  openAttempt: token => rpc('open_easykash_attempt', { p_manage_token: token }),
  record: payload => rpc('record_easykash_callback', { p_payload: payload }),
  apply: ref => rpc('apply_easykash_payment', { p_easykash_ref: ref }),
  claimChecks: () => rpc<string[] | null>('claim_easykash_checks', { p_limit: 20 }).then(r => r ?? []),
  // The background job reuses the ticket-email worker's shared secret (Vault 'ticket_email_webhook_secret').
  sweepSecret: Deno.env.get('TICKET_EMAIL_WEBHOOK_SECRET') || undefined,
  fetch: (input, init) => fetch(input, init),
  log: (event, fields) => console.log(JSON.stringify({ fn: 'easykash-pay', event, ...fields })),
}))
