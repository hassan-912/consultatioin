import { arabicShare, meetingSummaryHandler, vttToText, type Dependencies, type StoredSummary, type Summary, type SweepOutcome } from '../../supabase/functions/meeting-summary/handler'
import type { RoomBooking } from '../../supabase/functions/video-room/handler'

const ID = '0b6f2f6e-6a51-4b1e-9d1b-1d6c7d0f0a11'
const booking: RoomBooking = {
  id: ID, reference: 'MG-TEST-ROOM', name: 'Ahmed Tarek', status: 'checked-in', format: 'online',
  starts_at: '2026-11-24T14:00:00Z', ends_at: '2026-11-24T14:45:00Z', lang: 'ar',
}
const EN_VTT = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
<v Ahmed Tarek>Welcome, let's look at your bank statement.</v>

2
00:00:04.500 --> 00:00:06.000
<v Ahmed Tarek>You need six months.</v>

3
00:00:07.000 --> 00:00:09.000
<v Kamel>I will send it this week.</v>
`
const summary: Summary = { overview: 'o', keyPoints: ['k'], agreements: ['a'], nextSteps: ['Client: send it'], lang: 'ar' }

const SECRET = 'sweep-secret-123'

const VTT = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
<v Ahmed Tarek>أهلا بيك، خلينا نبص على كشف الحساب.</v>

2
00:00:07.000 --> 00:00:09.000
<v Kamel>هبعته الأسبوع ده.</v>
`

function setup(over: Partial<Dependencies> = {}, daily: { transcripts?: unknown[]; recordings?: unknown[] } = {}, stored: StoredSummary | null = null, vtt = VTT) {
  const summarized: { transcript: string; lang: string }[] = []
  const saved: unknown[] = []
  const published: Summary[] = []
  const reports: [string, SweepOutcome][] = []
  const deps: Dependencies = {
    siteUrl: 'https://mg.example',
    dailyKey: 'daily-test-key',
    verifyUser: async jwt => (jwt === 'staff-jwt' ? 'user-1' : null),
    staffBooking: async (id, user) => (user === 'user-1' && id === ID ? booking : null),
    summarize: async (transcript, lang) => { summarized.push({ transcript, lang }); return summary },
    saveDraft: async (_id, s) => { saved.push(s); return { summary: s, status: 'draft', generated_at: '2026-11-24T15:00:00Z' } },
    currentSummary: async () => stored,
    publishAuto: async (_id, s) => { published.push(s); return { summary: s, status: 'published' } },
    claimDue: async () => [booking],
    report: async (id, outcome) => { reports.push([id, outcome]) },
    sweepSecret: SECRET,
    fetch: (async (input: string) => {
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
      const path = String(input).replace('https://api.daily.co/v1', '')
      if (path === `/rooms/mg-${ID}`) return json({ id: 'room-uuid', name: `mg-${ID}` })
      if (path.startsWith('/transcript?roomId=room-uuid')) return json({ data: daily.transcripts ?? [{ transcriptId: 't1', status: 't_finished', duration: 600 }] })
      if (path === '/transcript/t1/access-link') return json({ link: 'https://files.example/t1.vtt' })
      if (input === 'https://files.example/t1.vtt') return new Response(vtt)
      if (path.startsWith('/recordings?room_name=')) return json({ data: daily.recordings ?? [] })
      if (path === '/recordings/r1/access-link') return json({ download_link: 'https://files.example/r1.mp4' })
      return json({ error: 'not-found' }, 404)
    }) as typeof fetch,
    ...over,
  }
  const call = (body: unknown, jwt: string | null = 'staff-jwt') => meetingSummaryHandler(deps)(new Request('https://fn.example', {
    method: 'POST', body: JSON.stringify(body), headers: jwt ? { authorization: `Bearer ${jwt}` } : {},
  }))
  const sweep = async (secret: string | null = SECRET) => {
    const res = await meetingSummaryHandler(deps)(new Request('https://fn.example', {
      method: 'POST', body: JSON.stringify({ action: 'sweep' }), headers: secret ? { 'x-webhook-secret': secret } : {},
    }))
    return { status: res.status, body: await res.json() as Record<string, unknown> }
  }
  return { call, sweep, summarized, saved, published, reports }
}

test('a WebVTT transcript becomes one line per speaker turn', () => {
  expect(vttToText(EN_VTT)).toBe("Ahmed Tarek: Welcome, let's look at your bank statement. You need six months.\nKamel: I will send it this week.")
})

test('only signed-in staff who may see the booking get a summary', async () => {
  const { call } = setup()
  expect((await call({ action: 'generate', booking_id: ID }, null)).status).toBe(401)
  expect((await call({ action: 'generate', booking_id: ID }, 'someone-else')).status).toBe(401)
  expect((await call({ action: 'generate', booking_id: '1b6f2f6e-6a51-4b1e-9d1b-1d6c7d0f0a11' })).status).toBe(404)
  expect((await call({ action: 'delete', booking_id: ID })).status).toBe(400)
})

test('generate reads the transcript, writes the summary in the consultation language and saves a draft', async () => {
  const { call, summarized, saved } = setup()
  const res = await call({ action: 'generate', booking_id: ID })
  expect(res.status).toBe(200)
  expect(await res.json()).toMatchObject({ status: 'draft', summary: { overview: 'o' } })
  expect(summarized).toEqual([{ transcript: expect.stringContaining('Kamel: هبعته الأسبوع ده.'), lang: 'ar' }])
  expect(saved).toEqual([summary])
})

