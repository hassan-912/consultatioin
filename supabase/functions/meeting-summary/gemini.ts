// Writes the meeting summary with Google Gemini over plain REST (no SDK, so it runs the same in Deno and in tests):
// Gemini listens to the call's audio recording and returns the transcript and the summary together.
// The API key goes in a header, never in the URL, so it can't end up in a log line.

import type { Summary } from './handler.ts'

const API = 'https://generativelanguage.googleapis.com/v1beta/models'
const FILES = 'https://generativelanguage.googleapis.com/v1beta/files'
const UPLOAD = 'https://generativelanguage.googleapis.com/upload/v1beta/files'

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

const SYSTEM = `You receive the audio recording of a visa consultation between a client and their MG International
consultant (one or more files, in order). You write two things: a faithful transcript, and the client-facing summary.

Transcript rules:
- Listen to the whole recording. Write what is said, in the language and dialect it is said in (usually Egyptian
  Arabic with some English words): do not translate it, correct it or tidy it into فصحى.
- One speaker turn per line, starting with who speaks: "المستشار:" or "العميل:" ("Consultant:" / "Client:" when the
  call is in English). Tell them apart by voice and by what they say: the consultant asks and advises.
- Never add words that were not said. Where speech is unclear, write [غير واضح] ([unclear]); where nobody speaks,
  write nothing. Leave out greetings and small talk only if they are inaudible; otherwise keep them.

Summary rules (these come before style):
- Use only what was said. Never invent figures, dates, documents, countries, programmes or promises, and never fill
  a gap with what consultations "usually" cover.
- Every key point, agreement and next step must come with "quote": words copied exactly from YOUR transcript above
  (8 to 25 words, from one line, without the speaker label). Points whose quote is not in the transcript are thrown
  away, so if you cannot point to the words, leave the point out.
- Cover every topic discussed in substance (documents, money, dates, eligibility, the client's situation, the
  consultant's advice), in the order it came up. Keep separate topics separate, and do not drop the end of the call.
  Small talk and problems with the call are not topics. A short call gets a short summary; an empty list is fine.
- Use «اتفقنا» / "we agreed" only for something both sides committed to. An open question is not an agreement.
- Never state or imply that a visa will be approved. Do not include any internal scores or points.
- Write as MG speaking to the client ("we", "you"; in Arabic «نحن», «أنت/حضرتك»).

${STYLE}`

