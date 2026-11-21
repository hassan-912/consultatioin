import { createClient } from 'npm:@supabase/supabase-js@2.49.8'
import { meetingSummaryHandler, type StoredSummary, type Transcript } from './handler.ts'
import { geminiAllowed, geminiClient } from './gemini.ts'
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

// Reads GEMINI_API_KEY (an Edge Function secret). On the hosted project Gemini stays off until GEMINI_BILLING is paid or
// free (see geminiAllowed); without it no summary is written and no recording leaves Daily.
//   GEMINI_TRANSCRIBE_MODELS  step 2, tried in order (comma-separated). Default: Gemini 3.5 Transcribe, then Flash
//                             listening (with speaker labels), then Flash Lite.
//   GEMINI_MODEL / GEMINI_FALLBACK_MODEL  step 3, the summary from the transcript text.
const geminiKey = Deno.env.get('GEMINI_API_KEY')
const gemini = geminiKey && geminiAllowed(url, Deno.env.get('GEMINI_BILLING'))
  ? geminiClient({ apiKey: geminiKey, fetch: (input, init) => fetch(input, init) })
  : undefined
const list = (v: string | undefined, fallback: string[]) => (v ? v.split(',').map(s => s.trim()).filter(Boolean) : fallback)
const flash = Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash'
const flashLite = Deno.env.get('GEMINI_FALLBACK_MODEL') || 'gemini-3.5-flash-lite'

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
  gemini,
  transcribers: list(Deno.env.get('GEMINI_TRANSCRIBE_MODELS'), ['gemini-3.5-transcribe', flash, flashLite]),
  summaryModels: [flash, flashLite],
  getTranscript: bookingId => rpc<Transcript | null>('meeting_transcript_get', { p_booking_id: bookingId }),
  putTranscript: (bookingId, patch) => rpc('meeting_transcript_put', { p_booking_id: bookingId, p_patch: patch }),
  saveDraft: (bookingId, summary, source) => rpc<Record<string, unknown>>('meeting_summary_save_draft', { p_booking_id: bookingId, p_summary: summary, p_source: source }),
  currentSummary: bookingId => rpc<StoredSummary | null>('meeting_summary_get', { p_booking_id: bookingId }),
  publishAuto: (bookingId, summary, source) => rpc<StoredSummary>('meeting_summary_publish_auto', { p_booking_id: bookingId, p_summary: summary, p_source: source }),
  // Answer at once; each step's work (download, Gemini) carries on after the reply.
  background: work => (globalThis as unknown as { EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime.waitUntil(work),
  fetch: (input, init) => fetch(input, init),
  log: (event, fields) => console.log(JSON.stringify({ fn: 'meeting-summary', event, ...fields })),
}))
