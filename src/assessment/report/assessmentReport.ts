import type { Booking } from '../../domain/types'
import type { AssessmentResult } from '../evaluate'
import type { ClientReportProps, ReportRow } from './ClientReport'
import { getConsultant } from '../../store/actions'

const toneColor = { ok: '#15803d', warn: '#b45309', bad: '#b91c1c' } as const

/** The client's own assessment, as their consultant filled it in. Shown to the client: no staff notes. */
export function buildAssessmentReport(b: Booking, r: AssessmentResult, issued = new Date()): ClientReportProps {
  const answers: ReportRow[] = r.answers.map(a => ({ label: a.question.en, claim: typeof a.answer === 'string' ? a.answer : a.answer.en, earned: null, pointsText: '' }))
  const points: ReportRow[] = r.rows.map(row => ({ label: row.label.en, claim: '', earned: row.points, max: row.max }))
  const scoreContext = r.max ? `out of ${r.max.toLocaleString('en-US')}` : r.threshold !== null ? `minimum ${r.threshold}` : undefined
  return {
    kind: 'assessment',
    documentType: 'Your assessment',
    title: 'Your assessment',
    programme: r.title.en,
    clientName: b.customer.name,
    date: issued.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    reference: b.reference,
    facts: [
      { label: 'Client name', value: b.customer.name },
      { label: 'Consultant', value: getConsultant(b.consultantId).name.en },
      { label: 'Booking reference', value: b.reference },
    ],
    score: r.score,
    scoreSuffix: r.max === 100 ? '%' : '',
    scoreContext: r.max === 100 ? 'file strength' : scoreContext,
    status: { label: r.verdict.label.en, color: toneColor[r.verdict.tone], description: r.complete ? 'Prepared by your consultant with MG’s Visa File Strength Calculator rules.' : 'Some questions are still open, so this may change after your consultant completes it.' },
    attention: r.issues,
    sections: [
      ...(points.length ? [{ key: 'A', title: 'Points breakdown', caption: 'Each factor as scored.', rows: points, hideFromComposition: true }] : []),
      { key: points.length ? 'B' : 'A', title: 'Your answers', caption: 'What your consultant recorded with you.', rows: answers, hideFromComposition: true },
    ],
    composition: points.filter(p => p.max !== undefined).map(p => ({ label: p.label, earned: Math.max(0, p.earned ?? 0), max: p.max! })),
    notes: [
      'Based on what you told your consultant, not verified documents. Past outcomes do not guarantee approval.',
      ...(r.note ? [r.note.en] : []),
    ],
  }
}
