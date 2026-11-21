// After an online consultation: a written summary of the call, made from its audio recording in three short steps.
// Each step is its own run of this function (a run may take at most 150 s on the free plan; a 45-minute call does
// not fit in one), and each one starts the next:
//   webhook          Daily: "recording.ready-to-download". Step 1: download the audio, upload it to Gemini.
//   step transcribe  Step 2: Gemini 3.5 Transcribe (or, if it fails or is busy, a Flash model listening) writes the
//                    transcript, which is kept. The uploaded audio is deleted.
//   step summarize   Step 3: Flash writes the summary from the transcript text, and it is published.
// Staff actions: generate (a fresh draft, from the kept transcript), recording (a download link for the audio).
// register-webhook: one-off setup that tells Daily where to send the webhook.
// The client reads the published summary through a database function, never through here.

import type { RoomBooking } from '../video-room/handler.ts'
import { GeminiError, type Audio, type GeminiClient, type GeminiFile } from './gemini.ts'

const DAILY = 'https://api.daily.co/v1'
/** Gemini 3.5 Transcribe hears up to an hour; with speaker labels only 30 minutes (a little margin on both). */
const TRANSCRIBE_MAX_S = 3500
const SPEAKERS_MAX_S = 1740
/** What one model may take inside a step, leaving room under the 150 s limit for the rest of the step. */
const TRANSCRIBE_TIMEOUT_MS = 125_000
const SUMMARY_TIMEOUT_MS = 60_000

export interface Summary { overview: string; keyPoints: string[]; agreements: string[]; nextSteps: string[]; lang: 'en' | 'ar' }
/** What is stored. `source`: the recordings it was written from. `by_consultant`: a person published this wording. */
export type StoredSummary = { summary: Summary; status: 'draft' | 'published'; source?: string | null; by_consultant?: boolean } & Record<string, unknown>
export type Transcript = {
  source: string; status: 'uploaded' | 'transcribed' | 'summarized' | 'failed'; files: GeminiFile[]
  audio_seconds: number | null; transcript: string | null; model: string | null; error: string | null
}

export type Dependencies = {
  siteUrl: string
  /** This function's own address: for Daily's webhook, and for each step to start the next. */
  functionUrl: string
  /** Missing: answers SUMMARY_UNAVAILABLE. */
  dailyKey?: string
  /** Base64 key Daily signs its webhooks with (X-Webhook-Signature). Missing: webhooks are refused. */
  webhookHmac?: string
  /** Shared with the database (Vault): the one-off "register-webhook" call and the steps calling each other. */
  adminSecret?: string
  verifyUser: (jwt: string) => Promise<string | null>
  /** The booking as this staff member may see it (own consultant or admin), or null. */
  staffBooking: (bookingId: string, userId: string) => Promise<RoomBooking | null>
  /** Any booking by id (for the webhook and the steps, which have no user). */
  bookingById: (bookingId: string) => Promise<RoomBooking | null>
  /** Missing: no AI (GEMINI_API_KEY or GEMINI_BILLING not set). */
  gemini?: Pick<GeminiClient, 'upload' | 'remove' | 'transcribeDedicated' | 'transcribeWithModel' | 'summarize'>
  /** Tried in order for step 2. "gemini-3.5-transcribe" is the dedicated model; the others are Flash models listening. */
  transcribers: string[]
  /** Tried in order for step 3. */
  summaryModels: string[]
  saveDraft: (bookingId: string, summary: Summary, source: string) => Promise<Record<string, unknown>>
  currentSummary: (bookingId: string) => Promise<StoredSummary | null>
  /** Publishes unless a person already published a summary; returns what is stored. */
  publishAuto: (bookingId: string, summary: Summary, source: string) => Promise<StoredSummary>
  getTranscript: (bookingId: string) => Promise<Transcript | null>
  putTranscript: (bookingId: string, patch: Partial<Transcript>) => Promise<unknown>
  /** Keeps work running after the reply (EdgeRuntime.waitUntil). Missing: the work finishes before replying. */
  background?: (work: Promise<unknown>) => void
  now?: () => number
  fetch: typeof fetch
  log?: (event: string, fields: Record<string, string | number>) => void
}