test('without an AI key, generate stops before fetching the transcript; the recording still works', async () => {
  const daily: string[] = []
  const { call } = setup({ summarize: undefined, fetch: (async (input: string) => { daily.push(input); return new Response('{"data":[]}') }) as typeof fetch })
  const res = await call({ action: 'generate', booking_id: ID })
  expect(res.status).toBe(503)
  expect(daily).toEqual([])
  expect((await call({ action: 'recording', booking_id: ID })).status).toBe(200)
})

test('a call that was not transcribed says so instead of inventing a summary', async () => {
  const { call, summarized } = setup({}, { transcripts: [] })
  const res = await call({ action: 'generate', booking_id: ID })
  expect(res.status).toBe(409)
  expect(await res.json()).toEqual({ error: 'NO_TRANSCRIPT' })
  expect(summarized).toHaveLength(0)
})

test('a failing model is reported as unavailable, and nothing is saved', async () => {
  const { call, saved } = setup({ summarize: async () => { throw new Error('refusal') } })
  expect((await call({ action: 'generate', booking_id: ID })).status).toBe(503)
  expect(saved).toHaveLength(0)
})

test('recording returns the newest finished recording, or null', async () => {
  expect(await (await setup().call({ action: 'recording', booking_id: ID })).json()).toEqual({ link: null })
  const { call } = setup({}, { recordings: [{ id: 'r0', status: 'in-progress', start_ts: 2 }, { id: 'r1', status: 'finished', start_ts: 1 }] })
  expect(await (await call({ action: 'recording', booking_id: ID })).json()).toEqual({ link: 'https://files.example/r1.mp4' })
})

test("the sweep needs the database job's secret", async () => {
  const { sweep, published } = setup()
  expect((await sweep(null)).status).toBe(401)
  expect((await sweep('wrong-secret-12345')).status).toBe(401)
  expect((await setup({ sweepSecret: undefined }).sweep()).status).toBe(401)
  expect(published).toHaveLength(0)
})

test('the sweep writes the summary from a finished transcript, publishes it and reports it', async () => {
  const { sweep, published, reports } = setup()
  expect(await sweep()).toEqual({ status: 200, body: { outcomes: { 'MG-TEST-ROOM': 'published' } } })
  expect(published).toEqual([summary])
  expect(reports).toEqual([[ID, 'published']])
})

test('the sweep waits while Daily is still writing the transcript, or before there is one', async () => {
  const writing = setup({}, { transcripts: [{ transcriptId: 't1', status: 't_finished' }, { transcriptId: 't2', status: 't_in_progress' }] })
  expect((await writing.sweep()).body).toEqual({ outcomes: { 'MG-TEST-ROOM': 'pending' } })
  const none = setup({}, { transcripts: [] })
  expect((await none.sweep()).body).toEqual({ outcomes: { 'MG-TEST-ROOM': 'pending' } })
  expect([...writing.summarized, ...none.summarized]).toHaveLength(0)
})

test("the sweep never runs the AI twice: a consultant's draft goes out as it is", async () => {
  const draft = { summary: { ...summary, overview: 'edited' }, status: 'draft' as const }
  const fromDraft = setup({}, {}, draft)
  expect((await fromDraft.sweep()).body).toEqual({ outcomes: { 'MG-TEST-ROOM': 'published' } })
  expect(fromDraft.published).toEqual([draft.summary])
  expect(fromDraft.summarized).toHaveLength(0)
})

test('a failing model is reported as failed, so the job backs off instead of retrying every minute', async () => {
  const { sweep, reports, published } = setup({ summarize: async () => { throw new Error('gemini-3.5-flash: 429') } })
  expect((await sweep()).body).toEqual({ outcomes: { 'MG-TEST-ROOM': 'failed' } })
  expect(reports).toEqual([[ID, 'failed']])
  expect(published).toHaveLength(0)
  expect((await setup({ summarize: undefined }).sweep()).body).toEqual({ outcomes: { 'MG-TEST-ROOM': 'unavailable' } })
})

test('with a background runner the job gets its answer at once and the work carries on', async () => {
  const running: Promise<unknown>[] = []
  const { sweep, published } = setup({ background: work => { running.push(work) } })
  expect(await sweep()).toEqual({ status: 202, body: { started: true } })
  await Promise.all(running)
  expect(published).toEqual([summary])
})

test('generate tells "still being written" apart from "no transcript"', async () => {
  const writing = setup({}, { transcripts: [{ transcriptId: 't1', status: 't_in_progress' }] })
  const res = await writing.call({ action: 'generate', booking_id: ID })
  expect(res.status).toBe(409)
  expect(await res.json()).toEqual({ error: 'TRANSCRIPT_PENDING' })
})

test('an Arabic call whose transcript came out in English is not summarized', async () => {
  const { call, summarized } = setup({}, {}, null, EN_VTT)
  // The fixture transcript is English and the booking is Arabic: this is what an English speech model makes of Arabic.
  const { sweep } = setup({}, {}, null, EN_VTT)
  expect((await sweep()).body).toEqual({ outcomes: { 'MG-TEST-ROOM': 'unavailable' } })
  expect((await call({ action: 'generate', booking_id: ID })).status).toBe(409)
  expect(summarized).toHaveLength(0)
  expect(arabicShare('Kamel: محتاجين كشف حساب')).toBe(1)
  expect(arabicShare('Ahmed: well come to the bank')).toBe(0)
})

test('points the model could not back are not stored, and the count is logged', async () => {
  const logs: unknown[] = []
  const { call, saved } = setup({ summarize: async () => ({ ...summary, dropped: 2 }), log: (e, f) => logs.push({ e, ...f }) })
  expect((await call({ action: 'generate', booking_id: ID })).status).toBe(200)
  expect(saved).toEqual([summary])
  expect(logs).toContainEqual(expect.objectContaining({ e: 'summary_points_dropped', dropped: 2 }))
})
