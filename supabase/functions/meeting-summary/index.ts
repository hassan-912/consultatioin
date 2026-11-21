import { createClient } from 'npm:@supabase/supabase-js@2.49.8'
import { meetingSummaryHandler, type StoredSummary } from './handler.ts'
import { geminiAllowed, geminiSummarizer } from './gemini.ts'
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
// when Google answers "high demand" (429/503) or hangs. In Nov 2026 gemini-3.8-flash mostly hung or answered 503 on
// this key, so the defaults are 3.5-flash then 3.5-flash-lite. 40 s each leaves room for the Daily calls under Supabase's 150 s.
// On the hosted project Gemini stays off until GEMINI_BILLING is paid or free (see geminiAllowed); without it no summary is written
// (SUMMARY_UNAVAILABLE) and no transcript leaves Supabase.
const geminiKey = Deno.env.get('GEMINI_API_KEY')
const summarize = geminiKey && geminiAllowed(url, Deno.env.get('GEMINI_BILLING'))
  ? geminiSummarizer({
      apiKey: geminiKey,
      models: [Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash', Deno.env.get('GEMINI_FALLBACK_MODEL') || 'gemini-3.5-flash-lite'],
      timeoutMs: 40000,
      fetch: (input, init) => fetch(input, init),
    })
  : undefined

Deno.serve(meetingSummaryHandler({
  siteUrl: Deno.env.get('SITE_URL')!,
  dailyKey: Deno.env.get('DAILY_API_KEY') || undefined,
  async verifyUser(jwt) {
    const { data, error } = await anonymous.auth.getUser(jwt)
    return error || !data.user ? null : data.user.id
  },
  staffBooking: (bookingId, userId) => rpc<RoomBooking | null>('video_room_staff_booking', { p_booking_id: bookingId, p_user_id: userId }),
  summarize,
  saveDraft: (bookingId, summary) => rpc<Record<string, unknown>>('meeting_summary_save_draft', { p_booking_id: bookingId, p_summary: summary }),
  currentSummary: bookingId => rpc<StoredSummary | null>('meeting_summary_get', { p_booking_id: bookingId }),
  publishAuto: (bookingId, summary) => rpc<StoredSummary>('meeting_summary_publish_auto', { p_booking_id: bookingId, p_summary: summary }),
  claimDue: () => rpc<RoomBooking[]>('meeting_summary_claim', { p_limit: 5 }),
  report: (bookingId, outcome) => rpc('meeting_summary_report', { p_booking_id: bookingId, p_outcome: outcome }),
  // The same secret the e-mail and payment jobs use (Vault: ticket_email_webhook_secret).
  sweepSecret: Deno.env.get('TICKET_EMAIL_WEBHOOK_SECRET') || undefined,
  // Reply to the database job at once; the sweep (Daily, then Gemini) can take a minute.
  background: work => (globalThis as unknown as { EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime.waitUntil(work),
  fetch: (input, init) => fetch(input, init),
  log: (event, fields) => console.log(JSON.stringify({ fn: 'meeting-summary', event, ...fields })),
}))
