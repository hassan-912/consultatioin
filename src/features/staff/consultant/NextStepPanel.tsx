import { useState } from 'react'
import { useT } from '../../../i18n'
import { repo } from '../../../data'
import { reportActionError } from '../../../data/feedback'
import { programs } from '../../../config/programs'
import type { Booking, ProgramId } from '../../../domain/types'
import type { ConsultationRecord, NextStep } from '../../../store/useAppStore'
import { Button } from '../../../components/ui'
import { SelectField, TextArea } from '../../../components/fields'
import { Icon, type IconName } from '../../../components/Icon'

const STEPS: { id: NextStep; icon: IconName; tone: string }[] = [
  { id: 'contract', icon: 'check', tone: 'border-ok bg-ok-soft text-ok' },
  { id: 'refund', icon: 'card', tone: 'border-bad bg-bad-soft text-bad' },
  { id: 'thinking', icon: 'clock', tone: 'border-gold bg-gold-soft text-gold-deep' },
]

/**
 * After the consultation: will the client sign the contract, ask for a refund, or think about it, and which program
 * the consultant recommends. Contract and refund are shown to finance; "thinking" becomes the consultant's follow-up.
 */
export function NextStepPanel({ b, record }: { b: Booking; record?: ConsultationRecord }) {
  const { t, l } = useT()
  const [step, setStep] = useState<NextStep | undefined>(record?.nextStep)
  const [program, setProgram] = useState<ProgramId | ''>(record?.recommendedProgram ?? b.customer.program ?? '')
  const [reason, setReason] = useState(record?.refundReason ?? '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  if (!['checked-in', 'completed'].includes(b.status)) return null
  const dirty = step !== record?.nextStep || (program || undefined) !== (record?.recommendedProgram ?? (b.customer.program || undefined))
    || (step === 'refund' && reason.trim() !== (record?.refundReason ?? ''))
  const needsReason = step === 'refund' && !reason.trim()

  const save = async () => {
    if (!step) return
    setBusy(true)
    if (needsReason) return
    try { await repo.saveNextStep(b.id, step, program || null, step === 'refund' ? reason.trim() : undefined); setSaved(true) }
    catch (e) { reportActionError(e) }
    finally { setBusy(false) }
  }

  return (
    <section aria-label={t('staff.nextStep.title')} className="mt-4 rounded-2xl bg-paper p-4 ring-1 ring-line">
      <h3 className="font-semibold text-ink">{t('staff.nextStep.title')}</h3>
      <p className="text-sm text-muted">{t('staff.nextStep.hint')}</p>
      <div role="radiogroup" aria-label={t('staff.nextStep.title')} className="mt-3 grid gap-2 sm:grid-cols-3">
        {STEPS.map(s => (
          <label key={s.id} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border-2 px-3 text-sm font-semibold has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-gold/40 ${
            step === s.id ? s.tone : 'border-line bg-white text-slate hover:border-mist'}`}>
            <input type="radio" name={`next-${b.id}`} className="sr-only" checked={step === s.id} onChange={() => { setStep(s.id); setSaved(false) }} />
            <Icon name={s.icon} size={16} />{t(`staff.nextStep.${s.id}`)}
          </label>
        ))}
      </div>
      {step === 'refund' && (
        <div className="mt-3">
          <TextArea label={t('staff.nextStep.refundReason')} hint={t('staff.nextStep.refundReasonHint')} required maxLength={500} rows={3} dir="auto"
            value={reason} onChange={e => { setReason(e.target.value); setSaved(false) }}
            error={needsReason ? t('staff.nextStep.refundReasonRequired') : undefined} />
        </div>
      )}
      <div className="mt-3 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <SelectField label={t('staff.nextStep.program')} hint={t('staff.nextStep.programHint')} value={program}
          onChange={e => { setProgram(e.target.value as ProgramId); setSaved(false) }}>
          {programs.map(p => <option key={p.id} value={p.id}>{l(p.name)}</option>)}
        </SelectField>
        <Button disabled={!step || busy || needsReason || (!dirty && !!record?.nextStep)} onClick={() => void save()}>
          <Icon name="check" size={16} />{t('staff.nextStep.save')}
        </Button>
      </div>
      {(saved || (!dirty && record?.nextStep)) && step && (
        <p role="status" className="mt-2 text-sm font-semibold text-ok">
          {saved ? `${t('staff.nextStep.saved')} — ` : ''}{t(step === 'thinking' ? 'staff.nextStep.toFollowUp' : 'staff.nextStep.toFinance')}
        </p>
      )}
    </section>
  )
}
