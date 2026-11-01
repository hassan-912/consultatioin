import type { L10n } from '../domain/types'
import { calculateScore, CATEGORIES, PENALTIES, type SelectionsMap } from './calculator/scoring'
import { calculateCRS, DEFAULT_CRS_FORM, rawScoreToLang1Key, rawScoreToLang2Key, type CRSForm, type LangAbility, type LangTestType } from './calculator/canada-crs'
import { calculateAustraliaGSM, DEFAULT_AUSTRALIA_GSM_FORM, type AustraliaGSMForm } from './calculator/australia-gsm'
import { assessJobSeeker, type JobSeekerRoute } from './calculator/job-seeker'
import { assessmentConfig } from '../config/assessment'
import { questionsFor, unanswered, type Answers, type StoredAssessment } from './questions'

export type Tone = 'ok' | 'warn' | 'bad'
export interface AssessmentRow { label: L10n; points: number; max?: number }
export interface AssessmentResult {
  title: L10n
  /** null when the program has no points scale (Sweden, vocational training). */
  score: number | null
  max: number | null
  /** e.g. the 65-point minimum for Australia, the job seeker points threshold. */
  threshold: number | null
  verdict: { label: L10n; tone: Tone }
  rows: AssessmentRow[]
  /** Calculator's own wording (English). */
  issues: string[]
  answers: { question: L10n; answer: L10n | string }[]
  /** False when the customer left questions unanswered (older bookings, skipped form). */
  complete: boolean
  note?: L10n
}

const L = (en: string, ar: string): L10n => ({ en, ar })

function answerList(s: StoredAssessment): AssessmentResult['answers'] {
  return questionsFor(s.program, s.answers).flatMap((q): AssessmentResult['answers'] => {
    const v = s.answers[q.id]
    if (!v) return []
    if (q.kind === 'yesno') return [{ question: q.label, answer: v === 'yes' ? L('Yes', 'نعم') : L('No', 'لا') }]
    if (q.kind === 'number' || q.kind === 'money') return [{ question: q.label, answer: v }]
    const picked = v.split(',').map(id => q.options?.find(o => o.value === id)?.label).filter((x): x is L10n => !!x)
    return [{ question: q.label, answer: picked.length === 1 ? picked[0] : L(picked.map(p => p.en).join(', '), picked.map(p => p.ar).join('، ')) }]
  })
}

function tourism(a: Answers): Omit<AssessmentResult, 'answers' | 'complete'> {
  const selections: SelectionsMap = Object.fromEntries(CATEGORIES.map(cat => [cat.id, (a[cat.id] ?? '').split(',').filter(Boolean)]))
  const penalties = {
    previous_rejection: a.previous_rejection === 'yes',
    relative_overstay: a.relative_overstay === 'yes',
    personal_overstay: a.personal_overstay === 'yes',
    no_hr_letter: a.hrLetter === 'no',
    inactive_business: a.businessActive === 'no',
  }
  const r = calculateScore(selections, penalties, null)
  const ar: Record<string, string> = { age_bracket: 'العمر', education: 'المؤهل الدراسي', employment: 'الوضع الوظيفي', marital: 'الحالة الاجتماعية والروابط', travel: 'تاريخ السفر', bank: 'الوضع المالي والبنكي', purpose: 'طبيعة الرحلة', asset: 'الممتلكات والأصول' }
  const penaltyAr: Record<string, string> = { previous_rejection: 'رفض تأشيرة سابق', relative_overstay: 'قريب من الدرجة الأولى تجاوز مدة التأشيرة', personal_overstay: 'تجاوز مدة تأشيرة سابقًا', no_hr_letter: 'لا يستطيع تقديم خطاب موارد بشرية', inactive_business: 'النشاط التجاري غير فعّال' }
  const rows: AssessmentRow[] = [
    ...CATEGORIES.map(cat => ({ label: L(cat.title, ar[cat.id]), points: r.categoryScores[cat.id].earned, max: cat.maxScore })),
    ...PENALTIES.filter(p => penalties[p.id as keyof typeof penalties]).map(p => ({ label: L(p.label, penaltyAr[p.id]), points: -p.deduction })),
  ]
  const s = r.finalScore
  return {
    title: L('Tourism visa file strength', 'قوة ملف تأشيرة السياحة'), score: s, max: 100, threshold: null, rows, issues: [],
    verdict: s >= 80 ? { label: L('Strong file', 'ملف قوي'), tone: 'ok' } : s >= 60 ? { label: L('Moderate file', 'ملف متوسط'), tone: 'warn' } : { label: L('Weak file / high risk', 'ملف ضعيف / مخاطرة عالية'), tone: 'bad' },
  }
}