/** Share of letters that are Arabic. An Arabic call that comes back as English-looking text was not heard properly. */
export function arabicShare(text: string): number {
  // Speaker labels ("العميل:", "spk_1:") are not what was said, so they don't count.
  const letters = text.replace(/^[^:\n]{1,40}:/gm, '').match(/\p{L}/gu) ?? []
  return letters.length ? letters.filter(c => /[؀-ۿ]/.test(c)).length / letters.length : 0
}

/** Same length, same characters: compared without leaking how much matched through timing. */
function sameSecret(given: string | null, expected: string): boolean {
  if (!given || given.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

const b64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
/** Daily's signature: base64 HMAC-SHA256 of "timestamp.body", keyed with the base64-decoded webhook secret. */
export async function dailySignature(hmacB64: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', Uint8Array.from(atob(hmacB64), c => c.charCodeAt(0)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`)))
}

const reason = (e: unknown) => (e instanceof Error ? e.message : 'unknown').slice(0, 160)
const langOf = (booking: RoomBooking): Summary['lang'] => (booking.lang === 'ar' ? 'ar' : 'en')

export function meetingSummaryHandler(deps: Dependencies) {
  const allowedOrigin = new URL(deps.siteUrl).origin
  const now = deps.now ?? (() => Date.now())

  const daily = async (path: string, init?: { method?: string; payload?: unknown }) => {
    const res = await deps.fetch(`${DAILY}${path}`, {
      method: init?.method ?? 'GET',
      headers: { Authorization: `Bearer ${deps.dailyKey}`, 'Content-Type': 'application/json' },
      body: init?.payload === undefined ? undefined : JSON.stringify(init.payload),
      signal: AbortSignal.timeout(15000),
    })
    return { status: res.status, data: await res.json().catch(() => null) as Record<string, unknown> | null }
  }

  /** The call's audio recordings, oldest first. `busy`: one is still recording or being finished by Daily. */
  async function recordingsOf(booking: RoomBooking) {
    const list = await daily(`/recordings?room_name=${encodeURIComponent(`mg-${booking.id}`)}&limit=20`)
    const all = (Array.isArray(list.data?.data) ? list.data!.data as Record<string, unknown>[] : [])
      .slice().sort((a, b) => Number(a.start_ts ?? 0) - Number(b.start_ts ?? 0))
    const finished = all.filter(r => r.status === 'finished')
    return {
      busy: all.some(r => r.status === 'in-progress'), finished,
      source: finished.map(r => String(r.id)).join(','),
      seconds: finished.reduce((s, r) => s + (Number(r.duration) || 0), 0),
    }
  }

  /** Downloads each finished recording (a short-lived link from Daily). */
  async function audioOf(recordings: Record<string, unknown>[]): Promise<Audio[]> {
    const audio: Audio[] = []
    for (const r of recordings) {
      const access = await daily(`/recordings/${encodeURIComponent(String(r.id))}/access-link`)
      const link = typeof access.data?.download_link === 'string' ? access.data.download_link : null
      if (!link) continue
      const res = await deps.fetch(link, { signal: AbortSignal.timeout(60000) })
      if (!res.ok) throw new Error(`download: ${res.status}`)
      const type = (res.headers.get('content-type') ?? '').split(';')[0]
      audio.push({ bytes: new Uint8Array(await res.arrayBuffer()), mimeType: /^audio\//.test(type) ? type : 'audio/mp4' })
    }
    return audio
  }

  /** Starts the next step as a fresh run (its own 150 s). That run answers at once and works in the background. */
  async function next(step: 'transcribe' | 'summarize', booking: RoomBooking, attempt = 0) {
    const res = await deps.fetch(deps.functionUrl, {
      method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': deps.adminSecret ?? '' },
      body: JSON.stringify({ action: 'step', step, booking_id: booking.id, attempt }),
    })
    if (!res.ok) throw new Error(`step ${step}: ${res.status}`)
  }

  /** Step 1. A failed earlier run is started again (the consultant pressed "write the summary"). */
  async function prepare(booking: RoomBooking): Promise<string> {
    const stored = await deps.currentSummary(booking.id)
    // A person published their own wording: nothing to do.
    if (stored?.status === 'published' && stored.by_consultant) return 'kept'
    const rec = await recordingsOf(booking)
    // The client left and came back: the last part's webhook will cover all of it.
    if (rec.busy || !rec.finished.length) return 'waiting'
    const t = await deps.getTranscript(booking.id)
    // Daily can send the same webhook twice; and a failed run may be started again.
    if (t?.source === rec.source && t.status !== 'failed') return 'already'
    const audio = await audioOf(rec.finished)
    if (!audio.length) return 'no-audio'
    const files = await deps.gemini!.upload(audio)
    await deps.putTranscript(booking.id, { source: rec.source, status: 'uploaded', files, audio_seconds: rec.seconds || null, transcript: null, model: null, error: null })
    await next('transcribe', booking)
    return 'uploaded'
  }

  /** Step 2: one model per run. A busy or slow one hands over to the next model in a fresh run. */
  async function transcribe(booking: RoomBooking, attempt: number): Promise<string> {
    const t = await deps.getTranscript(booking.id)
    if (!t || t.status !== 'uploaded') return 'skipped'
    const seconds = t.audio_seconds ?? 0
    // The dedicated model cuts off after an hour (and does not say so); longer calls go to Flash.
    const models = deps.transcribers.filter(m => m !== 'gemini-3.5-transcribe' || seconds <= TRANSCRIBE_MAX_S)
    const model = models[attempt]
    const gemini = deps.gemini!
    const giveUp = async (error: string) => {
      await deps.putTranscript(booking.id, { status: 'failed', error })
      await gemini.remove(t.files)
      return 'failed'
    }
    if (!model) return giveUp(t.error ?? 'no transcriber left')
    const lang = langOf(booking)
    let text: string
    try {
      text = model === 'gemini-3.5-transcribe'
        ? await gemini.transcribeDedicated(t.files, lang, seconds > 0 && seconds <= SPEAKERS_MAX_S, TRANSCRIBE_TIMEOUT_MS)
        : await gemini.transcribeWithModel(model, t.files, TRANSCRIBE_TIMEOUT_MS)
      if (lang === 'ar' && arabicShare(text) < 0.5) throw new GeminiError(`${model}: not arabic (${Math.round(arabicShare(text) * 100)}%)`, true)
    } catch (e) {
      deps.log?.('transcribe_failed', { booking: booking.reference, model, reason: reason(e) })
      const retry = e instanceof GeminiError ? e.transient : true
      if (!retry || attempt + 1 >= models.length) return giveUp(reason(e))
      await deps.putTranscript(booking.id, { error: reason(e) })
      await next('transcribe', booking, attempt + 1)
      return 'next-model'
    }
    await deps.putTranscript(booking.id, { status: 'transcribed', transcript: text, model, files: [], error: null })
    await gemini.remove(t.files)
    await next('summarize', booking)
    return 'transcribed'
  }

  /** The summary from a transcript. Throws when no model could write one the transcript backs. */
  async function write(booking: RoomBooking, transcript: string): Promise<Summary> {
    const lang = langOf(booking)
    const written = await deps.gemini!.summarize(deps.summaryModels, transcript, lang, SUMMARY_TIMEOUT_MS)
    if (written.dropped) deps.log?.('summary_points_dropped', { booking: booking.reference, dropped: written.dropped })
    return { overview: written.overview, keyPoints: written.keyPoints, agreements: written.agreements, nextSteps: written.nextSteps, lang }
  }

  /** Step 3. */
  async function summarizeStep(booking: RoomBooking): Promise<string> {
    const t = await deps.getTranscript(booking.id)
    if (!t || t.status !== 'transcribed' || !t.transcript) return 'skipped'
    const stored = await deps.currentSummary(booking.id)
    if (stored?.status === 'published' && stored.by_consultant) {
      await deps.putTranscript(booking.id, { status: 'summarized' })
      return 'kept'
    }
    try {
      // The consultant already wrote a draft from these same recordings: that one goes out, no second AI run.
      const summary = stored?.source === t.source ? stored.summary : await write(booking, t.transcript)
      await deps.publishAuto(booking.id, summary, t.source)
      await deps.putTranscript(booking.id, { status: 'summarized', error: null })
      return 'published'
    } catch (e) {
      await deps.putTranscript(booking.id, { status: 'failed', error: reason(e) })
      throw e
    }
  }

  /** Runs one step, logging how long it took (the free plan allows 150 s per run). */
  async function timed(step: string, booking: RoomBooking, work: () => Promise<string>) {
    const started = now()
    try {
      const outcome = await work()
      deps.log?.('step', { booking: booking.reference, step, outcome, ms: now() - started })
    } catch (e) {
      deps.log?.('step_failed', { booking: booking.reference, step, reason: reason(e), ms: now() - started })
    }
  }

  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin')
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
      ...(origin === allowedOrigin ? { 'Access-Control-Allow-Origin': origin } : {}) }
    const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers,
      'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' } })
    if (request.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' })

    // Raw text first: Daily's signature covers the exact bytes it sent.
    const raw = await request.text()
    let body: Record<string, unknown> | null = null
    try { body = JSON.parse(raw) } catch { /* handled below */ }
    /** Answer now and keep working (or, without a background runner, finish first). */
    const later = async (work: Promise<unknown>, answer: Record<string, unknown>) => {
      if (deps.background) { deps.background(work); return reply(200, answer) }
      await work
      return reply(200, answer)
    }

    // Daily checks a new webhook address with {"test":"test"} and wants a 200 within 8 seconds.
    if (body?.test === 'test') return reply(200, { ok: true })

    if (typeof body?.type === 'string' && body.type.startsWith('recording.')) {
      const timestamp = request.headers.get('x-webhook-timestamp') ?? ''
      if (!deps.webhookHmac || !timestamp || !sameSecret(request.headers.get('x-webhook-signature'), await dailySignature(deps.webhookHmac, timestamp, raw))) {
        deps.log?.('webhook_refused', { type: String(body.type) })
        return reply(401, { error: 'FORBIDDEN' })
      }
      if (body.type !== 'recording.ready-to-download') return reply(200, { ignored: body.type })
      const room = String((body.payload as Record<string, unknown> | undefined)?.room_name ?? '')
      const id = /^mg-([0-9a-f-]{36})$/i.exec(room)?.[1]
      const booking = id ? await deps.bookingById(id).catch(() => null) : null
      if (!booking || booking.format !== 'online') return reply(200, { ignored: 'room' })
      if (!deps.dailyKey || !deps.gemini) return reply(200, { ignored: 'unavailable' })
      return later(timed('prepare', booking, () => prepare(booking)), { started: true })
    }

    const action = body?.action
    // The steps call each other with the shared secret.
    if (action === 'step' || action === 'register-webhook') {
      if (!deps.adminSecret || !sameSecret(request.headers.get('x-webhook-secret'), deps.adminSecret)) return reply(401, { error: 'FORBIDDEN' })
    }

    if (action === 'step') {
      const id = typeof body?.booking_id === 'string' ? body.booking_id : ''
      const booking = /^[0-9a-f-]{36}$/i.test(id) ? await deps.bookingById(id).catch(() => null) : null
      if (!booking || !deps.dailyKey || !deps.gemini) return reply(200, { ignored: true })
      const attempt = Math.max(0, Math.min(5, Number(body?.attempt) || 0))
      if (body?.step === 'transcribe') return later(timed(`transcribe#${attempt}`, booking, () => transcribe(booking, attempt)), { started: true })
      if (body?.step === 'summarize') return later(timed('summarize', booking, () => summarizeStep(booking)), { started: true })
      return reply(400, { error: 'INVALID_INPUT' })
    }

    if (action === 'register-webhook') {
      if (!deps.dailyKey || !deps.webhookHmac) return reply(503, { error: 'SUMMARY_UNAVAILABLE' })
      const existing = await daily('/webhooks')
      const got = existing.data as unknown
      const list = (Array.isArray(got) ? got : Array.isArray((got as { data?: unknown })?.data) ? (got as { data: unknown[] }).data : []) as Record<string, unknown>[]
      const mine = list.find(w => w.url === deps.functionUrl)
      const payload = { url: deps.functionUrl, eventTypes: ['recording.ready-to-download'], hmac: deps.webhookHmac }
      const saved = mine ? await daily(`/webhooks/${encodeURIComponent(String(mine.uuid))}`, { method: 'POST', payload })
        : await daily('/webhooks', { method: 'POST', payload })
      // Never echo the key back.
      return reply(saved.status === 200 ? 200 : 502, { status: saved.status, state: saved.data?.state ?? null, updated: !!mine, error: saved.data?.error ?? null })
    }

    const bookingId = typeof body?.booking_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.booking_id) ? body.booking_id : null
    if ((action !== 'generate' && action !== 'recording') || !bookingId) return reply(400, { error: 'INVALID_INPUT' })

    const jwt = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1]
    let booking: RoomBooking | null
    try {
      const userId = jwt ? await deps.verifyUser(jwt) : null
      if (!userId) return reply(401, { error: 'FORBIDDEN' })
      booking = await deps.staffBooking(bookingId, userId)
    } catch {
      return reply(503, { error: 'SUMMARY_UNAVAILABLE' })
    }
    if (!booking) return reply(404, { error: 'NOT_FOUND' })
    if (booking.format !== 'online') return reply(400, { error: 'INVALID_INPUT' })
    if (!deps.dailyKey || (action === 'generate' && !deps.gemini)) return reply(503, { error: 'SUMMARY_UNAVAILABLE' })

    try {
      const rec = await recordingsOf(booking)
      if (action === 'recording') {
        const newest = rec.finished[rec.finished.length - 1]
        if (!newest) return reply(200, { link: null })
        const access = await daily(`/recordings/${encodeURIComponent(String(newest.id))}/access-link`)
        return reply(200, { link: typeof access.data?.download_link === 'string' ? access.data.download_link : null })
      }
      // Not "no recording": the client is still in the call, or Daily is still finishing the file.
      if (rec.busy) return reply(409, { error: 'TRANSCRIPT_PENDING' })
      if (!rec.finished.length) return reply(409, { error: 'NO_TRANSCRIPT' })
      const t = await deps.getTranscript(booking.id)
      // The kept transcript: a new draft costs one short text request, the audio is not sent again.
      if (t?.source === rec.source && t.transcript) return reply(200, await deps.saveDraft(booking.id, await write(booking, t.transcript), rec.source))
      // Still being transcribed, or never started / failed: (re)start the steps; the summary appears when ready.
      if (!(t?.source === rec.source && t.status === 'uploaded')) {
        const b = booking
        const work = timed('prepare', b, () => prepare(b))
        if (deps.background) deps.background(work)
        else await work
      }
      return reply(409, { error: 'TRANSCRIPT_PENDING' })
    } catch (e) {
      deps.log?.('summary_failed', { booking: booking.reference, reason: reason(e) })
      return reply(503, { error: 'SUMMARY_UNAVAILABLE' })
    }
  }
}
