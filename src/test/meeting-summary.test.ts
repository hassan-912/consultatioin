import { meetingSummaryHandler, vttToText, type Dependencies, type Summary } from '../../supabase/functions/meeting-summary/handler'
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

function setup(over: Partial<Dependencies> = {}, daily: { transcripts?: unknown[]; recordings?: unknown[] } = {}) {
  const summarized: { transcript: string; lang: string }[] = []
  const saved: unknown[] = []
  const deps: Dependencies = {
    siteUrl: 'https://mg.example',
    dailyKey: 'daily-test-key',
    verifyUser: async jwt => (jwt === 'staff-jwt' ? 'user-1' : null),
    staffBooking: async (id, user) => (user === 'user-1' && id === ID ? booking : null),
    summarize: async (transcript, lang) => { summarized.push({ transcript, lang }); return summary },
    saveDraft: async (_id, s) => { saved.push(s); return { summary: s, status: 'draft', generated_at: '2026-11-24T15:00:00Z' } },
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
  return { call, summarized, saved }
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