function canada(a: Answers): Omit<AssessmentResult, 'answers' | 'complete'> {
  const abilities: LangAbility[] = ['reading', 'writing', 'speaking', 'listening']
  const en = a.ca_englishTest as LangTestType
  const fr = a.ca_frenchTest as LangTestType
  const hasEn = !!a.ca_englishTest && a.ca_englishTest !== 'none'
  const hasFr = !!a.ca_frenchTest && a.ca_frenchTest !== 'none'
  const form: CRSForm = { ...DEFAULT_CRS_FORM, withSpouse: a.ca_spouse === 'yes', age: a.ca_age ?? '', education: a.ca_education ?? '' }
  for (const ab of abilities) {
    form[`lang1_${ab}`] = hasEn ? rawScoreToLang1Key(en, ab, a[`ca_en_${ab}`] ?? '') : 'less_than_clb4'
    form[`lang2_${ab}`] = hasFr ? rawScoreToLang2Key(fr, ab, a[`ca_fr_${ab}`] ?? '') : 'clb4_or_less'
    form[`spouse_lang1_${ab}`] = a.ca_sp_english || 'clb4_or_less'
  }
  Object.assign(form, {
    canWorkExp: a.ca_canWorkExp || 'none', foreignWorkExp: a.ca_foreignWorkExp || 'none', tradesCertificate: a.ca_trades === 'yes',
    siblingInCanada: a.ca_sibling === 'yes', postSecondaryCanada: a.ca_studyCanada || 'none', arrangedEmployment: a.ca_jobOffer || 'none',
    provincialNomination: a.ca_pnp === 'yes', spouse_education: a.ca_sp_education || 'less_than_secondary', spouse_canWorkExp: a.ca_sp_canWorkExp || 'none',
  })
  const b = calculateCRS(form)
  const rows: AssessmentRow[] = [
    { label: L('Age', 'العمر'), points: b.ageScore, max: 110 },
    { label: L('Education', 'التعليم'), points: b.educationScore, max: 150 },
    { label: L('English', 'الإنجليزية'), points: b.lang1Score, max: 136 },
    { label: L('French', 'الفرنسية'), points: b.lang2Score, max: 24 },
    { label: L('Canadian work experience', 'خبرة العمل في كندا'), points: b.canWorkExpScore, max: 80 },
    { label: L('Spouse / partner factors', 'عوامل الزوج / الزوجة'), points: b.spouseScore, max: 40 },
    { label: L('Skill transferability', 'قابلية نقل المهارات'), points: b.skillTransferScore, max: 100 },
    { label: L('Additional points (incl. French bonus)', 'نقاط إضافية (تشمل مكافأة الفرنسية)'), points: b.additionalScore, max: 600 },
  ]
  const s = b.total
  return {
    title: L('Canada Express Entry (CRS)', 'كندا – الدخول السريع (CRS)'), score: s, max: 1200, threshold: null, rows, issues: [],
    verdict: s >= 470 ? { label: L('Competitive', 'تنافسي'), tone: 'ok' } : s >= 380 ? { label: L('Moderate', 'متوسط'), tone: 'warn' } : { label: L('Needs improvement', 'يحتاج إلى تحسين'), tone: 'bad' },
  }
}

function australia(a: Answers): Omit<AssessmentResult, 'answers' | 'complete'> {
  const yn = (v?: string) => (v === 'yes' ? true : v === 'no' ? false : null)
  const form: AustraliaGSMForm = {
    ...DEFAULT_AUSTRALIA_GSM_FORM,
    subclass: (a.au_subclass ?? '') as AustraliaGSMForm['subclass'], age: (a.au_age ?? '') as AustraliaGSMForm['age'],
    english: (a.au_english === 'below' ? '' : a.au_english ?? '') as AustraliaGSMForm['english'],
    overseasExp: (a.au_overseasExp ?? '') as AustraliaGSMForm['overseasExp'], australianExp: (a.au_australianExp ?? '') as AustraliaGSMForm['australianExp'],
    qualification: (a.au_qualification ?? '') as AustraliaGSMForm['qualification'], specialistEducation: yn(a.au_specialist), australianStudy: yn(a.au_study),
    professionalYear: yn(a.au_professionalYear), communityLanguage: yn(a.au_communityLanguage), regionalStudy: yn(a.au_regionalStudy),
    partnerSkills: (a.au_partner ?? '') as AustraliaGSMForm['partnerSkills'],
  }
  const b = calculateAustraliaGSM(form)
  const rows: AssessmentRow[] = [
    { label: L('Visa subclass', 'نوع التأشيرة'), points: b.subclassScore, max: 15 },
    { label: L('Age', 'العمر'), points: b.ageScore, max: 30 },
    { label: L('English', 'الإنجليزية'), points: b.englishScore, max: 20 },
    { label: L('Skilled employment (overseas + Australia, max 20)', 'الخبرة المهنية (خارج وداخل أستراليا، بحد أقصى 20)'), points: b.combinedEmploymentScore, max: 20 },
    { label: L('Qualification', 'المؤهل'), points: b.qualificationScore, max: 20 },
    { label: L('Specialist education', 'تعليم تخصصي'), points: b.specialistEducationScore, max: 10 },
    { label: L('Australian study', 'الدراسة في أستراليا'), points: b.australianStudyScore, max: 5 },
    { label: L('Professional Year', 'Professional Year'), points: b.professionalYearScore, max: 5 },
    { label: L('Community language', 'لغة مجتمعية'), points: b.communityLanguageScore, max: 5 },
    { label: L('Regional study', 'دراسة إقليمية'), points: b.regionalStudyScore, max: 5 },
    { label: L('Partner', 'الزوج / الزوجة'), points: b.partnerSkillsScore, max: 10 },
  ]
  const s = b.total
  return {
    title: L('Australia skilled migration points', 'نقاط الهجرة الماهرة إلى أستراليا'), score: s, max: null, threshold: 65, rows, issues: [],
    verdict: s >= 85 ? { label: L('Highly competitive', 'تنافسي جدًا'), tone: 'ok' } : s >= 75 ? { label: L('Competitive', 'تنافسي'), tone: 'ok' }
      : s >= 65 ? { label: L('Eligible (meets the 65 minimum)', 'مؤهل (يحقق الحد الأدنى 65)'), tone: 'warn' } : { label: L('Below 65 points', 'أقل من 65 نقطة'), tone: 'bad' },
  }
}

