// Google Gemini over plain REST (no SDK, so it runs the same in Deno and in tests): upload the call's audio, transcribe
// it (Gemini 3.5 Transcribe, or a Flash model listening as the fallback), and write the summary from the transcript.
// The API key goes in a header, never in the URL, so it can't end up in a log line.

import type { Summary } from './handler.ts'

const API = 'https://generativelanguage.googleapis.com/v1beta/models'
const FILES = 'https://generativelanguage.googleapis.com/v1beta/files'
const UPLOAD = 'https://generativelanguage.googleapis.com/upload/v1beta/files'
const INTERACTIONS = 'https://generativelanguage.googleapis.com/v1beta/interactions'

// Written from Wikipedia's "Signs of AI writing" list, plus the Arabic equivalents of the same habits.
const STYLE = `How to write:
- Plain, direct sentences of normal length. Say "is" and "has", not "serves as", "stands as", "boasts" or "represents".
- Report what was said. Do not add commentary on why it matters, and do not end a sentence with a clause like
  "highlighting...", "reflecting...", "ensuring...", "underscoring...".
- No "not only X but also Y", "not X, but Y", "it's not just..." constructions. No lists of three added for rhythm.
- No em dashes. No bold, no emoji, no headings inside the text. No closing pep talk, no "we hope this helps",
  "feel free to", "don't hesitate to", "let us know".
- No vague wording: "various", "several aspects", "a range of", "valuable insights", "comprehensive", "seamless",
  "journey", "landscape", "crucial", "pivotal", "vital", "key", "delve", "foster", "leverage", "enhance",
  "robust", "multifaceted", "navigate", "tailored", "it's important to note", "additionally" at the start of a sentence.

When the summary is in Arabic:
- Write in clear Modern Standard Arabic (فصحى مبسطة) as a careful human office writer would, not translated English.
  The transcript is usually in Egyptian dialect: carry the meaning over into فصحى, never copy dialect words
  (ميعاد → موعد, متحدد → محدد, هبعت → سنرسل, عايز → يرغب). No stiff literary style, and no diacritics
  (no تشكيل on any letter). Check case endings on job titles: «بصفتك مهندس برمجيات», «يعمل مهندسَ برمجيات» without the mark.
- Use «اتفقنا» only for something both sides committed to. An open question is not an agreement.
- Avoid these stock phrases and their variants: تجدر الإشارة إلى, من الجدير بالذكر, لا شك أن, مما لا شك فيه,
  في ظل, في إطار, في عالم, رحلة, خطوة هامة نحو, يلعب دوراً محورياً/حيوياً, بالغ الأهمية, حجر الزاوية,
  مما يعكس, مما يسلط الضوء على, مما يؤكد, يُجسّد, يُبرز, شامل/شاملة, سلس, علاوة على ذلك, فضلاً عن ذلك,
  بالإضافة إلى ذلك (at the start of a sentence), ليس فقط... بل أيضاً, لا يقتصر على... بل, نأمل أن,
  لا تتردد في, يسعدنا, وفي الختام, ختاماً.
- Do not start every sentence with و or with يُعدّ/تُعدّ. Use "قدّم" not "قام بتقديم", "راجع" not "قام بمراجعة".
- Use Western digits (1, 2, 3) for numbers and dates, as on the client's documents. Keep names of countries,
  programmes and documents exactly as they were said.`

/** For Flash when it is the transcriber (the fallback): the call as spoken, nothing else. */
const TRANSCRIBE = `You receive the audio recording of a visa consultation between a client and their MG International
consultant (one or more files, in order). Write a faithful transcript of the whole call and nothing else.
- Write what is said, in the language and dialect it is said in (usually Egyptian Arabic with some English words).
  Do not translate it, correct it, summarize it or tidy it into فصحى.
- One speaker turn per line, starting with who speaks: "المستشار:" or "العميل:" ("Consultant:" / "Client:" when the
  call is in English). Tell them apart by voice and by what they say: the consultant asks and advises.
- Never add words that were not said. Where speech is unclear write [غير واضح] ([unclear]); where nobody speaks,
  write nothing.`

