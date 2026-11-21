import { geminiAllowed, geminiAudioSummarizer, normalizeForMatch, quoteIsInTranscript } from '../../supabase/functions/meeting-summary/gemini'

const T = `المستشار: محتاجين كشف حساب آخر ستة شهور مختوم من البنك
العميل: تمام هبعتهولك الأسبوع الجاي إن شاء الله`
const point = (text: string, quote: string) => ({ text, quote })
const good = {
  transcript: T,
  overview: 'o',
  keyPoints: [point('k', 'محتاجين كشف حساب آخر ستة شهور')],
  agreements: [],
  nextSteps: [point('العميل: يرسل كشف الحساب', 'هبعتهولك الأسبوع الجاي إن شاء الله')],
}
const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const ok = (out: unknown) => answer({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(out) }] } }] })
const audio = [{ bytes: new Uint8Array([1, 2, 3]), mimeType: 'audio/mp4' }]

/** Google's Files API around the model calls: upload start, upload, (model answers…), delete. */
function setup(...models: (Response | Error)[]) {
  const calls: { url: string; method: string; headers: Record<string, string>; body?: unknown }[] = []
  const fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? 'GET', headers: init.headers as Record<string, string>, body: init.body })
    if (url.includes('/upload/v1beta/files')) return new Response('{}', { headers: { 'x-goog-upload-url': 'https://upload.example/session-1' } })
    if (url === 'https://upload.example/session-1') return answer({ file: { name: 'files/abc', uri: 'https://gen.example/files/abc', mimeType: 'audio/mp4', state: 'ACTIVE' } })
    if (init.method === 'DELETE') return answer({})
    const next = models.shift()!
    if (next instanceof Error) throw next
    return next
  }) as typeof globalThis.fetch
  return { calls, summarize: geminiAudioSummarizer({ apiKey: 'test-key', models: ['main', 'backup'], fetch }) }
}
const modelCalls = (calls: ReturnType<typeof setup>['calls']) => calls.filter(c => c.url.includes(':generateContent'))

test('uploads the audio, asks one model once, keeps the key out of URLs, and deletes the audio afterwards', async () => {
  const { calls, summarize } = setup(ok(good))
  const r = await summarize(audio, 'ar')
  expect(r).toMatchObject({ transcript: T, keyPoints: ['k'], nextSteps: ['العميل: يرسل كشف الحساب'], lang: 'ar', dropped: 0 })
  expect(modelCalls(calls)).toHaveLength(1)
  expect(String(modelCalls(calls)[0].body)).toContain('https://gen.example/files/abc')
  expect(calls.every(c => !c.url.includes('test-key'))).toBe(true)
  expect(calls.every(c => c.headers['x-goog-api-key'] === 'test-key')).toBe(true)
  expect(calls.at(-1)).toMatchObject({ method: 'DELETE', url: expect.stringMatching(/\/files\/abc$/) })
})

test('the audio is deleted even when every model fails', async () => {
  const { calls, summarize } = setup(answer({}, 503), answer({}, 429))
  await expect(summarize(audio, 'ar')).rejects.toThrow('backup: 429')
  expect(calls.at(-1)?.method).toBe('DELETE')
})

test('an overloaded or timed-out model hands over to the fallback; a bad key stops at once', async () => {
  const busy = setup(answer({}, 503), ok(good))
  await busy.summarize(audio, 'ar')
  expect(modelCalls(busy.calls).map(c => c.url.split('/').pop())).toEqual(['main:generateContent', 'backup:generateContent'])
  expect((await setup(new Error('timeout'), ok(good)).summarize(audio, 'ar')).overview).toBe('o')
  const bad = setup(answer({}, 403), ok(good))
  await expect(bad.summarize(audio, 'ar')).rejects.toThrow('main: 403')
  expect(modelCalls(bad.calls)).toHaveLength(1)
})

test('a point its own transcript does not back is thrown away; none backed means no summary', async () => {
  const made = { ...good, keyPoints: [...good.keyPoints, point('Your visa will be approved', 'we guarantee your visa will be approved this month')] }
  const r = await setup(ok(made)).summarize(audio, 'ar')
  expect(r.keyPoints).toEqual(['k'])
  expect(r.dropped).toBe(1)
  await expect(setup(ok({ ...good, keyPoints: [point('x', 'nobody ever said these words at all')], nextSteps: [] })).summarize(audio, 'ar')).rejects.toThrow('ungrounded')
})

test('fails rather than saving a broken or cut-off answer', async () => {
  await expect(setup(ok({ overview: 'o' })).summarize(audio, 'ar')).rejects.toThrow('bad_shape')
  await expect(setup(answer({ promptFeedback: { blockReason: 'SAFETY' } })).summarize(audio, 'ar')).rejects.toThrow('blocked SAFETY')
  const cut = answer({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"transcript":' }] } }] })
  await expect(setup(cut).summarize(audio, 'ar')).rejects.toThrow('MAX_TOKENS')
})

test('a quote matches despite tashkeel, hamza, punctuation and a slipped word, but not when it is too short', () => {
  const t = normalizeForMatch(T)
  expect(quoteIsInTranscript('مُحتاجين كشفَ حساب، آخر ستة شهور!', t)).toBe(true)
  expect(quoteIsInTranscript('هبعتهولك الاسبوع الجاي ان شاء الله', t)).toBe(true)
  expect(quoteIsInTranscript('محتاجين كشف حساب آخر ستة شهور مختوم من السفارة', t)).toBe(true)
  expect(quoteIsInTranscript('كشف حساب', t)).toBe(false)
  expect(quoteIsInTranscript('محتاجين شهادة ميلاد مترجمة من الخارجية', t)).toBe(false)
})

test('the hosted project calls Gemini only once GEMINI_BILLING says paid or free', () => {
  expect(geminiAllowed('http://kong:8000', undefined)).toBe(true)
  expect(geminiAllowed('https://abcd1234.supabase.co', undefined)).toBe(false)
  expect(geminiAllowed('https://abcd1234.supabase.co', 'free')).toBe(true)
  expect(geminiAllowed('https://abcd1234.supabase.co', 'paid')).toBe(true)
})
