import type { ReactNode } from 'react'
import logo from '../../../assets/mg-logo-white.webp'
import type { Booking, L10n, Lang, MeetingSummary } from '../../../domain/types'
import { formatInZone } from '../../../domain/time'
import type { AssessmentResult, Tone } from '../../../assessment/evaluate'
import { PAGE_WIDTH } from './downloadPdf'

// The MG letterhead for documents the client keeps: the meeting summary and the file assessment.
// Laid out at A4 width and turned into a PDF by downloadDocument; every `data-pdf-block` stays on one page.

const words = {
  en: {
    summary: 'Consultation summary', summaryTitle: 'Your consultation, in summary', assessment: 'File assessment', assessmentTitle: 'Your file assessment',
    client: 'Client', consultant: 'Consultant', date: 'Date', programme: 'Programme', reference: 'Reference',
    overview: 'Overview', discussed: 'What we discussed', agreed: 'What we agreed', next: 'Next steps',
    owner: { client: 'You', mg: 'MG' }, result: 'Your result', breakdown: 'How it adds up', answers: 'What you told us', attention: 'Worth strengthening',
    prepared: 'Prepared by', firm: 'MG International Visa Consultancy', confidential: 'Private and confidential — prepared for',
    disclaimer: 'This document records our conversation and the information you gave us. It is not a guarantee of any visa decision, which rests with the embassy alone.',
    contact: 'mg-visa.com  ·  Info@mg-visa.com  ·  Hotline 17621',
  },
  ar: {
    summary: 'ملخص الاستشارة', summaryTitle: 'ملخص استشارتك', assessment: 'تقييم الملف', assessmentTitle: 'تقييم ملفك',
    client: 'العميل', consultant: 'المستشار', date: 'التاريخ', programme: 'البرنامج', reference: 'المرجع',
    overview: 'نظرة عامة', discussed: 'ما ناقشناه', agreed: 'ما اتفقنا عليه', next: 'الخطوات القادمة',
    owner: { client: 'أنت', mg: 'MG' }, result: 'نتيجتك', breakdown: 'تفاصيل النقاط', answers: 'ما أخبرتنا به', attention: 'نقاط تحتاج إلى تقوية',
    prepared: 'أعدّه', firm: 'MG الدولية للاستشارات', confidential: 'خاص وسري — أُعدّ من أجل',
    disclaimer: 'يوثق هذا المستند حديثنا والمعلومات التي قدمتها لنا، ولا يُعد ضمانًا لأي قرار بشأن التأشيرة، فالقرار للسفارة وحدها.',
    contact: 'mg-visa.com  ·  Info@mg-visa.com  ·  الخط الساخن 17621',
  },
} as const
export const docWords = (lang: Lang) => words[lang]

const tones: Record<Tone, string> = { ok: '#15803d', warn: '#b45309', bad: '#b91c1c' }

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section data-pdf-block className="px-14 pt-9">
      <div className="mb-4 flex items-baseline gap-3">
        <span dir="ltr" className="font-display text-[13px] font-semibold tracking-[0.2em] text-gold-deep">{String(n).padStart(2, '0')}</span>
        <h2 className="font-display text-[21px] font-semibold text-ink">{title}</h2>
        <span className="mb-1 h-px flex-1 self-end bg-gradient-to-r from-gold/60 to-transparent rtl:bg-gradient-to-l" />
      </div>
      {children}
    </section>
  )
}

function Letterhead({ lang, eyebrow, title, reference, facts }: { lang: Lang; eyebrow: string; title: string; reference: string; facts: [string, string][] }) {
  const w = words[lang]
  return (
    <>
      <header data-pdf-block className="relative overflow-hidden bg-slate-deep px-14 pb-10 pt-11 text-white">
        {/* Fine gold lines in the corner: quiet, like a banknote guilloche. */}
        <svg className="absolute -end-10 -top-10 opacity-[0.18]" width="360" height="360" viewBox="0 0 360 360" aria-hidden>
          {Array.from({ length: 9 }, (_, i) => <circle key={i} cx="300" cy="60" r={40 + i * 26} fill="none" stroke="#c9a86a" strokeWidth="1" />)}
        </svg>
        <div className="relative flex items-start justify-between gap-6">
          <img src={logo} alt="MG" className="h-14 w-auto" />
          <div className="text-end">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gold">{eyebrow}</p>
            <p dir="ltr" className="mt-1.5 font-mono text-[12px] tracking-wider text-mist">{w.reference} · {reference}</p>
          </div>
        </div>
        <h1 className="relative mt-12 font-display text-[38px] font-semibold leading-tight">{title}</h1>
      </header>
      <div className="h-[3px] bg-gradient-to-r from-gold-deep via-gold to-gold-deep" />
      <div data-pdf-block className="grid grid-cols-4 gap-px border-b border-line bg-line">
        {facts.map(([k, v]) => (
          <div key={k} className="bg-paper px-6 py-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{k}</p>
            <p className="mt-1.5 text-[14px] font-semibold leading-snug text-ink" dir="auto">{v}</p>
          </div>
        ))}
      </div>
    </>
  )
}

