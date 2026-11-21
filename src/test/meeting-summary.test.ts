import { arabicShare, dailySignature, meetingSummaryHandler, type Dependencies, type StoredSummary, type Summary } from '../../supabase/functions/meeting-summary/handler'
import type { Audio, Heard } from '../../supabase/functions/meeting-summary/gemini'
import type { RoomBooking } from '../../supabase/functions/video-room/handler'

const ID = '0b6f2f6e-6a51-4b1e-9d1b-1d6c7d0f0a11'
const booking: RoomBooking = {
  id: ID, reference: 'MG-TEST-ROOM', name: 'Ahmed Tarek', status: 'checked-in', format: 'online',
  starts_at: '2026-11-24T14:00:00Z', ends_at: '2026-11-24T14:45:00Z', lang: 'ar',
}
const HMAC = btoa('0123456789abcdef0123456789abcdef')
const ADMIN = 'admin-secret-123'
const summary: Summary = { overview: 'o', keyPoints: ['k'], agreements: ['a'], nextSteps: ['Client: send it'], lang: 'ar' }
const heard: Heard = { ...summary, transcript: 'المستشار: محتاجين كشف حساب آخر ستة شهور\nالعميل: هبعته الأسبوع ده', dropped: 0 }
type Rec = { id: string; status: string; start_ts: number }
const finished = (id: string, start_ts: number): Rec => ({ id, status: 'finished', start_ts })

