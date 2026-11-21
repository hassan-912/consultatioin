import { arabicShare, dailySignature, meetingSummaryHandler, type Dependencies, type StoredSummary, type Summary, type Transcript } from '../../supabase/functions/meeting-summary/handler'
import { GeminiError, type GeminiFile } from '../../supabase/functions/meeting-summary/gemini'
import type { RoomBooking } from '../../supabase/functions/video-room/handler'

const ID = '0b6f2f6e-6a51-4b1e-9d1b-1d6c7d0f0a11'
const FN = 'https://fn.example/functions/v1/meeting-summary'
const booking: RoomBooking = {
  id: ID, reference: 'MG-TEST-ROOM', name: 'Ahmed Tarek', status: 'checked-in', format: 'online',
  starts_at: '2026-11-24T14:00:00Z', ends_at: '2026-11-24T14:45:00Z', lang: 'ar',
}
const HMAC = btoa('0123456789abcdef0123456789abcdef')
const ADMIN = 'admin-secret-123'
const summary: Summary = { overview: 'o', keyPoints: ['k'], agreements: ['a'], nextSteps: ['Client: send it'], lang: 'ar' }
const ARABIC = 'المستشار: محتاجين كشف حساب آخر ستة شهور\nالعميل: هبعته الأسبوع ده'
type Rec = { id: string; status: string; start_ts: number; duration?: number }
const finished = (id: string, start_ts: number, duration = 2700): Rec => ({ id, status: 'finished', start_ts, duration })

/** A fake Gemini that records what it was asked; each method can be replaced per test. */
function fakeGemini(over: Partial<NonNullable<Dependencies['gemini']>> = {}) {
  const calls: string[] = []
  const gemini: NonNullable<Dependencies['gemini']> = {
    upload: async audio => { calls.push(`upload:${audio.length}`); return audio.map((_, i) => ({ name: `files/f${i}`, uri: `u${i}`, mimeType: 'audio/mp4' })) },
    remove: async (files: GeminiFile[]) => { calls.push(`remove:${files.length}`) },
    transcribeDedicated: async (_f, lang, speakers) => { calls.push(`transcribe:${lang}:${speakers ? 'speakers' : 'plain'}`); return ARABIC },
    transcribeWithModel: async model => { calls.push(`listen:${model}`); return ARABIC },
    summarize: async models => { calls.push(`summarize:${models[0]}`); return { ...summary, dropped: 0 } },
    ...over,
  }
  return { gemini, calls }
}

