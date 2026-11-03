import { useMemo, useState } from 'react'
import { useT } from '../i18n'
import { useStaffAssessments } from '../data/hooks'
import { BottomSheet } from '../components/widgets'
import { Notice } from '../components/ui'
import { Icon } from '../components/Icon'
import { evaluate, ringValue, type AssessmentResult, type Tone } from './evaluate'
import { useEgpRates } from './useEgpRates'

const toneClass: Record<Tone, string> = { ok: 'bg-ok-soft text-ok', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad' }

function ScoreLine({ r }: { r: AssessmentResult }) {
  const { t } = useT()
  if (r.score === null) return <span className="text-muted">{t('assessment.noScale')}</span>
  return (
    <span dir="ltr" className="font-display font-semibold text-ink">
      {r.score}{r.max ? ` / ${r.max}` : ''}
      {r.threshold !== null && <span className="ms-1 font-sans text-xs font-normal text-muted">({t(r.max === null && r.title.en.startsWith('Australia') ? 'assessment.minimum' : 'assessment.threshold', { n: r.threshold })})</span>}
    </span>
  )
}

/**
 * Under the customer's name and contact details: the booking-form assessment scored with MG's calculator.
 * Renders nothing unless the viewer may see it (admin, or the booking's consultant) and answers exist.
 */
/** The scored assessment for a booking, or null when there is none or the viewer may not see it. */
export function useAssessmentResult(bookingId: string): AssessmentResult | null {
  const stored = useStaffAssessments()[bookingId]
  const { rates } = useEgpRates(stored?.program === 'job-seeking')
  return useMemo(() => (stored ? evaluate(stored, rates) : null), [stored, rates])
}

const ringColor: Record<Tone, string> = { ok: 'var(--color-ok)', warn: 'var(--color-warn)', bad: 'var(--color-bad)' }

/** Circular score badge (staff only). Opens the full assessment when clicked. */
export function AssessmentRing({ bookingId, size = 64 }: { bookingId: string; size?: number }) {
  const { t, l } = useT()
  const r = useAssessmentResult(bookingId)
  const [open, setOpen] = useState(false)
  if (!r) return null
  const { fill, text, unit } = ringValue(r)
  const stroke = 6, radius = (size - stroke) / 2, length = 2 * Math.PI * radius
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="group relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/40"
        aria-label={`${t('assessment.staffTitle')}: ${l(r.title)} ${text} ${unit} – ${l(r.verdict.label)}. ${t('assessment.viewFull')}`}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={ringColor[r.verdict.tone]} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={length} strokeDashoffset={length * (1 - fill)} className="transition-[stroke-dashoffset] duration-700" />
        </svg>
        <span dir="ltr" className="absolute inset-0 grid place-items-center text-center leading-none">
          <span>
            <span className="block font-display text-[15px] font-semibold text-ink">{text}</span>
            {unit && <span className="block text-[9px] font-semibold uppercase tracking-wide text-muted">{unit}</span>}
          </span>
        </span>
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={`${t('assessment.staffTitle')} · ${l(r.title)}`}>
        <AssessmentReport r={r} />
      </BottomSheet>
    </>
  )
}

export function StaffAssessment({ bookingId }: { bookingId: string }) {
  const { t, l } = useT()
  const r = useAssessmentResult(bookingId)
  const [open, setOpen] = useState(false)
  if (!r) return null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-paper px-3 py-2 text-sm ring-1 ring-line">
      <span className="inline-flex items-center gap-1.5 font-semibold text-slate"><Icon name="shield" size={14} />{t('assessment.staffTitle')}</span>
      <span className="text-muted">{l(r.title)}:</span>
      <ScoreLine r={r} />
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${toneClass[r.verdict.tone]}`}>{l(r.verdict.label)}</span>
      <button type="button" onClick={() => setOpen(true)} className="ms-auto min-h-9 font-semibold text-navy underline underline-offset-2">{t('assessment.viewFull')}</button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={`${t('assessment.staffTitle')} · ${l(r.title)}`}>
        <AssessmentReport r={r} />
      </BottomSheet>
    </div>
  )
}

export function AssessmentReport({ r }: { r: AssessmentResult }) {
  const { t, l } = useT()
  return (
    <div className="grid gap-5 text-sm">
      <p className="text-xs text-muted">{t('assessment.staffOnly')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-3xl"><ScoreLine r={r} /></span>
        <span className={`rounded-full px-2.5 py-1 text-sm font-semibold ${toneClass[r.verdict.tone]}`}>{l(r.verdict.label)}</span>
      </div>
      {!r.complete && <Notice tone="warn">{t('assessment.incomplete')}</Notice>}
      {r.note && <Notice tone="info">{l(r.note)}</Notice>}
      {r.rows.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold text-ink">{t('assessment.breakdown')}</h3>
          <ul className="grid gap-1.5">
            {r.rows.map((row, i) => (
              <li key={i} className="flex items-center justify-between gap-3 border-b border-line/60 pb-1.5 last:border-0">
                <span className="text-slate">{l(row.label)}</span>
                <span dir="ltr" className={`font-semibold tabular ${row.points < 0 ? 'text-bad' : 'text-ink'}`}>{row.points}{row.max !== undefined ? ` / ${row.max}` : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {r.issues.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold text-ink">{t('assessment.issues')}</h3>
          <ul dir="ltr" className="grid list-disc gap-1 ps-5 text-start text-slate">{r.issues.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </section>
      )}
      <section>
        <h3 className="mb-2 font-semibold text-ink">{t('assessment.answers')}</h3>
        <dl className="grid gap-2">
          {r.answers.map((a, i) => (
            <div key={i} className="rounded-lg bg-paper px-3 py-2">
              <dt className="text-xs text-muted">{l(a.question)}</dt>
              <dd className="font-semibold text-ink">{typeof a.answer === 'string' ? <bdi dir="ltr">{a.answer}</bdi> : l(a.answer)}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
