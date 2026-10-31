import { createClient } from 'npm:@supabase/supabase-js@2.49.8'
import { ticketEmailHandler, type ClaimedEmail } from './handler.ts'

// The service-role key exists only in the Edge runtime. Never return it or import this module into the frontend.
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })

Deno.serve(ticketEmailHandler({
  config: {
    webhookSecret: Deno.env.get('TICKET_EMAIL_WEBHOOK_SECRET') || undefined,
    resendApiKey: Deno.env.get('RESEND_API_KEY') || undefined,
    emailFrom: Deno.env.get('EMAIL_FROM') || undefined,
    siteUrl: Deno.env.get('SITE_URL') || undefined,
  },
  async claim(limit) {
    const { data, error } = await admin.rpc('claim_ticket_emails', { p_limit: limit, p_lease_seconds: 120 })
    if (error) throw new Error('CLAIM_FAILED')
    return (data ?? []) as ClaimedEmail[]
  },
  async complete(outboxId, providerMessageId) {
    const { error } = await admin.rpc('complete_ticket_email', { p_outbox_id: outboxId, p_provider_message_id: providerMessageId })
    if (error) throw new Error('RECORD_FAILED')
  },
  async fail(outboxId, code, permanent) {
    const { error } = await admin.rpc('fail_ticket_email', { p_outbox_id: outboxId, p_error_code: code, p_permanent: permanent })
    if (error) throw new Error('RECORD_FAILED')
  },
  fetch: (input, init) => fetch(input, init),
  log: (event, fields) => console.log(JSON.stringify({ fn: 'send-ticket-email', event, ...fields })),
}))