const jobTitles: Record<JobSeekerRoute, L10n> = {
  germany: L('Germany – Opportunity Card', 'ألمانيا – بطاقة الفرص'), austria: L('Austria – Job Seeker Visa', 'النمسا – تأشيرة البحث عن عمل'),
  sweden: L('Sweden – Look for Work', 'السويد – تأشيرة البحث عن عمل'), training: L('Germany – vocational training search', 'ألمانيا – البحث عن تدريب مهني'),
}
const jobRowAr: Record<string, string> = { Age: 'العمر', 'Relevant experience': 'الخبرة ذات الصلة', English: 'الإنجليزية', German: 'الألمانية', 'Qualifications & skills': 'المؤهلات والمهارات', 'Selected language': 'اللغة المختارة' }

function jobSeeker(a: Answers): Omit<AssessmentResult, 'answers' | 'complete'> {
  const route = a.destination as JobSeekerRoute
  const form: Record<string, string> = Object.fromEntries(Object.entries(a).filter(([k]) => k.startsWith('js_')).map(([k, v]) => [k.slice(3), v]))
  if (route === 'germany') {
    // The public calculator verifies Anabin records; the booking form asks the customer instead (self-declared).
    const rec = a.js_recognised
    Object.assign(form, {
      recognitionSource: rec === 'yes' || rec === 'partial' ? 'anabin' : '',
      anabinInstitutionId: rec === 'yes' || rec === 'partial' ? '0'.repeat(24) : '', anabinDegreeId: rec === 'yes' || rec === 'partial' ? '0'.repeat(24) : '',
      anabinDegreeAssociation: rec === 'yes' || rec === 'partial' ? 'institution' : '',
      institutionStatus: rec === 'yes' ? 'hplus' : rec === 'partial' ? 'conditional' : '', degreeStatus: rec === 'yes' ? 'equivalent' : rec === 'partial' ? 'partial' : '',
    })
  }
  if (!form.months) form.months = route === 'germany' ? '12' : route === 'austria' ? '6' : '9'
  const { egpPerEur, egpPerSek } = assessmentConfig.exchangeRates
  const now = new Date().toISOString()
  const r = assessJobSeeker(route, form, { rates: { EUR: egpPerEur, SEK: egpPerSek }, updatedAt: now, nextUpdateAt: now })
  return {
    title: jobTitles[route] ?? L('Job seeker', 'البحث عن عمل'), score: r.total, max: null, threshold: r.threshold,
    rows: r.breakdown.map(row => ({ label: L(row.label, jobRowAr[row.label] ?? row.label), points: row.points })),
    issues: r.issues,
    verdict: r.meetsCriteria ? { label: L('Meets the criteria', 'يستوفي الشروط'), tone: 'ok' } : { label: L(`${r.issues.length} point(s) to address`, `${r.issues.length} نقطة تحتاج معالجة`), tone: r.issues.length > 2 ? 'bad' : 'warn' },
    note: route === 'germany' ? L('Degree recognition is self-declared by the customer; verify it in Anabin.', 'الاعتراف بالشهادة حسب كلام العميل؛ يجب التحقق منه في Anabin.') : undefined,
  }
}

/** Staff only: score a stored questionnaire with the same rules as MG's public calculator. */
export function evaluate(s: StoredAssessment): AssessmentResult {
  const a = s.answers
  const base = s.program === 'tourism' ? tourism(a)
    : s.program === 'immigration' ? (a.destination === 'australia' ? australia(a) : canada(a))
    : jobSeeker(a)
  const note = base.note ?? (s.program === 'job-seeking' && a.js_bankCurrency && a.js_bankCurrency !== 'EUR'
    ? L(assessmentConfig.exchangeRates.note.en, assessmentConfig.exchangeRates.note.ar) : undefined)
  return { ...base, note, answers: answerList(s), complete: unanswered(s.program, a).length === 0 }
}