function setup(over: Partial<Dependencies> = {}, recordings: Rec[] = [finished('r1', 1)], stored: StoredSummary | null = null, kept: Transcript | null = null) {
  const published: [Summary, string][] = []
  const saved: [Summary, string][] = []
  const logs: Record<string, unknown>[] = []
  let transcript = kept
  const { gemini, calls } = fakeGemini()
  const deps: Dependencies = {
    siteUrl: 'https://mg.example', functionUrl: FN, dailyKey: 'daily-test-key', webhookHmac: HMAC, adminSecret: ADMIN,
    verifyUser: async jwt => (jwt === 'staff-jwt' ? 'user-1' : null),
    staffBooking: async (id, user) => (user === 'user-1' && id === ID ? booking : null),
    bookingById: async id => (id === ID ? booking : null),
    gemini,
    transcribers: ['gemini-3.5-transcribe', 'flash', 'flash-lite'],
    summaryModels: ['flash', 'flash-lite'],
    saveDraft: async (_id, s, source) => { saved.push([s, source]); return { summary: s, status: 'draft' } },
    currentSummary: async () => stored,
    publishAuto: async (_id, s, source) => { published.push([s, source]); return { summary: s, status: 'published', source } },
    getTranscript: async () => transcript,
    putTranscript: async (_id, patch) => { transcript = { ...(transcript ?? { files: [], audio_seconds: null, transcript: null, model: null, error: null }), ...patch } as Transcript },
    log: (e, f) => logs.push({ e, ...f }),
    fetch: (async (input: string, init?: RequestInit) => {
      // A step starting the next: the same function, called again.
      if (input === FN) return handler(new Request(FN, { method: 'POST', body: String(init?.body), headers: init?.headers as Record<string, string> }))
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
      const path = String(input).replace('https://api.daily.co/v1', '')
      if (path.startsWith(`/recordings?room_name=mg-${ID}`)) return json({ data: recordings })
      const link = /^\/recordings\/(\w+)\/access-link$/.exec(path)
      if (link) return json({ download_link: `https://files.example/${link[1]}.m4a` })
      if (String(input).startsWith('https://files.example/')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/mp4' } })
      return json({ error: 'not-found' }, 404)
    }) as typeof fetch,
    ...over,
  }
  const handler = meetingSummaryHandler(deps)
  const call = (body: unknown, jwt: string | null = 'staff-jwt') => handler(new Request(FN, {
    method: 'POST', body: JSON.stringify(body), headers: jwt ? { authorization: `Bearer ${jwt}` } : {},
  }))
  /** What Daily sends when a recording is ready, signed like Daily signs it. */
  const webhook = async (room = `mg-${ID}`, sign = true) => {
    const body = JSON.stringify({ version: '1.0.0', type: 'recording.ready-to-download', id: 'evt-1', payload: { recording_id: 'r1', room_name: room }, event_ts: 1 })
    const ts = '1795253000'
    const res = await handler(new Request(FN, { method: 'POST', body,
      headers: { 'x-webhook-timestamp': ts, 'x-webhook-signature': sign ? await dailySignature(HMAC, ts, body) : 'forged' } }))
    return { status: res.status, body: await res.json() as Record<string, unknown> }
  }
  return { call, webhook, handler, published, saved, logs, calls, transcript: () => transcript, setGemini: (g: Dependencies['gemini']) => { deps.gemini = g } }
}

test("Daily's address check gets its 200; unsigned webhooks and steps without the secret are refused", async () => {
  const { call, webhook, published } = setup()
  expect((await call({ test: 'test' }, null)).status).toBe(200)
  expect((await webhook(undefined, false)).status).toBe(401)
  expect((await setup({ webhookHmac: undefined }).webhook()).status).toBe(401)
  expect((await call({ action: 'step', step: 'summarize', booking_id: ID }, null)).status).toBe(401)
  expect(published).toHaveLength(0)
})

test('the three steps: upload, transcribe with Gemini 3.5 Transcribe, summarize from the text, publish', async () => {
  const { webhook, calls, published, transcript, logs } = setup({}, [finished('r2', 2, 1500), finished('r1', 1, 1200)])
  expect((await webhook()).status).toBe(200)
  // 45 minutes in all: over 30, so no speaker labels (Transcribe would stop at 30 minutes with them).
  expect(calls).toEqual(['upload:2', 'transcribe:ar:plain', 'remove:2', 'summarize:flash'])
  expect(published).toEqual([[summary, 'r1,r2']])
  expect(transcript()).toMatchObject({ source: 'r1,r2', status: 'summarized', transcript: ARABIC, model: 'gemini-3.5-transcribe', files: [] })
  expect(logs.filter(l => l.e === 'step').map(l => l.step)).toEqual(['summarize', 'transcribe#0', 'prepare'])
})

test('a call under 30 minutes gets speaker labels; one over an hour skips Transcribe for Flash', async () => {
  const short = setup({}, [finished('r1', 1, 1500)])
  await short.webhook()
  expect(short.calls).toContain('transcribe:ar:speakers')
  const long = setup({}, [finished('r1', 1, 3900)])
  await long.webhook()
  expect(long.calls).toContain('listen:flash')
  expect(long.calls.some(c => c.startsWith('transcribe:'))).toBe(false)
})

test('a busy or failing transcriber hands over to the next model in a fresh step', async () => {
  const s = setup()
  const { gemini } = fakeGemini({ transcribeDedicated: async () => { throw new GeminiError('gemini-3.5-transcribe: 429', true) } })
  const listened: string[] = []
  s.setGemini({ ...gemini, transcribeWithModel: async model => { listened.push(model); return ARABIC } })
  await s.webhook()
  expect(listened).toEqual(['flash'])
  expect(s.transcript()).toMatchObject({ status: 'summarized', model: 'flash' })
  expect(s.published).toHaveLength(1)
})

test('a transcript that is not Arabic is not used; when every model fails the audio is still deleted', async () => {
  const s = setup()
  const removed: number[] = []
  s.setGemini({ ...fakeGemini().gemini,
    transcribeDedicated: async () => 'Consultant: well come to the bank',
    transcribeWithModel: async () => { throw new GeminiError('flash: 503', true) },
    remove: async files => { removed.push(files.length) } })
  await s.webhook()
  expect(s.transcript()).toMatchObject({ status: 'failed' })
  expect(removed).toEqual([1])
  expect(s.published).toHaveLength(0)
})

test('nothing runs while the client is still in the call, for other rooms, or twice for the same recordings', async () => {
  const busy = setup({}, [finished('r1', 1), { id: 'r2', status: 'in-progress', start_ts: 2 }])
  await busy.webhook()
  expect(busy.calls).toHaveLength(0)
  expect((await setup().webhook('some-other-room')).body).toEqual({ ignored: 'room' })
  const again = setup({}, [finished('r1', 1)], null, { source: 'r1', status: 'summarized', files: [], audio_seconds: 2700, transcript: ARABIC, model: 'm', error: null })
  await again.webhook()
  expect(again.calls).toHaveLength(0)
})

test("a consultant's own published wording is never replaced; their draft of the same call goes out as it is", async () => {
  const kept = setup({}, [finished('r1', 1)], { summary, status: 'published', source: null, by_consultant: true })
  await kept.webhook()
  expect([...kept.calls, ...kept.published]).toHaveLength(0)
  const draft = { summary: { ...summary, overview: 'edited' }, status: 'draft' as const, source: 'r1' }
  const fromDraft = setup({}, [finished('r1', 1)], draft)
  await fromDraft.webhook()
  expect(fromDraft.calls).not.toContain('summarize:flash')
  expect(fromDraft.published).toEqual([[draft.summary, 'r1']])
})

test('with a background runner each step answers at once and the work carries on', async () => {
  const running: Promise<unknown>[] = []
  const s = setup({ background: work => { running.push(work) } })
  expect(await s.webhook()).toEqual({ status: 200, body: { started: true } })
  while (running.length) await running.shift()
  expect(s.published).toHaveLength(1)
})

test('only signed-in staff who may see the booking can generate', async () => {
  const { call } = setup()
  expect((await call({ action: 'generate', booking_id: ID }, null)).status).toBe(401)
  expect((await call({ action: 'generate', booking_id: '1b6f2f6e-6a51-4b1e-9d1b-1d6c7d0f0a11' })).status).toBe(404)
  expect((await call({ action: 'delete', booking_id: ID })).status).toBe(400)
})

test('generate writes a draft from the kept transcript without sending the audio again', async () => {
  const kept: Transcript = { source: 'r1', status: 'summarized', files: [], audio_seconds: 2700, transcript: ARABIC, model: 'm', error: null }
  const { call, saved, calls } = setup({}, [finished('r1', 1)], null, kept)
  expect((await call({ action: 'generate', booking_id: ID })).status).toBe(200)
  expect(saved).toEqual([[summary, 'r1']])
  expect(calls).toEqual(['summarize:flash'])
})

test('generate with no transcript yet starts the steps and says it is being prepared', async () => {
  const { call, calls, published } = setup()
  expect(await (await call({ action: 'generate', booking_id: ID })).json()).toEqual({ error: 'TRANSCRIPT_PENDING' })
  expect(calls[0]).toBe('upload:1')
  expect(published).toHaveLength(1)
  const busy = setup({}, [{ id: 'r1', status: 'in-progress', start_ts: 1 }])
  expect(await (await busy.call({ action: 'generate', booking_id: ID })).json()).toEqual({ error: 'TRANSCRIPT_PENDING' })
  expect(await (await setup({}, []).call({ action: 'generate', booking_id: ID })).json()).toEqual({ error: 'NO_TRANSCRIPT' })
})

test('recording links the newest finished audio file', async () => {
  expect(await (await setup({}, []).call({ action: 'recording', booking_id: ID })).json()).toEqual({ link: null })
  const { call } = setup({}, [finished('r1', 1), finished('r2', 2)])
  expect(await (await call({ action: 'recording', booking_id: ID })).json()).toEqual({ link: 'https://files.example/r2.m4a' })
})

test('register-webhook needs the admin secret, points Daily at this function, and never echoes the key', async () => {
  const sent: { url: string; body: unknown }[] = []
  const { handler } = setup({ fetch: (async (input: string, init?: RequestInit) => {
    sent.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null })
    if (init?.method === 'POST') return new Response(JSON.stringify({ uuid: 'w1', state: 'ACTIVE', hmac: HMAC }))
    return new Response(JSON.stringify([]))
  }) as typeof fetch })
  const register = (secret: string) => handler(new Request(FN, { method: 'POST', body: JSON.stringify({ action: 'register-webhook' }), headers: { 'x-webhook-secret': secret } }))
  expect((await register('wrong')).status).toBe(401)
  const body = await (await register(ADMIN)).json()
  expect(body).toEqual({ status: 200, state: 'ACTIVE', updated: false, error: null })
  expect(JSON.stringify(body)).not.toContain(HMAC)
  expect(sent[1]).toEqual({ url: 'https://api.daily.co/v1/webhooks', body: { url: FN, eventTypes: ['recording.ready-to-download'], hmac: HMAC } })
})

test('speaker labels do not count towards the Arabic share', () => {
  expect(arabicShare('spk_1: محتاجين كشف حساب')).toBe(1)
  expect(arabicShare('Consultant: well come to the bank')).toBe(0)
})
