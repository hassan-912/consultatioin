import { meetingSummaryHandler, vttToText, type Dependencies, type StoredSummary, type Summary } from '../../supabase/functions/meeting-summary/handler'
import type { RoomBooking } from '../../supabase/functions/video-room/handler'

const ID = '0b6f2f6e-6a51-4b1e-9d1b-1d6c7d0f0a11'
const booking: RoomBooking = {
  id: ID, reference: 'MG-TEST-ROOM', name: 'Ahmed Tarek', status: 'checked-in', format: 'online',
  starts_at: '2026-11-24T14:00:00Z', ends_at: '2026-11-24T14:45:00Z', lang: 'ar',
}
const VTT = `WEBVTT

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

const TOKEN = 'client-manage-token-123'

function setup(over: Partial<Dependencies> = {}, daily: { transcripts?: unknown[]; recordings?: unknown[] } = {}, stored: StoredSummary | null = null) {
  const summarized: { transcript: string; lang: string }[] = []
  const saved: unknown[] = []
  const published: Summary[] = []
  const deps: Dependencies = {
    siteUrl: 'https://mg.example',
    dailyKey: 'daily-test-key',
    verifyUser: async jwt => (jwt === 'staff-jwt' ? 'user-1' : null),
    staffBooking: async (id, user) => (user === 'user-1' && id === ID ? booking : null),
    summarize: async (transcript, lang) => { summarized.push({ transcript, lang }); return summary },
    clientBooking: async token => (token === TOKEN ? booking : null),
    saveDraft: async (_id, s) => { saved.push(s); return { summary: s, status: 'draft', generated_at: '2026-11-24T15:00:00Z' } },
    currentSummary: async () => stored,
    publishAuto: async (_id, s) => { published.push(s); return { summary: s, status: 'published' } },
    fetch: (async (input: string) => {
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
      const path = String(input).replace('https://api.daily.co/v1', '')
      if (path === `/rooms/mg-${ID}`) return json({ id: 'room-uuid', name: `mg-${ID}` })
      if (path.startsWith('/transcript?roomId=room-uuid')) return json({ data: daily.transcripts ?? [{ transcriptId: 't1', status: 't_finished', duration: 600 }] })
      if (path === '/transcript/t1/access-link') return json({ link: 'https://files.example/t1.vtt' })
      if (input === 'https://files.example/t1.vtt') return new Response(VTT)
      if (path.startsWith('/recordings?room_name=')) return json({ data: daily.recordings ?? [] })
      if (path === '/recordings/r1/access-link') return json({ download_link: 'https://files.example/r1.mp4' })
      return json({ error: 'not-found' }, 404)
    }) as typeof fetch,
    ...over,
  }
  const call = (body: unknown, jwt: string | null = 'staff-jwt') => meetingSummaryHandler(deps)(new Request('https://fn.example', {
    method: 'POST', body: JSON.stringify(body), headers: jwt ? { authorization: `Bearer ${jwt}` } : {},
  }))
  return { call, summarized, saved, published }
}

test('a WebVTT transcript becomes one line per speaker turn', () => {
  expect(vttToText(VTT)).toBe("Ahmed Tarek: Welcome, let's look at your bank statement. You need six months.\nKamel: I will send it this week.")
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
  expect(summarized).toEqual([{ transcript: expect.stringContaining('Kamel: I will send it this week.'), lang: 'ar' }])
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

test('auto by manage link: writes the summary and publishes it at once', async () => {
  const { call, published } = setup()
  const res = await call({ action: 'auto', manage_token: TOKEN }, null)
  expect(await res.json()).toEqual({ state: 'published', record: { summary, status: 'published' } })
  expect(published).toEqual([summary])
  expect((await call({ action: 'auto', manage_token: 'wrong-manage-token-xyz' }, null)).status).toBe(404)
  // A manage link never reaches the staff actions.
  expect((await call({ action: 'generate', manage_token: TOKEN }, null)).status).toBe(400)
})

test('auto waits while a transcript is still being written, and when there is none yet', async () => {
  const writing = setup({}, { transcripts: [{ transcriptId: 't1', status: 't_finished' }, { transcriptId: 't2', status: 't_in_progress' }] })
  expect(await (await writing.call({ action: 'auto', booking_id: ID })).json()).toEqual({ state: 'pending' })
  const none = setup({}, { transcripts: [] })
  expect(await (await none.call({ action: 'auto', manage_token: TOKEN }, null)).json()).toEqual({ state: 'pending' })
  expect([...writing.summarized, ...none.summarized]).toHaveLength(0)
})

test('auto never runs the AI twice: a published summary is returned, a draft is published as it is', async () => {
  const draft = { summary: { ...summary, overview: 'edited' }, status: 'draft' as const }
  const fromDraft = setup({}, {}, draft)
  expect(await (await fromDraft.call({ action: 'auto', manage_token: TOKEN }, null)).json()).toMatchObject({ state: 'published', record: { summary: { overview: 'edited' } } })
  expect(fromDraft.summarized).toHaveLength(0)
  const done = setup({}, {}, { ...draft, status: 'published' })
  expect(await (await done.call({ action: 'auto', manage_token: TOKEN }, null)).json()).toMatchObject({ state: 'published' })
  expect(done.published).toHaveLength(0)
})

test('auto without an AI key answers unavailable instead of failing', async () => {
  const { call } = setup({ summarize: undefined })
  expect(await (await call({ action: 'auto', manage_token: TOKEN }, null)).json()).toEqual({ state: 'unavailable' })
})
