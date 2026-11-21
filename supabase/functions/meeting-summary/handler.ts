// After an online consultation: a written summary of the call, drafted by Gemini from the call's Daily transcript.
//   sweep      the database's minute job (x-webhook-secret): for each consultation that has started and has no
//              published summary, wait for Daily to finish the transcript, then write the summary and publish it.
//              No browser has to stay open for this.
//   generate   staff: write a fresh draft now (the consultant's "write it again").
//   recording  staff: a download link for the video recording, when the consultant recorded one.
// The client reads the published summary through a database function, never through here.

import type { RoomBooking } from '../video-room/handler.ts'

const DAILY = 'https://api.daily.co/v1'

export interface Summary { overview: string; keyPoints: string[]; agreements: string[]; nextSteps: string[]; lang: 'en' | 'ar' }
export type StoredSummary = { summary: Summary; status: 'draft' | 'published' } & Record<string, unknown>
export type SweepOutcome = 'pending' | 'failed' | 'unavailable' | 'published'

export type Dependencies = {
  siteUrl: string
  /** Missing: answers SUMMARY_UNAVAILABLE (sweep: unavailable). */
  dailyKey?: string
  /** Shared with the database job that calls "sweep" (x-webhook-secret). Missing: sweep is refused. */
  sweepSecret?: string
  verifyUser: (jwt: string) => Promise<string | null>
  /** The booking as this staff member may see it (own consultant or admin), or null. */
  staffBooking: (bookingId: string, userId: string) => Promise<RoomBooking | null>
  /** Writes the summary from the transcript text, in `lang`. Throws when the model cannot. Missing: no AI. */
  summarize?: (transcript: string, lang: 'en' | 'ar') => Promise<Summary & { dropped?: number }>
  /** Stores the draft and returns the stored record. */
  saveDraft: (bookingId: string, summary: Summary) => Promise<Record<string, unknown>>
  /** The stored record (draft or published), or null. */
  currentSummary: (bookingId: string) => Promise<StoredSummary | null>
  /** Publishes unless a summary is already published; returns what is stored. */
  publishAuto: (bookingId: string, summary: Summary) => Promise<StoredSummary>
  /** Takes the consultations that are due (and leases them so two sweeps never share one). */
  claimDue: () => Promise<RoomBooking[]>
  /** Records how a sweep went for one consultation, which decides when it is looked at again. */
  report: (bookingId: string, outcome: SweepOutcome) => Promise<unknown>
  /** Keeps work running after the reply (EdgeRuntime.waitUntil). Missing: the sweep finishes before replying. */
  background?: (work: Promise<unknown>) => void
  fetch: typeof fetch
  log?: (event: string, fields: Record<string, string | number>) => void
}

/** Share of letters that are Arabic. An Arabic call transcribed by an English model comes out as English-looking
 *  nonsense; summarizing that is how a summary ends up with things nobody said. */
export function arabicShare(text: string): number {
  // Speaker names ("Kamel:") are not what was said, so they don't count.
  const letters = text.replace(/^[^:\n]{1,40}:/gm, '').match(/\p{L}/gu) ?? []
  return letters.length ? letters.filter(c => /[؀-ۿ]/.test(c)).length / letters.length : 0
}

/** Turns a WebVTT transcript into "Speaker: words" lines, merging consecutive cues from the same speaker. */
export function vttToText(vtt: string): string {
  const lines: string[] = []
  let last = ''
  for (const block of vtt.replace(/\r/g, '').split(/\n\n+/)) {
    const text = block.split('\n').filter(l => l && !/^WEBVTT/.test(l) && !/-->/.test(l) && !/^\d+$/.test(l.trim())).join(' ').trim()
    if (!text) continue
    // Daily writes the speaker as <v Name>words</v> or "Name: words".
    const voice = /^<v\s+([^>]+)>([\s\S]*?)(?:<\/v>)?$/.exec(text)
    const [speaker, words] = voice ? [voice[1].trim(), voice[2].trim()] : (/^([^:]{1,40}):\s*([\s\S]+)$/.exec(text)?.slice(1) ?? ['', text])
    if (speaker && speaker === last) lines[lines.length - 1] += ` ${words}`
    else { lines.push(speaker ? `${speaker}: ${words}` : words); last = speaker }
  }
  return lines.join('\n')
}