const SUMMARY = `You write the client-facing summary of a visa consultation between a client and their MG International
consultant, from the call's transcript. The client keeps it as their record of the meeting, so it must be accurate and
complete.

Accuracy rules (these come before everything else):
- Use only what was said in the transcript. Never invent figures, dates, documents, countries, programmes or promises,
  and never fill a gap with what consultations "usually" cover.
- Every key point, agreement and next step must come with "quote": words copied exactly from the transcript (8 to 25
  words, from one place, without any speaker label). Points whose quote is not in the transcript are thrown away, so
  if you cannot point to the words, leave the point out.
- The transcript comes from speech recognition and has errors. When a passage makes no sense, skip it; do not guess.
- The transcript may not say who is speaking. Work it out from what is said: the consultant asks and advises, the
  client describes their situation. When it is unclear who committed to something, do not put it in agreements.
- Use «اتفقنا» / "we agreed" only for something both sides committed to. An open question is not an agreement.
- Never state or imply that a visa will be approved. Do not include any internal scores or points.

Completeness rules:
- Go through the whole transcript, start to end, before writing. Cover every topic discussed in substance
  (documents, money, dates, eligibility, the client's situation, the consultant's advice), in the order it came up.
- Keep separate topics as separate points, and do not drop the end of the call.
- Small talk, greetings and problems with the call are not topics. A short call gets a short summary.

Write as MG speaking to the client ("we", "you"; in Arabic «نحن», «أنت/حضرتك»).

${STYLE}`

const POINT = {
  type: 'object',
  required: ['text', 'quote'],
  properties: {
    text: { type: 'string', description: 'The point, in one or two sentences, in the summary language.' },
    quote: { type: 'string', description: 'Words copied exactly from the transcript that support it.' },
  },
}
const SCHEMA = {
  type: 'object',
  required: ['overview', 'keyPoints', 'agreements', 'nextSteps'],
  properties: {
    keyPoints: { type: 'array', maxItems: 15, items: POINT, description: 'Every topic discussed in substance, in the order it came up.' },
    agreements: { type: 'array', maxItems: 15, items: POINT, description: 'What the client and MG both committed to. Empty if nothing was agreed.' },
    nextSteps: { type: 'array', maxItems: 15, items: POINT, description: 'Concrete next actions that were said. Each text starts with who does it ("Client: …" or "MG: …"; in Arabic "العميل: …" or "MG: …") and keeps any deadline that was said.' },
    // Last, so it is written from the points above rather than the other way round.
    overview: { type: 'string', description: 'Two or three sentences built only from the points above: why the client came and where things stand.' },
  },
}

/** Letters and digits only, with Arabic spelling variants folded together, so a faithful quote still matches the
 *  transcript after the model changes punctuation, spacing, hamza or taa marbuta. */
export function normalizeForMatch(s: string): string {
  return s.normalize('NFKC').toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '') // tashkeel and tatweel
    .replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[ؤئ]/g, 'ء')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/** True when the quote really is in the transcript: word for word, or (allowing for a slip or two) when most of its
 *  three-word runs are. Quotes under four words never count: a few common words prove nothing. */
export function quoteIsInTranscript(quote: string, normalizedTranscript: string): boolean {
  const q = normalizeForMatch(quote)
  const words = q.split(' ').filter(Boolean)
  if (words.length < 4) return false
  if (` ${normalizedTranscript} `.includes(` ${q} `)) return true
  const runs = words.slice(0, -2).map((_, i) => words.slice(i, i + 3).join(' '))
  const found = runs.filter(r => ` ${normalizedTranscript} `.includes(` ${r} `)).length
  return found / runs.length >= 0.7
}

/**
 * Free-tier Gemini keys let Google use what is sent to improve its products (human reviewers may read it), so the
 * hosted project sends client recordings to Gemini only after the owner says which terms apply: GEMINI_BILLING=paid,
 * or GEMINI_BILLING=free to accept the free-tier terms knowingly (the owner's decision of 2026-11-19).
 * Without the setting, only the local stack may call Gemini.
 */
export function geminiAllowed(supabaseUrl: string, billing: string | undefined): boolean {
  if (billing === 'paid' || billing === 'free') return true
  const host = new URL(supabaseUrl).hostname
  // `supabase start` serves functions with SUPABASE_URL=http://kong:8000.
  return host === 'kong' || host === 'localhost' || host === '127.0.0.1' || host === 'host.docker.internal'
}

/** `transient`: busy, overloaded or too slow; another model or a later try may work. Otherwise it would fail again. */
export class GeminiError extends Error {
  transient: boolean
  constructor(message: string, transient: boolean) { super(message); this.transient = transient }
}
const failure = (what: string, status: number) =>
  new GeminiError(`${what}: ${status}`, status === 404 || status === 408 || status === 429 || status >= 500)

type Point = { text: string; quote: string }
const isPointList = (v: unknown): v is Point[] => Array.isArray(v)
  && v.every(p => typeof p === 'object' && p !== null && typeof (p as Point).text === 'string' && typeof (p as Point).quote === 'string')

