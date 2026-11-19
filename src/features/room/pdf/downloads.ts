import { createElement } from 'react'
import type { Booking, Lang, MeetingSummary } from '../../../domain/types'
import type { AssessmentResult } from '../../../assessment/evaluate'
import { getConsultant } from '../../../store/actions'
import { programName } from '../../../config/programs'
import { downloadDocument } from './downloadPdf'
import { AssessmentDocument, SummaryDocument } from './MgDocument'

const FOOTER = 'MG International Visa Consultancy  ·  Private and confidential'

function common(b: Booking, programme?: string) {
  const id = (programme || b.customer.program || '') as Parameters<typeof programName>[0]
  let name = { en: 'Visa consultation', ar: 'استشارة تأشيرة' }
  try { if (id) name = programName(id) } catch { /* unknown id: keep the general name */ }
  return { booking: b, consultant: getConsultant(b.consultantId).name, programme: name }
}

export const downloadSummary = (b: Booking, summary: MeetingSummary) =>
  downloadDocument(createElement(SummaryDocument, { ...common(b), summary }), `MG-Consultation-Summary-${b.reference}.pdf`, FOOTER)

export const downloadAssessment = (b: Booking, result: AssessmentResult, program: string, lang: Lang) =>
  downloadDocument(createElement(AssessmentDocument, { ...common(b, program), result, lang }), `MG-File-Assessment-${b.reference}.pdf`, FOOTER)
