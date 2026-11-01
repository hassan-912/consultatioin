import { useT } from '../../../i18n'
import type { CustomerDetails } from '../../../domain/types'
import { programs } from '../../../config/programs'
import { SelectField, Segmented, TextArea, TextField } from '../../../components/fields'
import { Button, Notice } from '../../../components/ui'
import type { DetailErrors } from '../shared'
import { AssessmentQuestions } from '../../../assessment/AssessmentQuestions'
import { isAssessed, type StoredAssessment } from '../../../assessment/questions'

export function DetailsStep({ value, onChange, errors, showSummary, onSubmit, assessment, onAssessment, assessmentIncomplete = false }: {
  value: CustomerDetails; onChange: (p: Partial<CustomerDetails>) => void; errors: DetailErrors; showSummary: boolean; onSubmit: () => void
  assessment?: StoredAssessment | null; onAssessment?: (a: StoredAssessment) => void; assessmentIncomplete?: boolean
}) {
  const { t, l } = useT()
  const err = (k: keyof DetailErrors) => (errors[k] ? t(errors[k]!) : undefined)
  return (
    <form
      noValidate
      onSubmit={e => {
        e.preventDefault()
        onSubmit()
      }}
      className="grid grid-cols-[minmax(0,1fr)] gap-5"
    >
      <div>
        <h2 className="text-2xl font-semibold text-ink">{t('booking.detailsTitle')}</h2>
        <p className="mt-1 text-sm text-muted">{t('booking.detailsHint')}</p>
      </div>
      {showSummary && (Object.keys(errors).length > 0 || assessmentIncomplete) && <Notice tone="bad">{t('validation.fixErrors')}</Notice>}
      <TextField label={t('booking.name')} autoComplete="name" value={value.name} onChange={e => onChange({ name: e.target.value })} error={err('name')} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label={t('booking.phone')}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          className="text-start"
          placeholder="+20 100 123 4567"
          value={value.phone}
          onChange={e => onChange({ phone: e.target.value })}
          hint={t('booking.phoneHint')}
          error={err('phone')}
        />
        <TextField
          label={t('booking.emailLabel')}
          type="email"
          inputMode="email"
          autoComplete="email"
          dir="ltr"
          value={value.email}
          onChange={e => onChange({ email: e.target.value })}
          hint={t('booking.emailHint')}
          error={err('email')}
        />
      </div>
      <Segmented
        name="channel"
        label={t('booking.channel')}
        value={value.channel}
        onChange={channel => onChange({ channel })}
        options={[
          { value: 'whatsapp', label: t('booking.channelWhatsapp') },
          { value: 'email', label: t('booking.channelEmail') },
        ]}
      />
      <SelectField label={t('booking.program')} value={value.program} onChange={e => onChange({ program: e.target.value as CustomerDetails['program'] })} error={err('program')}>
        <option value="">{t('booking.programPick')}</option>
        {programs.map(p => <option key={p.id} value={p.id}>{l(p.name)}</option>)}
      </SelectField>
      {isAssessed(value.program) && onAssessment && (
        <AssessmentQuestions
          program={value.program}
          answers={assessment?.program === value.program ? assessment.answers : {}}
          onChange={answers => onAssessment({ program: value.program as StoredAssessment['program'], answers })}
          showErrors={showSummary}
        />
      )}
      <TextArea label={t('booking.note')} maxLength={300} value={value.note} onChange={e => onChange({ note: e.target.value })} hint={t('booking.noteHint')} error={err('note')} />
      <p className="text-xs text-muted">{t('booking.privacy')}</p>
      <Button type="submit" size="lg" className="w-full sm:w-auto sm:justify-self-start">{t('booking.reviewCta')}</Button>
    </form>
  )
}
