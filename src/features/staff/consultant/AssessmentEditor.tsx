import { useState } from 'react'
import { useT } from '../../../i18n'
import { repo } from '../../../data'
import { reportActionError } from '../../../data/feedback'
import { useStaffAssessments } from '../../../data/hooks'
import { programName } from '../../../config/programs'
import { BottomSheet } from '../../../components/widgets'
import { SelectField } from '../../../components/fields'
import { Button } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { AssessmentQuestions } from '../../../assessment/AssessmentQuestions'
import type { AssessedProgram, Answers } from '../../../assessment/questions'

const PROGRAMS: AssessedProgram[] = ['tourism', 'immigration', 'job-seeking']

/** The consultant fills in (or updates) a client's assessment. Answers can be saved partly and finished later. */
export function AssessmentEditor({ bookingId }: { bookingId: string }) {
  const { t, l } = useT()
  const stored = useStaffAssessments()[bookingId]
  const [open, setOpen] = useState(false)
  const [program, setProgram] = useState<AssessedProgram | ''>('')
  const [answers, setAnswers] = useState<Answers>({})
  const [busy, setBusy] = useState(false)

  const start = () => {
    setProgram(stored?.program ?? '')
    setAnswers(stored?.answers ?? {})
    setOpen(true)
  }
  const save = async () => {
    if (!program) return
    setBusy(true)
    try { await repo.staffSaveAssessment(bookingId, { program, answers }); setOpen(false) } catch (e) { reportActionError(e) } finally { setBusy(false) }
  }

  return (
    <>
      <Button size="sm" variant={stored ? 'ghost' : 'primary'} onClick={start}>
        <Icon name="check" size={15} />{t(stored ? 'staff.assessment.edit' : 'staff.assessment.fill')}
      </Button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={t('assessment.staffTitle')}
        footer={<Button disabled={busy || !program} onClick={() => void save()}>{t('staff.assessment.save')}</Button>}>
        <div className="grid gap-5">
          <SelectField label={t('booking.program')} value={program} onChange={e => { setProgram(e.target.value as AssessedProgram | ''); setAnswers({}) }}>
            <option value="">{t('booking.programPick')}</option>
            {PROGRAMS.map(p => <option key={p} value={p}>{l(programName(p))}</option>)}
          </SelectField>
          {program && <AssessmentQuestions program={program} answers={answers} onChange={setAnswers} showErrors={false} />}
        </div>
      </BottomSheet>
    </>
  )
}
