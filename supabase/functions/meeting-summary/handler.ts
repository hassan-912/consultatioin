// After an online consultation: a written summary of the call, drafted by Gemini from the call's Daily transcript.
// "generate" and "recording" are staff only (a fresh draft; a download link to the recording). "auto" runs once the
// client has left the room, from the client's after-call page (by manage link) or the consultant's panel: it writes
// the summary and publishes it at once. It answers "pending" until Daily has finished the transcript, so callers poll.

import type { RoomBooking } from '../video-room/handler.ts'

const DAILY = 'https://api.daily.co/v1'

export interface Summary { overview: string; keyPoints: string[]; agreements: string[]; nextSteps: string[]; lang: 'en' | 'ar' }
export type StoredSummary = { summary: Summary; status: 'draft' | 'published' } & Record<string, unknown>

export type Dependencies = {
  siteUrl: string
  /** Missing: answers SUMMARY_UNAVAILABLE ("auto": state unavailable). */
  dailyKey?: string
  verifyUser: (jwt: string) => Promise<string | null>
  /** The booking as this staff member may see it (own consultant or admin), or null. */
  staffBooking: (bookingId: string, userId: string) => Promise<RoomBooking | null>
  /** The booking behind a client's manage link, or null. */
  clientBooking: (manageToken: string) => Promise<RoomBooking | null>
  /** Writes the summary from the transcript text, in `lang`. Throws when the model cannot. Missing (no AI key):
   *  "generate" answers SUMMARY_UNAVAILABLE before touching Daily; "recording" still works. */
  summarize?: (transcript: string, lang: 'en' | 'ar') => Promise<Summary & { dropped?: number }>
  /** Stores the draft and returns the stored record. */
  saveDraft: (bookingId: string, summary: Summary) => Promise<Record<string, unknown>>
  /** The stored record (draft or published), or null. */
  currentSummary: (bookingId: string) => Promise<StoredSummary | null>
  /** Publishes unless a summary is already published; returns what is stored. */
  publishAuto: (bookingId: string, summary: Summary) => Promise<StoredSummary>
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

export function meetingSummaryHandler(deps: Dependencies) {
  const allowedOrigin = new URL(deps.siteUrl).origin
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
    const bookingId = typeof body?.booking_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.booking_id) ? body.booking_id : null
    const manageToken = typeof body?.manage_token === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(body.manage_token) ? body.manage_token : null
    // The client (by manage link) may only ask for "auto", which never shows them a draft.
    const valid = action === 'auto' ? !!(bookingId || manageToken) : (action === 'generate' || action === 'recording') && !!bookingId
    if (!valid) return reply(400, { error: 'INVALID_INPUT' })

    let booking: RoomBooking | null
    try {
      if (bookingId) {
        const jwt = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1]
        const userId = jwt ? await deps.verifyUser(jwt) : null
        if (!userId) return reply(401, { error: 'FORBIDDEN' })
        booking = await deps.staffBooking(bookingId, userId)
      } else booking = await deps.clientBooking(manageToken!)
    } catch {
      return reply(503, { error: 'SUMMARY_UNAVAILABLE' })
    }
    if (!booking) return reply(404, { error: 'NOT_FOUND' })
    if (booking.format !== 'online') return reply(400, { error: 'INVALID_INPUT' })
    const failed = (e: unknown) => {
      deps.log?.('summary_failed', { booking: booking!.reference, action: String(action), reason: e instanceof Error ? e.message.slice(0, 120) : 'unknown' })
      return reply(503, { error: 'SUMMARY_UNAVAILABLE' })
    }

    if (action === 'auto') {
      try {
        const stored = await deps.currentSummary(booking.id)
        if (stored?.status === 'published') return reply(200, { state: 'published', record: stored })
        // The consultant already wrote a draft: that one goes out, no second AI run.
        if (stored) return reply(200, { state: 'published', record: await deps.publishAuto(booking.id, stored.summary) })
      } catch (e) { return failed(e) }
    }
    if (!deps.dailyKey || (action !== 'recording' && !deps.summarize)) {
      return action === 'auto' ? reply(200, { state: 'unavailable' }) : reply(503, { error: 'SUMMARY_UNAVAILABLE' })
    }

    const daily = async (path: string) => {
      const res = await deps.fetch(`${DAILY}${path}`, { headers: { Authorization: `Bearer ${deps.dailyKey}` }, signal: AbortSignal.timeout(15000) })
      return { status: res.status, data: await res.json().catch(() => null) as Record<string, unknown> | null }
    }
    const newest = (data: Record<string, unknown> | null) => {
      const list = Array.isArray(data?.data) ? data.data as Record<string, unknown>[] : []
      return list.slice().sort((a, b) => Number(b.start_ts ?? b.duration ?? 0) - Number(a.start_ts ?? a.duration ?? 0))
    }
    const name = `mg-${booking.id}`

    try {
      if (action === 'recording') {
        const list = await daily(`/recordings?room_name=${encodeURIComponent(name)}&limit=20`)
        const finished = newest(list.data).find(r => r.status === 'finished')
        if (!finished) return reply(200, { link: null })
        const access = await daily(`/recordings/${encodeURIComponent(String(finished.id))}/access-link`)
        return reply(200, { link: typeof access.data?.download_link === 'string' ? access.data.download_link : null })
      }

      // Transcripts are listed by the room's id, not its name.
      const room = await daily(`/rooms/${encodeURIComponent(name)}`)
      const roomId = typeof room.data?.id === 'string' ? room.data.id : null
      const list = roomId ? newest((await daily(`/transcript?roomId=${encodeURIComponent(roomId)}&limit=20`)).data) : []
      const done = (t: Record<string, unknown>) => t.status === 't_finished' || t.status === 'finished'
      // "auto" waits for every part: publishing while one is still being written would leave the end of the call out.
      if (action === 'auto' && list.some(t => !done(t) && !/error|fail/i.test(String(t.status ?? '')))) return reply(200, { state: 'pending' })
      const texts: string[] = []
      // A call that was stopped and restarted has several transcripts: keep them all, oldest first.
      for (const t of list.filter(done).reverse()) {
        const access = await daily(`/transcript/${encodeURIComponent(String(t.transcriptId ?? t.id))}/access-link`)
        const link = typeof access.data?.link === 'string' ? access.data.link : null
        if (!link) continue
        const vtt = await deps.fetch(link, { signal: AbortSignal.timeout(15000) }).then(r => (r.ok ? r.text() : ''))
        const text = vttToText(vtt)
        if (text) texts.push(text)
      }
      const transcript = texts.join('\n\n')
      if (transcript.length < 40) return action === 'auto' ? reply(200, { state: 'pending' }) : reply(409, { error: 'NO_TRANSCRIPT' })

      const lang: Summary['lang'] = booking.lang === 'ar' ? 'ar' : 'en'
      if (lang === 'ar' && arabicShare(transcript) < 0.5) {
        deps.log?.('transcript_wrong_language', { booking: booking.reference, arabic: Math.round(arabicShare(transcript) * 100) })
        return action === 'auto' ? reply(200, { state: 'unavailable' }) : reply(409, { error: 'NO_TRANSCRIPT' })
      }
      const { dropped = 0, ...written } = await deps.summarize!(transcript, lang)
      if (dropped) deps.log?.('summary_points_dropped', { booking: booking.reference, dropped })
      const summary: Summary = { overview: written.overview, keyPoints: written.keyPoints, agreements: written.agreements, nextSteps: written.nextSteps, lang }
      if (action === 'auto') return reply(200, { state: 'published', record: await deps.publishAuto(booking.id, summary) })
      return reply(200, await deps.saveDraft(booking.id, summary))
    } catch (e) { return failed(e) }
  }
}
