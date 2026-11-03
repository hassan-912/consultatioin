import { useState } from 'react'
import { repo } from '../../../data'
import { reportActionError } from '../../../data/feedback'
import type { Booking } from '../../../domain/types'
import type { ConsultationRecord, Outcome } from '../../../store/useAppStore'
import { useAssessmentResult } from '../../../assessment/StaffAssessment'
import { printReport, type ClientReportProps } from '../../../assessment/report/ClientReport'
import { buildConsultationReport, reportFileName } from './consultationReport'

export const isSubmitted = (r?: ConsultationRecord) => !!r && (r.notes.trim().length > 0 || r.outcome !== 'none')

/**
 * Notes and outcome being written for one booking, plus submit and the consultation summary PDF.
 * The PDF saves unsaved edits first so the printed notes always match what is stored.
 */
export function useRecordDraft(b: Booking, record?: ConsultationRecord) {
  const [notes, setNotesState] = useState(record?.notes ?? '')
  const [outcome, setOutcomeState] = useState<Outcome>(record?.outcome ?? 'none')
  const [busy, setBusy] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [report, setReport] = useState<ClientReportProps | null>(null)
  const result = useAssessmentResult(b.id)
  const submitted = isSubmitted(record)
  const dirty = notes !== (record?.notes ?? '') || outcome !== (record?.outcome ?? 'none')

  const save = async () => {
    setBusy(true)
    try { await repo.saveRecord(b.id, { notes, outcome }); setJustSaved(true); return true }
    catch (e) { reportActionError(e); return false }
    finally { setBusy(false) }
  }
  const pdf = async () => {
    if (dirty && !(await save())) return
    setReport(buildConsultationReport(b, { notes, outcome }, result))
    printReport('consultation', reportFileName(b))
  }
  const setNotes = (v: string) => { setNotesState(v); setJustSaved(false) }
  const setOutcome = (v: Outcome) => { setOutcomeState(v); setJustSaved(false) }

  return { notes, setNotes, outcome, setOutcome, busy, justSaved, submitted, dirty, report, save, pdf }
}