function Closing({ lang, consultant, clientName }: { lang: Lang; consultant: string; clientName: string }) {
  const w = words[lang]
  return (
    <footer data-pdf-block className="px-14 pb-16 pt-12">
      <div className="flex items-end justify-between gap-8 border-t border-line pt-8">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{w.prepared}</p>
          <p className="mt-2 font-display text-[19px] font-semibold text-ink">{consultant}</p>
          <p className="text-[13px] text-slate">{w.firm}</p>
        </div>
        <div className="max-w-[300px] text-end text-[11px] leading-relaxed text-muted">
          <p>{w.confidential} <span dir="auto">{clientName}</span></p>
          <p dir="ltr" className="mt-1">{w.contact}</p>
        </div>
      </div>
      <p className="mt-6 rounded-xl bg-paper px-5 py-4 text-[11.5px] leading-relaxed text-slate ring-1 ring-line">{w.disclaimer}</p>
    </footer>
  )
}

const OWNER = /^\s*(client|you|العميل|أنت|mg|consultant|المستشار)\s*[:：]\s*/i
/** "Client: send the statement" → owner and action. */
export function splitStep(step: string): { owner: 'client' | 'mg' | null; action: string } {
  const m = OWNER.exec(step)
  if (!m) return { owner: null, action: step.trim() }
  const who = m[1].toLowerCase()
  return { owner: ['client', 'you', 'العميل', 'أنت'].includes(who) ? 'client' : 'mg', action: step.slice(m[0].length).trim() }
}

interface Common { booking: Booking; consultant: L10n; programme: L10n }

