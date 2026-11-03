import type { Booking } from '../../../domain/types'
import type { ConsultationRecord } from '../../../store/useAppStore'
import type { AssessmentResult } from '../../../assessment/evaluate'
import type { ClientReportProps, ReportRow } from '../../../assessment/report/ClientReport'
import { getConsultant } from '../../../store/actions'
import { branchById } from '../../../config/branches'
import { programName } from '../../../config/programs'
import { formatInZone } from '../../../domain/time'
import { translate } from '../../../i18n'

const toneColor = { ok: '#15803d', warn: '#b45309', bad: '#b91c1c' } as const
const outcomeText = (o: ConsultationRecord['outcome']) => translate('en', `staff.consultant.outcomes.${o}`)

/** File name the browser offers when saving the PDF. Safe characters only. */
export const reportFileName = (b: Booking) => `MG-Consultation-${b.reference}-${b.customer.name}`.replace(/[^\p{L}\p{N}\- ]+/gu, '').replace(/\s+/g, '-').slice(0, 90)

/**
 * The consultant's one-document summary: client and appointment details, the file assessment from MG's Visa File
 * Strength Calculator rules, and the consultant's notes and outcome. Same A4 layout as the calculator's report.
 * Internal document: it carries the score, so it is never shown to or sent to the client by the app.
 */
export function buildConsultationReport(b: Booking, record: ConsultationRecord, r: AssessmentResult | null, issued = new Date()): ClientReportProps {
  const consultant = getConsultant(b.consultantId)
  const branch = branchById(b.branchId)
  const program = b.customer.program ? programName(b.customer.program).en : 'Not stated'
  const when = `${formatInZone(b.startIso, b.tz, 'en', 'date')} · ${formatInZone(b.startIso, b.tz, 'en', 'time')}`

  const facts = [
    { label: 'Client name', value: b.customer.name },
    { label: 'Phone', value: b.customer.phone },
    ...(b.customer.email ? [{ label: 'Email', value: b.customer.email }] : []),
    { label: 'Program', value: program },
    { label: 'Consultation language', value: b.customer.consultationLang === 'ar' ? 'Arabic' : 'English' },
    ...(b.salesName ? [{ label: 'Sales', value: b.salesName }] : []),
  ]

  const appointment = {
    title: 'Appointment',
    facts: [
      { label: 'Booking reference', value: b.reference },
      { label: 'Consultant', value: consultant.name.en },
      { label: 'Date and time', value: `${when} (${b.tz === 'Asia/Dubai' ? 'Dubai' : 'Cairo'} time)` },
      { label: 'Format', value: b.format === 'online' ? 'Online' : `In person — ${branch.name.en} branch` },
      { label: 'Status', value: translate('en', `status.${b.status}`) },
      ...(b.customer.note ? [{ label: 'Client note', value: b.customer.note }] : []),
    ],
  }
  const notes = {
    title: 'Consultant notes',
    facts: [{ label: 'Application outcome', value: outcomeText(record.outcome) }],
    notes: [record.notes.trim() || 'No notes written.'],
    notesAreText: true,
  }

  const common = {
    kind: 'consultation',
    panelsFirst: true,
    documentType: 'Consultation summary',
    title: 'Consultation summary',
    clientName: b.customer.name,
    date: issued.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    reference: b.reference,
    facts,
  }

  if (!r) {
    return {
      ...common,
      programme: `${program} consultation`,
      score: null,
      status: { label: 'No file assessment', color: '#5b6b7e', description: 'This program has no assessment questions, or the client booked before they were added.' },
      sections: [],
      panels: [appointment, notes],
      notes: ['Prepared from the booking details and the consultant’s record. Internal document — not for the client.'],
    }
  }

  const answers: ReportRow[] = r.answers.map(a => ({
    label: a.question.en,
    claim: typeof a.answer === 'string' ? a.answer : a.answer.en,
    earned: null,
    pointsText: '',
  }))
  const points: ReportRow[] = r.rows.map(row => ({ label: row.label.en, claim: '', earned: row.points, max: row.max }))
  const scoreContext = r.max ? `out of ${r.max.toLocaleString('en-US')}` : r.threshold !== null ? `minimum ${r.threshold}` : undefined

  return {
    ...common,
    programme: r.title.en,
    score: r.score,
    scoreSuffix: r.max === 100 ? '%' : '',
    scoreContext: r.max === 100 ? 'file strength' : scoreContext,
    status: { label: r.verdict.label.en, color: toneColor[r.verdict.tone], description: r.complete ? 'Scored from the client’s booking-form answers with MG’s Visa File Strength Calculator rules.' : 'Some questions were not answered, so the score may understate the file.' },
    attention: r.issues,
    sections: [
      ...(points.length ? [{ key: 'A', title: 'Points breakdown', caption: 'Each factor as scored by the calculator.', rows: points, hideFromComposition: true }] : []),
      { key: points.length ? 'B' : 'A', title: 'Client answers', caption: 'What the client answered when booking.', rows: answers, hideFromComposition: true },
    ],
    composition: points.filter(p => p.max !== undefined).map(p => ({ label: p.label, earned: Math.max(0, p.earned ?? 0), max: p.max! })),
    panels: [appointment, notes],
    notes: [
      'Internal document for MG staff. The client is never shown this score.',
      'Self-reported answers, not verified documents. Historical outcomes do not guarantee approval.',
      ...(r.note ? [r.note.en] : []),
    ],
  }
}