const POINT = {
  type: 'object',
  required: ['text', 'quote'],
  properties: {
    text: { type: 'string', description: 'The point, in one or two sentences, in the summary language.' },
    quote: { type: 'string', description: 'Words copied exactly from the transcript field that support it.' },
  },
}
const SCHEMA = {
  type: 'object',
  required: ['transcript', 'overview', 'keyPoints', 'agreements', 'nextSteps'],
  properties: {
    // First, so the summary is written from it and its quotes can be checked against it.
    transcript: { type: 'string', description: 'The whole call, one speaker turn per line, as spoken.' },
    keyPoints: { type: 'array', maxItems: 15, items: POINT, description: 'Every topic discussed in substance, in the order it came up.' },
    agreements: { type: 'array', maxItems: 15, items: POINT, description: 'What the client and MG both committed to. Empty if nothing was agreed.' },
    nextSteps: { type: 'array', maxItems: 15, items: POINT, description: 'Concrete next actions that were said. Each text starts with who does it ("Client: …" or "MG: …"; in Arabic "العميل: …" or "MG: …") and keeps any deadline that was said.' },
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

export type GeminiOptions = {
  apiKey: string
  /** Tried in order. A model that is overloaded, retired, broken or too slow hands over to the next one. */
  models: string[]
  fetch: typeof fetch
  timeoutMs?: number
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

type Point = { text: string; quote: string }
const isPointList = (v: unknown): v is Point[] => Array.isArray(v)
  && v.every(p => typeof p === 'object' && p !== null && typeof (p as Point).text === 'string' && typeof (p as Point).quote === 'string')

/** One audio file of the call, as Daily recorded it. */
export type Audio = { bytes: Uint8Array; mimeType: string }
/** What the model wrote, minus every point it could not back with its own transcript. */
export type Heard = Summary & { transcript: string; dropped: number }

/**
 * Uploads the call's audio to Gemini (Files API), has one model listen to all of it and return the transcript and the
 * summary in a single request, then deletes the uploaded audio again (Google would keep it 48 hours otherwise).
 */
export function geminiAudioSummarizer(options: GeminiOptions) {
  const headers = { 'x-goog-api-key': options.apiKey }
  const send = (url: string, init: RequestInit & { timeout?: number }) =>
    options.fetch(url, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) }, signal: AbortSignal.timeout(init.timeout ?? 60000) })

  async function upload(audio: Audio, i: number) {
    const start = await send(`${UPLOAD}?uploadType=resumable`, {
      method: 'POST',
      headers: { 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start', 'Content-Type': 'application/json',
        'X-Goog-Upload-Header-Content-Length': String(audio.bytes.byteLength), 'X-Goog-Upload-Header-Content-Type': audio.mimeType },
      body: JSON.stringify({ file: { display_name: `consultation-part-${i + 1}` } }),
    })
    const target = start.headers.get('x-goog-upload-url')
    if (!start.ok || !target) throw new Error(`upload: ${start.status}`)
    const done = await send(target, {
      method: 'POST',
      headers: { 'X-Goog-Upload-Command': 'upload, finalize', 'X-Goog-Upload-Offset': '0' },
      body: audio.bytes, timeout: 120000,
    })
    const file = (await done.json().catch(() => null) as { file?: { name?: string; uri?: string; mimeType?: string; state?: string } } | null)?.file
    if (!done.ok || !file?.name || !file.uri) throw new Error(`upload: ${done.status}`)
    // Audio is usually ready at once; wait a little if Google is still processing it.
    let state = file.state
    for (let n = 0; state === 'PROCESSING' && n < 10; n++) {
      await new Promise(r => setTimeout(r, 2000))
      state = (await (await send(`${FILES}/${file.name.replace(/^files\//, '')}`, { method: 'GET' })).json().catch(() => null) as { state?: string } | null)?.state
    }
    if (state && state !== 'ACTIVE') throw new Error(`upload: ${state}`)
    return { name: file.name, uri: file.uri, mimeType: file.mimeType ?? audio.mimeType }
  }

  return async (audio: Audio[], lang: 'en' | 'ar'): Promise<Heard> => {
    const files: { name: string; uri: string; mimeType: string }[] = []
    try {
      for (const [i, a] of audio.entries()) files.push(await upload(a, i))
      const body = JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [
          ...files.map(f => ({ fileData: { mimeType: f.mimeType, fileUri: f.uri } })),
          { text: `Transcribe the call as spoken, then write the summary in ${lang === 'ar' ? 'Arabic' : 'English'}.` },
        ] }],
        generationConfig: { responseMimeType: 'application/json', responseJsonSchema: SCHEMA, maxOutputTokens: 65536 },
      })

      let lastError = 'no_model'
      for (const model of options.models) {
        let res: Response
        let data: { promptFeedback?: { blockReason?: string }; candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[] }
        try {
          res = await send(`${API}/${encodeURIComponent(model)}:generateContent`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body, timeout: options.timeoutMs ?? 90000,
          })
          // A bad request or a bad key fails the same way on every model, so stop there.
          if (res.status === 400 || res.status === 401 || res.status === 403) throw new Error(`${model}: ${res.status}`)
          // Overloaded (429/503), retired (404) or broken: the next model may still answer.
          if (!res.ok) { lastError = `${model}: ${res.status}`; continue }
          // The timeout also covers reading the body, so a stalled stream lands in the catch below.
          data = await res.json()
        } catch (e) {
          if (e instanceof Error && /: (400|401|403)$/.test(e.message)) throw e
          lastError = `${model}: timeout`
          continue
        }
        if (data.promptFeedback?.blockReason) throw new Error(`${model}: blocked ${data.promptFeedback.blockReason}`)
        const candidate = data.candidates?.[0]
        if (candidate?.finishReason && candidate.finishReason !== 'STOP') throw new Error(`${model}: ${candidate.finishReason}`)
        const text = candidate?.content?.parts?.map(p => p.text ?? '').join('') ?? ''
        if (!text) throw new Error(`${model}: empty`)
        const parsed = JSON.parse(text) as Record<string, unknown>
        if (typeof parsed.transcript !== 'string' || typeof parsed.overview !== 'string' || !isPointList(parsed.keyPoints)
          || !isPointList(parsed.agreements) || !isPointList(parsed.nextSteps)) throw new Error(`${model}: bad_shape`)
        const heard = normalizeForMatch(parsed.transcript)
        let dropped = 0
        const keep = (list: Point[]) => {
          const backed = list.filter(p => p.text.trim() && quoteIsInTranscript(p.quote, heard))
          dropped += list.length - backed.length
          return backed.map(p => p.text.trim())
        }
        const result: Heard = { transcript: parsed.transcript, overview: parsed.overview.trim(), keyPoints: keep(parsed.keyPoints),
          agreements: keep(parsed.agreements), nextSteps: keep(parsed.nextSteps), lang, dropped }
        // Nothing it said could be found in the call: the overview would be just as made up.
        if (!result.keyPoints.length) throw new Error(`${model}: ungrounded`)
        return result
      }
      throw new Error(lastError)
    } finally {
      // The recording should not outlive the summary on Google's side.
      for (const f of files) await send(`${FILES}/${f.name.replace(/^files\//, '')}`, { method: 'DELETE', timeout: 15000 }).catch(() => undefined)
    }
  }
}
