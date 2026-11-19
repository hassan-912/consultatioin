// After an online consultation: the consultant asks for a written summary of the call, drafted by Gemini from the
// call's Daily transcript, or for a download link to the recording. Staff only; the client reads the published
// summary through a database function, never through here.

import type { RoomBooking } from '../video-room/handler.ts'

const DAILY = 'https://api.daily.co/v1'

export interface Summary { overview: string; keyPoints: string[]; agreements: string[]; nextSteps: string[]; lang: 'en' | 'ar' }

export type Dependencies = {
  siteUrl: string
  /** Missing: answers SUMMARY_UNAVAILABLE. */
  dailyKey?: string
  verifyUser: (jwt: string) => Promise<string | null>
  /** The booking as this staff member may see it (own consultant or admin), or null. */
  staffBooking: (bookingId: string, userId: string) => Promise<RoomBooking | null>
  /** Writes the summary from the transcript text, in `lang`. Throws when the model cannot. Missing (no AI key):
   *  "generate" answers SUMMARY_UNAVAILABLE before touching Daily; "recording" still works. */
  summarize?: (transcript: string, lang: 'en' | 'ar') => Promise<Summary>
  /** Stores the draft and returns the stored record. */
  saveDraft: (bookingId: string, summary: Summary) => Promise<Record<string, unknown>>
  fetch: typeof fetch
  log?: (event: string, fields: Record<string, string | number>) => void
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
      if (!roomId) return reply(409, { error: 'NO_TRANSCRIPT' })
      const list = await daily(`/transcript?roomId=${encodeURIComponent(roomId)}&limit=20`)
      const ready = newest(list.data).filter(t => t.status === 't_finished' || t.status === 'finished')
      const texts: string[] = []
      // A call that was stopped and restarted has several transcripts: keep them all, oldest first.
      for (const t of ready.reverse()) {
        const access = await daily(`/transcript/${encodeURIComponent(String(t.transcriptId ?? t.id))}/access-link`)
        const link = typeof access.data?.link === 'string' ? access.data.link : null
        if (!link) continue
        const vtt = await deps.fetch(link, { signal: AbortSignal.timeout(15000) }).then(r => (r.ok ? r.text() : ''))
        const text = vttToText(vtt)
        if (text) texts.push(text)
      }
      const transcript = texts.join('\n\n')
      if (transcript.length < 40) return reply(409, { error: 'NO_TRANSCRIPT' })

      const lang = booking.lang === 'ar' ? 'ar' : 'en'
      const summary = await deps.summarize!(transcript, lang)
      const stored = await deps.saveDraft(booking.id, { ...summary, lang })
      return reply(200, stored)
    } catch (e) {
      deps.log?.('summary_failed', { booking: booking.reference, reason: e instanceof Error ? e.message.slice(0, 120) : 'unknown' })
      return reply(503, { error: 'SUMMARY_UNAVAILABLE' })
    }
  }
}