/** Same length, same characters: compared without leaking how much matched through timing. */
function secretMatches(given: string | null, expected: string): boolean {
  if (!given || given.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

export function meetingSummaryHandler(deps: Dependencies) {
  const allowedOrigin = new URL(deps.siteUrl).origin

  const daily = async (path: string) => {
    const res = await deps.fetch(`${DAILY}${path}`, { headers: { Authorization: `Bearer ${deps.dailyKey}` }, signal: AbortSignal.timeout(15000) })
    return { status: res.status, data: await res.json().catch(() => null) as Record<string, unknown> | null }
  }
  const newest = (data: Record<string, unknown> | null) => {
    const list = Array.isArray(data?.data) ? data.data as Record<string, unknown>[] : []
    return list.slice().sort((a, b) => Number(b.start_ts ?? b.duration ?? 0) - Number(a.start_ts ?? a.duration ?? 0))
  }

  /** Everything Daily has transcribed for the call. `writing`: a part is still being written (the call is going on,
   *  or Daily is still finishing it, which takes a minute or two after the client leaves). */
  async function transcriptOf(booking: RoomBooking) {
    const room = await daily(`/rooms/${encodeURIComponent(`mg-${booking.id}`)}`)
    const roomId = typeof room.data?.id === 'string' ? room.data.id : null
    const list = roomId ? newest((await daily(`/transcript?roomId=${encodeURIComponent(roomId)}&limit=20`)).data) : []
    const done = (t: Record<string, unknown>) => t.status === 't_finished' || t.status === 'finished'
    const writing = list.some(t => !done(t) && !/error|fail/i.test(String(t.status ?? '')))
    const texts: string[] = []
    // A call that was stopped and restarted has several transcripts: keep them all, oldest first.
    for (const t of writing ? [] : list.filter(done).reverse()) {
      const access = await daily(`/transcript/${encodeURIComponent(String(t.transcriptId ?? t.id))}/access-link`)
      const link = typeof access.data?.link === 'string' ? access.data.link : null
      if (!link) continue
      const vtt = await deps.fetch(link, { signal: AbortSignal.timeout(15000) }).then(r => (r.ok ? r.text() : ''))
      const text = vttToText(vtt)
      if (text) texts.push(text)
    }
    const text = texts.join('\n\n')
    if (!writing && text.length < 40) deps.log?.('no_transcript', { booking: booking.reference, room: roomId ? 'found' : 'missing',
      transcripts: list.length, statuses: list.map(t => String(t.status)).join(',') || 'none' })
    return { writing, text: text.length < 40 ? '' : text }
  }

  /** The summary from a finished transcript, or why there is none. Throws when Daily or the model fails. */
  async function write(booking: RoomBooking, text: string): Promise<Summary | 'unavailable'> {
    const lang: Summary['lang'] = booking.lang === 'ar' ? 'ar' : 'en'
    if (lang === 'ar' && arabicShare(text) < 0.5) {
      deps.log?.('transcript_wrong_language', { booking: booking.reference, arabic: Math.round(arabicShare(text) * 100) })
      return 'unavailable'
    }
    const { dropped = 0, ...written } = await deps.summarize!(text, lang)
    if (dropped) deps.log?.('summary_points_dropped', { booking: booking.reference, dropped })
    return { overview: written.overview, keyPoints: written.keyPoints, agreements: written.agreements, nextSteps: written.nextSteps, lang }
  }

  /** One consultation in the sweep. */
  async function sweepOne(booking: RoomBooking): Promise<SweepOutcome> {
    const stored = await deps.currentSummary(booking.id)
    if (stored?.status === 'published') return 'published'
    // The consultant already wrote a draft: that one goes out, no second AI run.
    if (stored) { await deps.publishAuto(booking.id, stored.summary); return 'published' }
    if (!deps.dailyKey || !deps.summarize) return 'unavailable'
    const t = await transcriptOf(booking)
    if (t.writing || !t.text) return 'pending'
    const summary = await write(booking, t.text)
    if (summary === 'unavailable') return 'unavailable'
    await deps.publishAuto(booking.id, summary)
    deps.log?.('summary_published', { booking: booking.reference })
    return 'published'
  }

  async function sweep() {
    const due = await deps.claimDue()
    const outcomes: Record<string, SweepOutcome> = {}
    // One at a time: the free Gemini tier allows only a few requests a minute.
    for (const booking of due) {
      let outcome: SweepOutcome
      try { outcome = await sweepOne(booking) } catch (e) {
        deps.log?.('summary_failed', { booking: booking.reference, reason: e instanceof Error ? e.message.slice(0, 120) : 'unknown' })
        outcome = 'failed'
      }
      outcomes[booking.reference] = outcome
      await deps.report(booking.id, outcome).catch(() => deps.log?.('report_failed', { booking: booking.reference }))
    }
    return outcomes
  }

  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin')
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
      ...(origin === allowedOrigin ? { 'Access-Control-Allow-Origin': origin } : {}) }
    const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers,
      'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' } })
    if (request.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' })

    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const action = body?.action

    if (action === 'sweep') {
      if (!deps.sweepSecret || !secretMatches(request.headers.get('x-webhook-secret'), deps.sweepSecret)) return reply(401, { error: 'FORBIDDEN' })
      const work = sweep()
      if (deps.background) { deps.background(work.catch(() => deps.log?.('sweep_failed', {}))); return reply(202, { started: true }) }
      try { return reply(200, { outcomes: await work }) } catch { return reply(503, { error: 'SUMMARY_UNAVAILABLE' }) }
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
    if (!deps.dailyKey || (action === 'generate' && !deps.summarize)) return reply(503, { error: 'SUMMARY_UNAVAILABLE' })

    try {
      if (action === 'recording') {
        const list = await daily(`/recordings?room_name=${encodeURIComponent(`mg-${booking.id}`)}&limit=20`)
        const finished = newest(list.data).find(r => r.status === 'finished')
        if (!finished) return reply(200, { link: null })
        const access = await daily(`/recordings/${encodeURIComponent(String(finished.id))}/access-link`)
        return reply(200, { link: typeof access.data?.download_link === 'string' ? access.data.download_link : null })
      }

      const t = await transcriptOf(booking)
      // Not "record the call": the transcript exists, Daily is just still finishing it.
      if (t.writing) return reply(409, { error: 'TRANSCRIPT_PENDING' })
      if (!t.text) return reply(409, { error: 'NO_TRANSCRIPT' })
      const summary = await write(booking, t.text)
      if (summary === 'unavailable') return reply(409, { error: 'NO_TRANSCRIPT' })
      return reply(200, await deps.saveDraft(booking.id, summary))
    } catch (e) {
      deps.log?.('summary_failed', { booking: booking.reference, reason: e instanceof Error ? e.message.slice(0, 120) : 'unknown' })
      return reply(503, { error: 'SUMMARY_UNAVAILABLE' })
    }
  }
}