/** The written summary of an online consultation, as the client downloads it. */
export function SummaryDocument({ booking, consultant, programme, summary }: Common & { summary: MeetingSummary }) {
  const lang = summary.lang
  const w = words[lang]
  let n = 0
  return (
    <article dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} style={{ width: PAGE_WIDTH }} className="bg-white font-sans text-ink">
      <Letterhead lang={lang} eyebrow={w.summary} title={w.summaryTitle} reference={booking.reference} facts={[
        [w.client, booking.customer.name], [w.consultant, consultant[lang]],
        [w.date, formatInZone(booking.startIso, booking.tz, lang, 'date')], [w.programme, programme[lang]],
      ]} />
      <Section n={++n} title={w.overview}>
        <p className="text-[15.5px] leading-[1.75] text-slate" dir="auto">{summary.overview}</p>
      </Section>
      {summary.keyPoints.length > 0 && (
        <Section n={++n} title={w.discussed}>
          <ol className="grid gap-3">
            {summary.keyPoints.map((p, i) => (
              <li key={i} data-pdf-block className="flex gap-4 text-[14.5px] leading-relaxed text-slate">
                <span dir="ltr" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gold-soft font-display text-[13px] font-semibold text-gold-deep">{i + 1}</span>
                <span className="pt-0.5" dir="auto">{p}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}
      {summary.agreements.length > 0 && (
        <Section n={++n} title={w.agreed}>
          <ul className="grid gap-2.5 rounded-2xl bg-paper p-6 ring-1 ring-line">
            {summary.agreements.map((a, i) => (
              <li key={i} data-pdf-block className="flex gap-3.5 text-[14.5px] leading-relaxed text-ink">
                <svg width="20" height="20" viewBox="0 0 24 24" className="mt-0.5 shrink-0" aria-hidden><circle cx="12" cy="12" r="11" fill="#283840" /><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#c9a86a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span dir="auto">{a}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {summary.nextSteps.length > 0 && (
        <Section n={++n} title={w.next}>
          <div className="overflow-hidden rounded-2xl ring-1 ring-line">
            {summary.nextSteps.map((s, i) => {
              const { owner, action } = splitStep(s)
              return (
                <div key={i} data-pdf-block className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-0 odd:bg-white even:bg-paper/60">
                  <span dir="ltr" className="w-6 shrink-0 font-display text-[15px] font-semibold text-gold-deep">{i + 1}.</span>
                  <span className="flex-1 text-[14.5px] leading-relaxed text-ink" dir="auto">{action}</span>
                  {owner && (
                    <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${owner === 'client' ? 'bg-gold text-ink' : 'bg-slate-deep text-white'}`}>
                      {w.owner[owner]}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </Section>
      )}
      <Closing lang={lang} consultant={consultant[lang]} clientName={booking.customer.name} />
    </article>
  )
}

/** The client's file assessment, in the client's language. No staff notes: the same content as their report page. */
export function AssessmentDocument({ booking, consultant, programme, result: r, lang }: Common & { result: AssessmentResult; lang: Lang }) {
  const w = words[lang]
  const color = tones[r.verdict.tone]
  let n = 0
  return (
    <article dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} style={{ width: PAGE_WIDTH }} className="bg-white font-sans text-ink">
      <Letterhead lang={lang} eyebrow={w.assessment} title={w.assessmentTitle} reference={booking.reference} facts={[
        [w.client, booking.customer.name], [w.consultant, consultant[lang]],
        [w.date, formatInZone(booking.startIso, booking.tz, lang, 'date')], [w.programme, programme[lang]],
      ]} />
      <Section n={++n} title={w.result}>
        <div className="flex items-center gap-8 rounded-2xl bg-paper p-7 ring-1 ring-line">
          {r.score !== null && (
            <p dir="ltr" className="font-display leading-none text-ink">
              <span className="text-[64px] font-semibold">{r.score}</span>
              {r.max !== null && <span className="ms-1 text-[22px] text-muted">/ {r.max}</span>}
            </p>
          )}
          <div className="min-w-0 flex-1">
            <span className="inline-block rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-white" style={{ background: color }}>{r.verdict.label[lang]}</span>
            <p className="mt-3 text-[13.5px] leading-relaxed text-slate">{r.title[lang]}</p>
            {r.note && <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{r.note[lang]}</p>}
          </div>
        </div>
      </Section>
      {r.rows.length > 0 && (
        <Section n={++n} title={w.breakdown}>
          <div className="grid gap-3">
            {r.rows.map((row, i) => {
              const pct = row.max ? Math.max(0, Math.min(100, (row.points / row.max) * 100)) : null
              return (
                <div key={i} className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1.5">
                  <span className="text-[13.5px] text-slate">{row.label[lang]}</span>
                  <span dir="ltr" className={`text-[13.5px] font-semibold tabular-nums ${row.points < 0 ? 'text-bad' : 'text-ink'}`}>{row.points}{row.max !== undefined ? ` / ${row.max}` : ''}</span>
                  {pct !== null && <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-gradient-to-r from-gold-deep to-gold" style={{ width: `${pct}%` }} /></span>}
                </div>
              )
            })}
          </div>
        </Section>
      )}
      {r.issues.length > 0 && (
        <Section n={++n} title={w.attention}>
          <ul dir="ltr" className="grid list-disc gap-1.5 ps-5 text-start text-[13.5px] leading-relaxed text-slate">{r.issues.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </Section>
      )}
      <Section n={++n} title={w.answers}>
        <dl className="grid grid-cols-2 gap-3">
          {r.answers.map((a, i) => (
            <div key={i} data-pdf-block className="rounded-xl bg-paper px-4 py-3 ring-1 ring-line">
              <dt className="text-[11.5px] leading-snug text-muted">{a.question[lang]}</dt>
              <dd className="mt-1 text-[13.5px] font-semibold text-ink">{typeof a.answer === 'string' ? <bdi dir="ltr">{a.answer}</bdi> : a.answer[lang]}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <Closing lang={lang} consultant={consultant[lang]} clientName={booking.customer.name} />
    </article>
  )
}
