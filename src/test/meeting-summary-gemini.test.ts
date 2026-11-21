import { GeminiError, geminiAllowed, geminiClient, normalizeForMatch, quoteIsInTranscript } from '../../supabase/functions/meeting-summary/gemini'

const T = `المستشار: محتاجين كشف حساب آخر ستة شهور مختوم من البنك
العميل: تمام هبعتهولك الأسبوع الجاي إن شاء الله`
const point = (text: string, quote: string) => ({ text, quote })
const good = {
  overview: 'o',
  keyPoints: [point('k', 'محتاجين كشف حساب آخر ستة شهور')],
  agreements: [],
  nextSteps: [point('العميل: يرسل كشف الحساب', 'هبعتهولك الأسبوع الجاي إن شاء الله')],
}
const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const text = (out: string) => answer({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: out }] } }] })
const files = [{ name: 'files/abc', uri: 'https://gen.example/files/abc', mimeType: 'audio/mp4' }]

function setup(...replies: (Response | Error)[]) {
  const calls: { url: string; method: string; headers: Record<string, string>; body?: unknown }[] = []
  const fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? 'GET', headers: init.headers as Record<string, string>, body: init.body })
    if (url.includes('/upload/v1beta/files')) return new Response('{}', { headers: { 'x-goog-upload-url': 'https://upload.example/session-1' } })
    if (url === 'https://upload.example/session-1') return answer({ file: { name: 'files/abc', uri: 'https://gen.example/files/abc', mimeType: 'audio/mp4', state: 'ACTIVE' } })
    if (init.method === 'DELETE') return answer({})
    const next = replies.shift()!
    if (next instanceof Error) throw next
    return next
  }) as typeof globalThis.fetch
  return { calls, g: geminiClient({ apiKey: 'test-key', fetch }) }
}

test('upload and remove: resumable upload, key only in a header, delete by file name', async () => {
  const { calls, g } = setup()
  expect(await g.upload([{ bytes: new Uint8Array([1, 2, 3]), mimeType: 'audio/mp4' }])).toEqual(files)
  await g.remove(files)
  expect(calls.map(c => c.method)).toEqual(['POST', 'POST', 'DELETE'])
  expect(calls[0].headers['X-Goog-Upload-Header-Content-Type']).toBe('audio/mp4')
  expect(calls.every(c => !c.url.includes('test-key') && c.headers['x-goog-api-key'] === 'test-key')).toBe(true)
})

test('Gemini 3.5 Transcribe: Interactions API, Egyptian Arabic, audio/m4a, the text wherever it comes back', async () => {
  const { calls, g } = setup(answer({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: T }] }] }),
    answer({ outputs: [{ type: 'text', text: 'نص' }] }), answer({ output_text: 'نص آخر' }))
  expect(await g.transcribeDedicated(files, 'ar', false, 1000)).toBe(T)
  const sent = JSON.parse(String(calls[0].body))
  expect(calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions')
  expect(sent).toEqual({ model: 'gemini-3.5-transcribe', input: [{ type: 'audio', uri: files[0].uri, mime_type: 'audio/m4a' }],
    generation_config: { transcription_config: { language_codes: ['ar-EG'], mode: { type: 'verbatim' } } } })
  expect(await g.transcribeDedicated(files, 'ar', false, 1000)).toBe('نص')
  expect(await g.transcribeDedicated(files, 'ar', false, 1000)).toBe('نص آخر')
})

test('with speaker labels, words are joined into one line per speaker turn', async () => {
  const words = [['محتاجين', 'spk_1'], ['كشف', 'spk_1'], ['حساب', 'spk_1'], ['تمام', 'spk_2'], ['هبعته', 'spk_2']]
  const { calls, g } = setup(answer({ steps: [{ content: [{ type: 'text', text: 'محتاجين كشف حساب تمام هبعته',
    annotations: words.map(([t, s]) => ({ type: 'word_info', text: t, speaker: s })) }] }] }))
  expect(await g.transcribeDedicated(files, 'ar', true, 1000)).toBe('spk_1: محتاجين كشف حساب\nspk_2: تمام هبعته')
  expect(JSON.parse(String(calls[0].body)).generation_config.transcription_config.mode).toEqual({ type: 'verbatim', diarization_mode: 'speaker' })
})

test('busy, retired and slow models are worth another model; a bad key or request is not', async () => {
  for (const [reply, transient] of [[answer({}, 429), true], [answer({}, 503), true], [answer({}, 404), true], [new Error('timeout'), true], [answer({}, 400), false], [answer({}, 403), false]] as const) {
    const err = await setup(reply).g.transcribeDedicated(files, 'ar', false, 1000).catch(e => e)
    expect(err).toBeInstanceOf(GeminiError)
    expect((err as GeminiError).transient).toBe(transient)
  }
})

test('Flash as the transcriber: listens to the file and returns the text; a cut-off answer is worth another try', async () => {
  const { calls, g } = setup(text(T))
  expect(await g.transcribeWithModel('flash', files, 1000)).toBe(T)
  expect(String(calls[0].body)).toContain('"fileUri":"https://gen.example/files/abc"')
  const cut = answer({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'المستشار:' }] } }] })
  expect((await setup(cut).g.transcribeWithModel('flash', files, 1000).catch(e => e) as GeminiError).transient).toBe(true)
})

test('summarize: from the transcript text, falls back on a busy model, drops points the transcript does not back', async () => {
  const made = { ...good, keyPoints: [...good.keyPoints, point('Your visa will be approved', 'we guarantee your visa will be approved this month')] }
  const { calls, g } = setup(answer({}, 503), text(JSON.stringify(made)))
  const r = await g.summarize(['main', 'backup'], T, 'ar', 1000)
  expect(r).toMatchObject({ keyPoints: ['k'], nextSteps: ['العميل: يرسل كشف الحساب'], lang: 'ar', dropped: 1 })
  expect(calls.map(c => c.url.split('/').pop())).toEqual(['main:generateContent', 'backup:generateContent'])
  expect(String(calls[1].body)).toContain('Write the summary in Arabic')
  await expect(setup(text(JSON.stringify({ ...good, keyPoints: [point('x', 'nobody ever said these words at all')] }))).g.summarize(['main'], T, 'ar', 1000)).rejects.toThrow('ungrounded')
  await expect(setup(text(JSON.stringify({ overview: 'o' }))).g.summarize(['main'], T, 'ar', 1000)).rejects.toThrow('bad_shape')
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
