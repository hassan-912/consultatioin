// After an online consultation: a written summary of the call. The call's audio is recorded (from when the client
// joins until they leave); Gemini listens to it once and writes the transcript and the summary together.
//   Daily webhook   "recording.ready-to-download": Daily says the audio is ready, so the summary is written and
//                   published. One trigger per call, nothing polls and no browser has to stay open.
//   generate        staff: write a fresh draft now (the consultant's "write it again").
//   recording       staff: a download link for the call's audio.
//   register-webhook  one-off setup (x-webhook-secret): tells Daily where to send the webhook.
// The client reads the published summary through a database function, never through here.

import type { RoomBooking } from '../video-room/handler.ts'
import type { Audio, Heard } from './gemini.ts'

const DAILY = 'https://api.daily.co/v1'

export interface Summary { overview: string; keyPoints: string[]; agreements: string[]; nextSteps: string[]; lang: 'en' | 'ar' }
/** What is stored. `source`: the recordings it was written from. `by_consultant`: a person published this wording. */
export type StoredSummary = { summary: Summary; status: 'draft' | 'published'; source?: string | null; by_consultant?: boolean } & Record<string, unknown>

export type Dependencies = {
  siteUrl: string
  /** This function's own address, for the webhook Daily is told to call. */
  functionUrl: string
  /** Missing: answers SUMMARY_UNAVAILABLE. */
  dailyKey?: string
  /** Base64 key Daily signs its webhooks with (X-Webhook-Signature). Missing: webhooks are refused. */
  webhookHmac?: string
  /** Shared with the database (Vault) for the one-off "register-webhook" call. */
  adminSecret?: string
  verifyUser: (jwt: string) => Promise<string | null>
  /** The booking as this staff member may see it (own consultant or admin), or null. */
  staffBooking: (bookingId: string, userId: string) => Promise<RoomBooking | null>
  /** Any booking by id (for the webhook, which has no user). */
  bookingById: (bookingId: string) => Promise<RoomBooking | null>
  /** Listens to the call's audio and writes transcript and summary. Throws when the model cannot. Missing: no AI. */
  summarizeAudio?: (audio: Audio[], lang: 'en' | 'ar') => Promise<Heard>
  saveDraft: (bookingId: string, summary: Summary, source: string) => Promise<Record<string, unknown>>
  currentSummary: (bookingId: string) => Promise<StoredSummary | null>
  /** Publishes unless a person already published a summary; returns what is stored. */
  publishAuto: (bookingId: string, summary: Summary, source: string) => Promise<StoredSummary>
  /** Keeps work running after the reply (EdgeRuntime.waitUntil). Missing: the work finishes before replying. */
  background?: (work: Promise<unknown>) => void
  fetch: typeof fetch
  log?: (event: string, fields: Record<string, string | number>) => void
}

/** Share of letters that are Arabic. An Arabic call that comes back as English-looking text was not heard properly. */
export function arabicShare(text: string): number {
  // Speaker labels ("العميل:") are not what was said, so they don't count.
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

export function meetingSummaryHandler(deps: Dependencies) {
  const allowedOrigin = new URL(deps.siteUrl).origin

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
    return { busy: all.some(r => r.status === 'in-progress'), finished, source: finished.map(r => String(r.id)).join(',') }
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
      const type = res.headers.get('content-type') ?? ''
      audio.push({ bytes: new Uint8Array(await res.arrayBuffer()), mimeType: /^audio\//.test(type) ? type.split(';')[0] : 'audio/mp4' })
    }
    return audio
  }

  /** The summary from the call's audio, or 'unavailable' when what came back was not the call. Throws on failure. */
  async function write(booking: RoomBooking, recordings: Record<string, unknown>[]): Promise<Summary | 'unavailable'> {
    const lang: Summary['lang'] = booking.lang === 'ar' ? 'ar' : 'en'
    const audio = await audioOf(recordings)
    if (!audio.length) return 'unavailable'
    const heard = await deps.summarizeAudio!(audio, lang)
    if (lang === 'ar' && arabicShare(heard.transcript) < 0.5) {
      deps.log?.('transcript_wrong_language', { booking: booking.reference, arabic: Math.round(arabicShare(heard.transcript) * 100) })
      return 'unavailable'
    }
    if (heard.dropped) deps.log?.('summary_points_dropped', { booking: booking.reference, dropped: heard.dropped })
    return { overview: heard.overview, keyPoints: heard.keyPoints, agreements: heard.agreements, nextSteps: heard.nextSteps, lang }
  }

  /** Daily says a recording is ready: write and publish, once per set of recordings. */
  async function onRecordingReady(booking: RoomBooking) {
    const stored = await deps.currentSummary(booking.id)
    // A person published their own wording: never replace it.
    if (stored?.status === 'published' && stored.by_consultant) return 'kept'
    const rec = await recordingsOf(booking)
    // The client left and came back: the last part's webhook will cover all of it.
    if (rec.busy || !rec.finished.length) return 'waiting'
    // Daily can send the same webhook twice.
    if (stored?.source === rec.source && stored.status === 'published') return 'done'
    // The consultant already wrote a draft from these same recordings: that one goes out, no second AI run.
    if (stored?.source === rec.source) { await deps.publishAuto(booking.id, stored.summary, rec.source); return 'published' }
    const summary = await write(booking, rec.finished)
    if (summary === 'unavailable') return 'unavailable'
    await deps.publishAuto(booking.id, summary, rec.source)
    return 'published'
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
      if (!deps.dailyKey || !deps.summarizeAudio) return reply(200, { ignored: 'unavailable' })
      const work = onRecordingReady(booking).then(
        outcome => deps.log?.('webhook_done', { booking: booking.reference, outcome }),
        e => deps.log?.('summary_failed', { booking: booking.reference, reason: e instanceof Error ? e.message.slice(0, 120) : 'unknown' }))
      // Answer Daily at once; downloading, listening and writing take a minute or more.
      if (deps.background) { deps.background(work); return reply(200, { started: true }) }
      await work
      return reply(200, { done: true })
    }

    const action = body?.action
    if (action === 'register-webhook') {
      if (!deps.adminSecret || !sameSecret(request.headers.get('x-webhook-secret'), deps.adminSecret)) return reply(401, { error: 'FORBIDDEN' })
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
    if (!deps.dailyKey || (action === 'generate' && !deps.summarizeAudio)) return reply(503, { error: 'SUMMARY_UNAVAILABLE' })

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
      const summary = await write(booking, rec.finished)
      if (summary === 'unavailable') return reply(409, { error: 'NO_TRANSCRIPT' })
      return reply(200, await deps.saveDraft(booking.id, summary, rec.source))
    } catch (e) {
      deps.log?.('summary_failed', { booking: booking.reference, reason: e instanceof Error ? e.message.slice(0, 120) : 'unknown' })
      return reply(503, { error: 'SUMMARY_UNAVAILABLE' })
    }
  }
}