/** One audio file of the call, as Daily recorded it. */
export type Audio = { bytes: Uint8Array; mimeType: string }
/** An audio file uploaded to Gemini (Files API). */
export type GeminiFile = { name: string; uri: string; mimeType: string }
/** The summary, minus every point the transcript does not back. */
export type Grounded = Summary & { dropped: number }

/** Everything in a model's answer that is text, wherever this API version puts it. */
function textOf(data: unknown): string {
  const d = data as Record<string, unknown> | null
  if (typeof d?.output_text === 'string') return d.output_text
  const out: string[] = []
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (typeof o.text === 'string' && (o.type === 'text' || o.type === undefined) && !('speaker' in o)) out.push(o.text)
      for (const k of ['steps', 'outputs', 'content', 'parts', 'candidates']) if (k in o) walk(o[k])
    }
  }
  walk(d)
  return out.join('')
}

/** With speaker labels on, Transcribe returns each word with its speaker: one line per speaker turn. */
function linesBySpeaker(data: unknown): string {
  const words: { text: string; speaker: string }[] = []
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (o.type === 'word_info' && typeof o.text === 'string') words.push({ text: o.text, speaker: String(o.speaker ?? '') })
      else Object.values(o).forEach(walk)
    }
  }
  walk(data)
  const lines: string[] = []
  let last = '\u0000'
  for (const w of words) {
    if (w.speaker === last) lines[lines.length - 1] += ` ${w.text}`
    else { lines.push(`${w.speaker || 'spk'}: ${w.text}`); last = w.speaker }
  }
  return lines.join('\n')
}

