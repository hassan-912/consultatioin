// Drafts the meeting summary with Google Gemini over plain REST (no SDK, so it runs the same in Deno and in tests).
// The API key goes in a header, never in the URL, so it can't end up in a log line.

import type { Summary } from './handler.ts'

const API = 'https://generativelanguage.googleapis.com/v1beta/models'

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

const SYSTEM = `You write the client-facing summary of a visa consultation between a client and their MG International
consultant. The client keeps it as their record of the meeting, so it must be accurate and professional.
Use only what was said in the transcript: never invent figures, dates, documents or promises. If something was left
open, say so rather than guessing. Never state or imply that a visa will be approved. Do not include any internal
scores or points. Write as MG speaking to the client ("we", "you"; in Arabic «نحن», «أنت/حضرتك»).

${STYLE}`

const SCHEMA = {
  type: 'object',
  required: ['overview', 'keyPoints', 'agreements', 'nextSteps'],
  properties: {
    overview: { type: 'string', description: 'Two or three sentences: why the client came and where things stand now.' },
    keyPoints: { type: 'array', items: { type: 'string' }, description: 'The important points discussed, 3 to 8 items, one sentence each.' },
    agreements: { type: 'array', items: { type: 'string' }, description: 'What the client and MG agreed on. Empty if nothing was agreed.' },
    nextSteps: { type: 'array', items: { type: 'string' }, description: 'Concrete next actions. Each starts with who does it, e.g. "Client: …" or "MG: …" (in Arabic "العميل: …" or "MG: …"), and includes any deadline that was said.' },
  },
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
 * hosted project sends client transcripts to Gemini only after the owner says which terms apply: GEMINI_BILLING=paid,
 * or GEMINI_BILLING=free to accept the free-tier terms knowingly (the owner's decision of 2026-11-19).
 * Without the setting, only the local stack may call Gemini.
 */
export function geminiAllowed(supabaseUrl: string, billing: string | undefined): boolean {
  if (billing === 'paid' || billing === 'free') return true
  const host = new URL(supabaseUrl).hostname
  // `supabase start` serves functions with SUPABASE_URL=http://kong:8000.
  return host === 'kong' || host === 'localhost' || host === '127.0.0.1' || host === 'host.docker.internal'
}

const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every(s => typeof s === 'string')

export function geminiSummarizer(options: GeminiOptions) {
  return async (transcript: string, lang: 'en' | 'ar'): Promise<Summary> => {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{
        text: `Write the summary in ${lang === 'ar' ? 'Arabic' : 'English'}.\n\n<transcript>\n${transcript}\n</transcript>`,
      }] }],
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: SCHEMA },
    })

    let lastError = 'no_model'
    for (const model of options.models) {
      let res: Response
      let data: { promptFeedback?: { blockReason?: string }; candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[] }
      try {
        res = await options.fetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': options.apiKey },
          body,
          signal: AbortSignal.timeout(options.timeoutMs ?? 90000),
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
      if (typeof parsed.overview !== 'string' || !isStringList(parsed.keyPoints)
        || !isStringList(parsed.agreements) || !isStringList(parsed.nextSteps)) throw new Error(`${model}: bad_shape`)
      return { overview: parsed.overview, keyPoints: parsed.keyPoints, agreements: parsed.agreements, nextSteps: parsed.nextSteps, lang }
    }
    throw new Error(lastError)
  }
}
