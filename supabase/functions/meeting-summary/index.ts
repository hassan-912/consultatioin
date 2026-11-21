import { createClient } from 'npm:@supabase/supabase-js@2.49.8'
import { meetingSummaryHandler, type StoredSummary } from './handler.ts'
import { geminiAllowed, geminiAudioSummarizer } from './gemini.ts'
import type { RoomBooking } from '../video-room/handler.ts'

const url = Deno.env.get('SUPABASE_URL')!
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const anonymous = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, options)
// The service-role key exists only in the Edge runtime. Never return it or import this module into the frontend.
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, options)
const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await admin.rpc(fn, args)
  if (error) throw new Error(`rpc ${fn}: ${error.message}`)
  return data as T
}

// Reads GEMINI_API_KEY (an Edge Function secret). GEMINI_MODEL pins the model and GEMINI_FALLBACK_MODEL takes over
// when Google answers "high demand" (429/503) or hangs. Listening to a 45-minute call takes a while, so each model
// gets 100 s. On the hosted project Gemini stays off until GEMINI_BILLING is paid or free (see geminiAllowed); without
// it no summary is written and no recording leaves Daily.
const geminiKey = Deno.env.get('GEMINI_API_KEY')
const summarizeAudio = geminiKey && geminiAllowed(url, Deno.env.get('GEMINI_BILLING'))
  ? geminiAudioSummarizer({
      apiKey: geminiKey,
      models: [Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash', Deno.env.get('GEMINI_FALLBACK_MODEL') || 'gemini-3.5-flash-lite'],
      timeoutMs: 100000,
      fetch: (input, init) => fetch(input, init),
    })
  : undefined

// The key Daily signs its webhooks with, made from the secret the database jobs already share (Vault:
// ticket_email_webhook_secret) so there is no new secret to set. Daily wants it base64.
const adminSecret = Deno.env.get('TICKET_EMAIL_WEBHOOK_SECRET') || undefined
const webhookHmac = adminSecret
  ? btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`daily-webhook:${adminSecret}`)))))
  : undefined

Deno.serve(meetingSummaryHandler({
  siteUrl: Deno.env.get('SITE_URL')!,
  functionUrl: `${url.replace(/\/$/, '')}/functions/v1/meeting-summary`,
  dailyKey: Deno.env.get('DAILY_API_KEY') || undefined,
  webhookHmac,
  adminSecret,
  async verifyUser(jwt) {
    const { data, error } = await anonymous.auth.getUser(jwt)
    return error || !data.user ? null : data.user.id
  },
  staffBooking: (bookingId, userId) => rpc<RoomBooking | null>('video_room_staff_booking', { p_booking_id: bookingId, p_user_id: userId }),
  bookingById: bookingId => rpc<RoomBooking | null>('meeting_summary_booking', { p_booking_id: bookingId }),
  summarizeAudio,
  saveDraft: (bookingId, summary, source) => rpc<Record<string, unknown>>('meeting_summary_save_draft', { p_booking_id: bookingId, p_summary: summary, p_source: source }),
  currentSummary: bookingId => rpc<StoredSummary | null>('meeting_summary_get', { p_booking_id: bookingId }),
  publishAuto: (bookingId, summary, source) => rpc<StoredSummary>('meeting_summary_publish_auto', { p_booking_id: bookingId, p_summary: summary, p_source: source }),
  // Answer Daily at once; the summary (download, Gemini) is written after the reply.
  background: work => (globalThis as unknown as { EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime.waitUntil(work),
  fetch: (input, init) => fetch(input, init),
  log: (event, fields) => console.log(JSON.stringify({ fn: 'meeting-summary', event, ...fields })),
}))