export function geminiClient(options: { apiKey: string; fetch: typeof fetch }) {
  const send = async (url: string, init: RequestInit & { timeout: number }) => {
    try {
      return await options.fetch(url, { ...init, headers: { 'x-goog-api-key': options.apiKey, ...(init.headers as Record<string, string>) }, signal: AbortSignal.timeout(init.timeout) })
    } catch (e) {
      throw new GeminiError(`${new URL(url).pathname.split('/').pop()}: timeout`, true)
    }
  }
  const json = async (res: Response, what: string) => {
    if (!res.ok) throw failure(what, res.status)
    // The timeout also covers reading the body, so a stalled stream counts as slow.
    try { return await res.json() as Record<string, unknown> } catch { throw new GeminiError(`${what}: timeout`, true) }
  }

  /** Uploads the call's audio (Files API, resumable). */
  async function upload(audio: Audio[]): Promise<GeminiFile[]> {
    const files: GeminiFile[] = []
    for (const [i, a] of audio.entries()) {
      const start = await send(`${UPLOAD}?uploadType=resumable`, {
        method: 'POST', timeout: 30000,
        headers: { 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start', 'Content-Type': 'application/json',
          'X-Goog-Upload-Header-Content-Length': String(a.bytes.byteLength), 'X-Goog-Upload-Header-Content-Type': a.mimeType },
        body: JSON.stringify({ file: { display_name: `consultation-part-${i + 1}` } }),
      })
      const target = start.headers.get('x-goog-upload-url')
      if (!start.ok || !target) throw failure('upload', start.status)
      const done = await send(target, {
        method: 'POST', timeout: 90000,
        headers: { 'X-Goog-Upload-Command': 'upload, finalize', 'X-Goog-Upload-Offset': '0' }, body: a.bytes,
      })
      const file = (await json(done, 'upload')).file as { name?: string; uri?: string; mimeType?: string; state?: string } | undefined
      if (!file?.name || !file.uri) throw new GeminiError('upload: no file', false)
      // Audio is usually ready at once; wait a little if Google is still processing it.
      let state = file.state
      for (let n = 0; state === 'PROCESSING' && n < 10; n++) {
        await new Promise(r => setTimeout(r, 2000))
        state = (await json(await send(`${FILES}/${file.name.replace(/^files\//, '')}`, { method: 'GET', timeout: 15000 }), 'upload')).state as string | undefined
      }
      if (state && state !== 'ACTIVE') throw new GeminiError(`upload: ${state}`, state === 'PROCESSING')
      files.push({ name: file.name, uri: file.uri, mimeType: file.mimeType ?? a.mimeType })
    }
    return files
  }

  /** Deletes uploaded audio. Never throws: Google deletes it after 48 hours anyway. */
  async function remove(files: GeminiFile[]) {
    for (const f of files) await send(`${FILES}/${f.name.replace(/^files\//, '')}`, { method: 'DELETE', timeout: 15000 }).catch(() => undefined)
  }

  /** Gemini 3.5 Transcribe (Interactions API). Speaker labels only when asked: they cap the audio at 30 minutes. */
  async function transcribeDedicated(files: GeminiFile[], lang: 'en' | 'ar', speakers: boolean, timeout: number): Promise<string> {
    const res = await send(INTERACTIONS, {
      method: 'POST', timeout, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-3.5-transcribe',
        // Transcribe lists audio/m4a, not audio/mp4, for Daily's .m4a files.
        input: files.map(f => ({ type: 'audio', uri: f.uri, mime_type: f.mimeType === 'audio/mp4' ? 'audio/m4a' : f.mimeType })),
        generation_config: { transcription_config: {
          language_codes: [lang === 'ar' ? 'ar-EG' : 'en-US'],
          mode: speakers ? { type: 'verbatim', diarization_mode: 'speaker' } : { type: 'verbatim' },
        } },
      }),
    })
    const data = await json(res, 'gemini-3.5-transcribe')
    const text = (speakers ? linesBySpeaker(data) : '') || textOf(data)
    if (!text.trim()) throw new GeminiError('gemini-3.5-transcribe: empty', false)
    return text.trim()
  }

  /** A Flash model listening to the audio and writing the transcript (the fallback, with speaker labels). */
  async function transcribeWithModel(model: string, files: GeminiFile[], timeout: number): Promise<string> {
    const res = await send(`${API}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', timeout, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: TRANSCRIBE }] },
        contents: [{ role: 'user', parts: [...files.map(f => ({ fileData: { mimeType: f.mimeType, fileUri: f.uri } })), { text: 'Transcribe the call.' }] }],
        generationConfig: { maxOutputTokens: 65536 },
      }),
    })
    const data = await json(res, model) as { promptFeedback?: { blockReason?: string }; candidates?: { finishReason?: string }[] }
    if (data.promptFeedback?.blockReason) throw new GeminiError(`${model}: blocked ${data.promptFeedback.blockReason}`, false)
    const reason = data.candidates?.[0]?.finishReason
    if (reason && reason !== 'STOP') throw new GeminiError(`${model}: ${reason}`, reason === 'MAX_TOKENS')
    const text = textOf(data).trim()
    if (!text) throw new GeminiError(`${model}: empty`, true)
    return text
  }

  /** The summary from the transcript text. Tries each model in turn; a point its quote does not back is dropped. */
  async function summarize(models: string[], transcript: string, lang: 'en' | 'ar', timeout: number): Promise<Grounded> {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: SUMMARY }] },
      contents: [{ role: 'user', parts: [{ text: `Write the summary in ${lang === 'ar' ? 'Arabic' : 'English'}.\n\n<transcript>\n${transcript}\n</transcript>` }] }],
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: SCHEMA },
    })
    let last: GeminiError = new GeminiError('no_model', false)
    for (const model of models) {
      let data: { promptFeedback?: { blockReason?: string }; candidates?: { finishReason?: string }[] }
      try {
        data = await json(await send(`${API}/${encodeURIComponent(model)}:generateContent`, { method: 'POST', timeout, headers: { 'Content-Type': 'application/json' }, body }), model)
      } catch (e) {
        if (e instanceof GeminiError && e.transient) { last = e; continue }
        throw e
      }
      if (data.promptFeedback?.blockReason) throw new GeminiError(`${model}: blocked ${data.promptFeedback.blockReason}`, false)
      const reason = data.candidates?.[0]?.finishReason
      if (reason && reason !== 'STOP') throw new GeminiError(`${model}: ${reason}`, false)
      const text = textOf(data)
      if (!text) throw new GeminiError(`${model}: empty`, false)
      const parsed = JSON.parse(text) as Record<string, unknown>
      if (typeof parsed.overview !== 'string' || !isPointList(parsed.keyPoints)
        || !isPointList(parsed.agreements) || !isPointList(parsed.nextSteps)) throw new GeminiError(`${model}: bad_shape`, false)
      const heard = normalizeForMatch(transcript)
      let dropped = 0
      const keep = (list: Point[]) => {
        const backed = list.filter(p => p.text.trim() && quoteIsInTranscript(p.quote, heard))
        dropped += list.length - backed.length
        return backed.map(p => p.text.trim())
      }
      const result: Grounded = { overview: parsed.overview.trim(), keyPoints: keep(parsed.keyPoints), agreements: keep(parsed.agreements), nextSteps: keep(parsed.nextSteps), lang, dropped }
      // Nothing it said could be found in the call: the overview would be just as made up.
      if (!result.keyPoints.length) throw new GeminiError(`${model}: ungrounded`, false)
      return result
    }
    throw last
  }

  return { upload, remove, transcribeDedicated, transcribeWithModel, summarize }
}
export type GeminiClient = ReturnType<typeof geminiClient>