function setup(over: Partial<Dependencies> = {}, recordings: Rec[] = [finished('r1', 1)], stored: StoredSummary | null = null) {
  const listened: { audio: Audio[]; lang: string }[] = []
  const saved: [Summary, string][] = []
  const published: [Summary, string][] = []
  const logs: Record<string, unknown>[] = []
  const deps: Dependencies = {
    siteUrl: 'https://mg.example',
    functionUrl: 'https://fn.example/functions/v1/meeting-summary',
    dailyKey: 'daily-test-key',
    webhookHmac: HMAC,
    adminSecret: ADMIN,
    verifyUser: async jwt => (jwt === 'staff-jwt' ? 'user-1' : null),
    staffBooking: async (id, user) => (user === 'user-1' && id === ID ? booking : null),
    bookingById: async id => (id === ID ? booking : null),
    summarizeAudio: async (audio, lang) => { listened.push({ audio, lang }); return heard },
    saveDraft: async (_id, s, source) => { saved.push([s, source]); return { summary: s, status: 'draft' } },
    currentSummary: async () => stored,
    publishAuto: async (_id, s, source) => { published.push([s, source]); return { summary: s, status: 'published', source } },
    log: (e, f) => logs.push({ e, ...f }),
    fetch: (async (input: string) => {
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
  const call = (body: unknown, jwt: string | null = 'staff-jwt') => handler(new Request('https://fn.example', {
    method: 'POST', body: JSON.stringify(body), headers: jwt ? { authorization: `Bearer ${jwt}` } : {},
  }))
  /** What Daily sends when a recording is ready, signed like Daily signs it. */
  const webhook = async (room = `mg-${ID}`, sign = true) => {
    const body = JSON.stringify({ version: '1.0.0', type: 'recording.ready-to-download', id: 'evt-1', payload: { recording_id: 'r1', room_name: room }, event_ts: 1 })
    const ts = '1795253000'
    const res = await handler(new Request('https://fn.example', { method: 'POST', body,
      headers: { 'x-webhook-timestamp': ts, 'x-webhook-signature': sign ? await dailySignature(HMAC, ts, body) : 'forged' } }))
    return { status: res.status, body: await res.json() as Record<string, unknown> }
  }
  return { call, webhook, handler, listened, saved, published, logs }
}

test("Daily's address check gets its 200, and an unsigned or forged webhook is refused", async () => {
  const { call, webhook, published } = setup()
  expect((await call({ test: 'test' }, null)).status).toBe(200)
  expect((await webhook(undefined, false)).status).toBe(401)
  expect((await setup({ webhookHmac: undefined }).webhook()).status).toBe(401)
  expect(published).toHaveLength(0)
})

test('a ready recording is heard once, summarized and published, with the recordings it came from', async () => {
  const { webhook, listened, published } = setup({}, [finished('r2', 2), finished('r1', 1)])
  expect(await webhook()).toEqual({ status: 200, body: { done: true } })
  // Both parts of the call, oldest first, in the consultation language.
  expect(listened).toHaveLength(1)
  expect(listened[0].lang).toBe('ar')
  expect(listened[0].audio.map(a => a.mimeType)).toEqual(['audio/mp4', 'audio/mp4'])
  expect(published).toEqual([[summary, 'r1,r2']])
})

test('nothing runs while the client is still in the call, for other rooms, or twice for the same recordings', async () => {
  const busy = setup({}, [finished('r1', 1), { id: 'r2', status: 'in-progress', start_ts: 2 }])
  await busy.webhook()
  expect(busy.listened).toHaveLength(0)
  const stranger = setup()
  expect((await stranger.webhook('some-other-room')).body).toEqual({ ignored: 'room' })
  const again = setup({}, [finished('r1', 1)], { summary, status: 'published', source: 'r1', by_consultant: false })
  await again.webhook()
  expect([...again.listened, ...again.published]).toHaveLength(0)
})

test("a consultant's own published wording is never replaced; their draft of the same call goes out as it is", async () => {
  const kept = setup({}, [finished('r1', 1)], { summary, status: 'published', source: null, by_consultant: true })
  await kept.webhook()
  expect([...kept.listened, ...kept.published]).toHaveLength(0)
  const draft = { summary: { ...summary, overview: 'edited' }, status: 'draft' as const, source: 'r1' }
  const fromDraft = setup({}, [finished('r1', 1)], draft)
  await fromDraft.webhook()
  expect(fromDraft.listened).toHaveLength(0)
  expect(fromDraft.published).toEqual([[draft.summary, 'r1']])
})

test('a second part of the call replaces the earlier automatic summary', async () => {
  const { webhook, published } = setup({}, [finished('r1', 1), finished('r2', 2)], { summary, status: 'published', source: 'r1', by_consultant: false })
  await webhook()
  expect(published).toEqual([[summary, 'r1,r2']])
})

test('an Arabic call that came back as English text is not published', async () => {
  const { webhook, published, logs } = setup({ summarizeAudio: async () => ({ ...heard, transcript: 'Consultant: well come to the bank' }) })
  await webhook()
  expect(published).toHaveLength(0)
  expect(logs).toContainEqual(expect.objectContaining({ e: 'transcript_wrong_language' }))
  expect(arabicShare('العميل: محتاجين كشف حساب')).toBe(1)
})

test('with a background runner Daily gets its answer at once and the work carries on', async () => {
  const running: Promise<unknown>[] = []
  const { webhook, published } = setup({ background: work => { running.push(work) } })
  expect(await webhook()).toEqual({ status: 200, body: { started: true } })
  await Promise.all(running)
  expect(published).toHaveLength(1)
})

test('a failing model is logged and nothing is published', async () => {
  const { webhook, published, logs } = setup({ summarizeAudio: async () => { throw new Error('gemini-3.5-flash: 429') } })
  expect((await webhook()).status).toBe(200)
  expect(published).toHaveLength(0)
  expect(logs).toContainEqual(expect.objectContaining({ e: 'summary_failed', reason: 'gemini-3.5-flash: 429' }))
})

test('only signed-in staff who may see the booking can generate', async () => {
  const { call } = setup()
  expect((await call({ action: 'generate', booking_id: ID }, null)).status).toBe(401)
  expect((await call({ action: 'generate', booking_id: '1b6f2f6e-6a51-4b1e-9d1b-1d6c7d0f0a11' })).status).toBe(404)
  expect((await call({ action: 'delete', booking_id: ID })).status).toBe(400)
})

test('generate writes a draft from the recordings, and says why when it cannot', async () => {
  const { call, saved } = setup()
  expect((await call({ action: 'generate', booking_id: ID })).status).toBe(200)
  expect(saved).toEqual([[summary, 'r1']])
  const busy = setup({}, [{ id: 'r1', status: 'in-progress', start_ts: 1 }])
  expect(await (await busy.call({ action: 'generate', booking_id: ID })).json()).toEqual({ error: 'TRANSCRIPT_PENDING' })
  const none = setup({}, [])
  expect(await (await none.call({ action: 'generate', booking_id: ID })).json()).toEqual({ error: 'NO_TRANSCRIPT' })
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
  const register = (secret: string) => handler(new Request('https://fn.example', { method: 'POST', body: JSON.stringify({ action: 'register-webhook' }), headers: { 'x-webhook-secret': secret } }))
  expect((await register('wrong')).status).toBe(401)
  const res = await register(ADMIN)
  const body = await res.json()
  expect(body).toEqual({ status: 200, state: 'ACTIVE', updated: false, error: null })
  expect(JSON.stringify(body)).not.toContain(HMAC)
  expect(sent[1]).toEqual({ url: 'https://api.daily.co/v1/webhooks', body: { url: 'https://fn.example/functions/v1/meeting-summary', eventTypes: ['recording.ready-to-download'], hmac: HMAC } })
})
