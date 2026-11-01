import { useT } from '../i18n'
import { SelectField, TextField } from '../components/fields'
import { pruneAnswers, questionsFor, type Answers, type AssessedProgram, type Question } from './questions'

const chip = (active: boolean) =>
  `relative flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-gold/40 ${
    active ? 'border-slate bg-slate text-white' : 'border-line bg-white text-slate hover:border-mist'}`

/**
 * Customer-facing "about your situation" questions for assessed programs. Deliberately neutral: no score,
 * no points, no hint that answers are graded. The staff app scores them (src/assessment/evaluate.ts).
 */
export function AssessmentQuestions({ program, answers, onChange, showErrors }: {
  program: AssessedProgram; answers: Answers; onChange: (a: Answers) => void; showErrors: boolean
}) {
  const { t, l } = useT()
  const set = (id: string, v: string) => onChange(pruneAnswers(program, { ...answers, [id]: v }))
  const missing = (q: Question) => showErrors && !answers[q.id]?.trim()

  const field = (q: Question) => {
    const v = answers[q.id] ?? ''
    const error = missing(q) ? t('validation.required') : undefined
    if (q.kind === 'number' || q.kind === 'money') {
      return (
        <TextField key={q.id} label={l(q.label)} hint={q.hint ? l(q.hint) : undefined} error={error} dir="ltr" className="text-start"
          inputMode={q.kind === 'money' ? 'decimal' : 'numeric'} type={q.kind === 'number' ? 'number' : 'text'} min={q.min} max={q.max}
          value={v} onChange={e => set(q.id, e.target.value.replace(/[^\d.,]/g, ''))} />
      )
    }
    const options = q.kind === 'yesno' ? [{ value: 'yes', label: { en: 'Yes', ar: 'نعم' } }, { value: 'no', label: { en: 'No', ar: 'لا' } }] : q.options ?? []
    if (q.kind === 'choice' && options.length > 6) {
      return (
        <SelectField key={q.id} label={l(q.label)} error={error} value={v} onChange={e => set(q.id, e.target.value)}>
          <option value="">{t('assessment.pick')}</option>
          {options.map(o => <option key={o.value} value={o.value}>{l(o.label)}</option>)}
        </SelectField>
      )
    }
    const picked = q.kind === 'multi' ? v.split(',').filter(Boolean) : [v]
    const toggle = (value: string) => {
      if (q.kind !== 'multi') return set(q.id, value)
      const next = value === q.exclusive ? [value] : picked.includes(value) ? picked.filter(x => x !== value) : [...picked.filter(x => x !== q.exclusive), value]
      set(q.id, next.join(','))
    }
    return (
      <fieldset key={q.id} aria-invalid={!!error || undefined}>
        <legend className="mb-1.5 text-sm font-semibold text-ink">{l(q.label)}</legend>
        {q.kind === 'multi' && <p className="-mt-1 mb-1.5 text-xs text-muted">{t('assessment.pickAll')}</p>}
        <div className={`grid gap-2 ${q.kind === 'yesno' ? 'grid-cols-2 sm:max-w-xs' : 'sm:grid-cols-2'}`}>
          {options.map(o => {
            const active = picked.includes(o.value)
            return (
              <label key={o.value} className={chip(active)}>
                <input type={q.kind === 'multi' ? 'checkbox' : 'radio'} name={`as-${q.id}`} value={o.value} checked={active} onChange={() => toggle(o.value)} className="sr-only" />
                {l(o.label)}
              </label>
            )
          })}
        </div>
        {error && <p className="mt-1.5 text-sm font-semibold text-bad">{error}</p>}
      </fieldset>
    )
  }

  return (
    <section aria-labelledby="assessment-title" className="grid gap-5 rounded-2xl bg-paper p-4 ring-1 ring-line sm:p-5">
      <div>
        <h3 id="assessment-title" className="text-lg font-semibold text-ink">{t('assessment.title')}</h3>
        <p className="mt-0.5 text-sm text-muted">{t('assessment.hint')}</p>
      </div>
      {questionsFor(program, answers).map(field)}
    </section>
  )
}
