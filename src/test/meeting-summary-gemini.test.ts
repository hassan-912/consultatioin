import { geminiAllowed, geminiSummarizer, normalizeForMatch, quoteIsInTranscript } from '../../supabase/functions/meeting-summary/gemini'

const T = `أحمد: محتاجين كشف حساب آخر ستة شهور مختوم من البنك
كامل: تمام هبعتهولك الأسبوع الجاي إن شاء الله`
const point = (text: string, quote: string) => ({ text, quote })
const good = {
  overview: 'o',
  keyPoints: [point('k', 'محتاجين كشف حساب آخر ستة شهور')],
  agreements: [],
  nextSteps: [point('العميل: يرسل كشف الحساب', 'هبعتهولك الأسبوع الجاي إن شاء الله')],
}
const plain = { overview: 'o', keyPoints: ['k'], agreements: [], nextSteps: ['العميل: يرسل كشف الحساب'] }
const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const ok = (summary: unknown) => answer({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(summary) }] } }] })

function setup(...responses: (Response | Error)[]) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const next = responses.shift()!
    if (next instanceof Error) throw next
    return next
  }) as typeof globalThis.fetch
  return { calls, summarize: geminiSummarizer({ apiKey: 'test-key', models: ['main', 'backup'], fetch }) }
}

test('sends the key in a header, never in the URL, and returns the summary in the asked language', async () => {
  const { calls, summarize } = setup(ok(good))
  expect(await summarize(T, 'ar')).toEqual({ ...plain, lang: 'ar', dropped: 0 })
  expect(calls[0].url).toMatch(/\/models\/main:generateContent$/)
  expect(calls[0].url).not.toContain('test-key')
  expect((calls[0].init?.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key')
  expect(String(calls[0].init?.body)).toContain('Write the summary in Arabic')
})

test('an overloaded or timed-out model hands over to the fallback', async () => {
  const busy = setup(answer({ error: { code: 503 } }, 503), ok(good))
  await busy.summarize(T, 'en')
  expect(busy.calls.map(c => c.url.split('/').pop())).toEqual(['main:generateContent', 'backup:generateContent'])

  const slow = setup(new Error('timeout'), ok(good))
  expect((await slow.summarize(T, 'en')).overview).toBe('o')

  const retired = setup(answer({}, 404), ok(good))
  expect((await retired.summarize(T, 'en')).overview).toBe('o')

  // Headers arrived but the body stalled past the timeout.
  const stalled = new Response(new ReadableStream({ start(c) { c.error(new DOMException('timed out', 'TimeoutError')) } }))
  expect((await setup(stalled, ok(good)).summarize(T, 'en')).overview).toBe('o')
})

test('a bad key or request stops at once instead of trying the fallback', async () => {
  const bad = setup(answer({}, 403), ok(good))
  await expect(bad.summarize(T, 'en')).rejects.toThrow('main: 403')
  expect(bad.calls).toHaveLength(1)
})

test('fails rather than saving a broken or cut-off summary', async () => {
  await expect(setup(answer({}, 503), answer({}, 429)).summarize(T, 'en')).rejects.toThrow('backup: 429')
  await expect(setup(answer({}, 400)).summarize(T, 'en')).rejects.toThrow('main: 400')
  await expect(setup(ok({ overview: 'o' })).summarize(T, 'en')).rejects.toThrow('bad_shape')
  await expect(setup(answer({ promptFeedback: { blockReason: 'SAFETY' } })).summarize(T, 'en')).rejects.toThrow('blocked SAFETY')
  const cut = answer({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"overview":' }] } }] })
  await expect(setup(cut).summarize(T, 'en')).rejects.toThrow('MAX_TOKENS')
})

test('a point the call never had is thrown away, whatever the model says', async () => {
  const made = { ...good, keyPoints: [...good.keyPoints, point('Your visa will be approved', 'we guarantee your visa will be approved this month')] }
  const r = await setup(ok(made)).summarize(T, 'ar')
  expect(r.keyPoints).toEqual(['k'])
  expect(r.dropped).toBe(1)
  // Nothing backed by the call at all: no summary rather than a made-up one.
  const allMade = { ...good, keyPoints: [point('x', 'nobody ever said these words in the call')], nextSteps: [] }
  await expect(setup(ok(allMade)).summarize(T, 'ar')).rejects.toThrow('ungrounded')
})

test('a quote matches despite tashkeel, hamza, punctuation and a slipped word, but not when it is too short', () => {
  const heard = normalizeForMatch(T)
  expect(quoteIsInTranscript('مُحتاجين كشفَ حساب، آخر ستة شهور!', heard)).toBe(true)
  expect(quoteIsInTranscript('هبعتهولك الاسبوع الجاي ان شاء الله', heard)).toBe(true)
  expect(quoteIsInTranscript('محتاجين كشف حساب آخر ستة شهور مختوم من السفارة', heard)).toBe(true)
  expect(quoteIsInTranscript('كشف حساب', heard)).toBe(false)
  expect(quoteIsInTranscript('محتاجين شهادة ميلاد مترجمة من الخارجية', heard)).toBe(false)
})

test('the hosted project calls Gemini only once GEMINI_BILLING says paid or free', () => {
  expect(geminiAllowed('http://kong:8000', undefined)).toBe(true)
  expect(geminiAllowed('http://127.0.0.1:54321', undefined)).toBe(true)
  expect(geminiAllowed('https://abcd1234.supabase.co', undefined)).toBe(false)
  expect(geminiAllowed('https://abcd1234.supabase.co', 'yes')).toBe(false)
  expect(geminiAllowed('https://abcd1234.supabase.co', 'free')).toBe(true)
  expect(geminiAllowed('https://abcd1234.supabase.co', 'paid')).toBe(true)
})
