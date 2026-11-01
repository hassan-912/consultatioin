import type { L10n, ProgramId } from '../domain/types'
import { CATEGORIES } from './calculator/scoring'
import { getTestScoreOptions, type LangAbility, type LangTestType } from './calculator/canada-crs'

/**
 * The booking form's "about your situation" questions. They feed MG's Visa File Strength Calculator
 * (src/assessment/calculator); the customer never sees a score. Answer values are the calculator's own
 * option ids so the scoring stays identical to the public calculator.
 */
export type Answers = Record<string, string>
export type AssessedProgram = Extract<ProgramId, 'tourism' | 'immigration' | 'job-seeking'>
export interface StoredAssessment { program: AssessedProgram; answers: Answers }
export interface Choice { value: string; label: L10n }
export interface Question {
  id: string
  label: L10n
  hint?: L10n
  kind: 'choice' | 'multi' | 'yesno' | 'number' | 'money'
  options?: Choice[]
  /** multi: picking this option clears the others (e.g. "No travel history"). */
  exclusive?: string
  min?: number
  max?: number
}

export const isAssessed = (p: ProgramId | ''): p is AssessedProgram => p === 'tourism' || p === 'immigration' || p === 'job-seeking'

const c = (value: string, en: string, ar: string): Choice => ({ value, label: { en, ar } })
const L = (en: string, ar: string): L10n => ({ en, ar })
const yesno = (id: string, en: string, ar: string, hint?: L10n): Question => ({ id, label: L(en, ar), kind: 'yesno', hint })

// ── Tourism (lib/scoring.ts) ───────────────────────────────────────────────────────────────
const tourismAr: Record<string, string> = {
  age_bracket: 'العمر', education: 'المؤهل الدراسي', employment: 'الوضع الوظيفي', marital: 'الحالة الاجتماعية',
  travel: 'الدول التي سافرت إليها من قبل', bank: 'الحساب البنكي', purpose: 'مع من ستسافر؟', asset: 'ما تملكه من أصول',
  age_opt_1: '18–24 سنة', age_opt_2: '25–44 سنة', age_opt_3: '45 سنة أو أكثر',
  edu_opt_1: 'تعليم عالٍ (جامعي)', edu_opt_2: 'مؤهل متوسط', edu_opt_3: 'بدون مؤهل',
  emp_opt_1: 'موظف في شركة منذ سنة أو أكثر', emp_opt_2: 'صاحب عمل منذ 6 أشهر أو أكثر', emp_opt_3: 'موظف في شركة منذ أقل من سنة',
  mar_opt_1: 'متزوج ولدي أطفال', mar_opt_2: 'متزوج بدون أطفال', mar_opt_3: 'أعزب',
  trav_opt_1: 'أمريكا / كندا / بريطانيا', trav_opt_2: 'أوروبا', trav_opt_3: 'دول آسيوية', trav_opt_4: 'دول الخليج / الدول العربية', trav_opt_5: 'لم أسافر من قبل',
  bank_opt_1: 'حساب بالجنيه وحساب بالدولار (نشط منذ 6 أشهر أو أكثر)', bank_opt_2: 'حساب بالجنيه (منذ 6 أشهر أو أكثر، ورصيد 250 ألف أو أكثر)',
  bank_opt_3: 'حساب بالدولار فقط (منذ 6 أشهر أو أكثر، ورصيد 3,000 دولار أو أكثر)', bank_opt_4: 'لا يوجد حساب بنكي',
  purp_opt_1: 'بمفردي (وأنا متزوج)', purp_opt_2: 'بمفردي (وأنا أعزب)', purp_opt_3: 'مع الزوج / الزوجة', purp_opt_4: 'مع العائلة / الأطفال',
  asset_opt_1: 'منزل', asset_opt_2: 'أرض', asset_opt_3: 'شقة', asset_opt_4: 'سيارة', asset_opt_5: 'لا أملك أصولًا',
}
const tourismEnTitle: Record<string, string> = { travel: 'Countries you have visited before', purpose: 'Who are you travelling with?', asset: 'What you own' }
const tourismCategories: Question[] = CATEGORIES.map(cat => ({
  id: cat.id,
  label: L(tourismEnTitle[cat.id] ?? cat.title, tourismAr[cat.id]),
  kind: cat.inputType === 'checkbox' ? 'multi' : 'choice',
  exclusive: cat.inputType === 'checkbox' ? cat.options[cat.options.length - 1].id : undefined,
  options: cat.options.map(o => c(o.id, o.label, tourismAr[o.id])),
}))

function tourism(a: Answers): Question[] {
  const employed = a.employment === 'emp_opt_1' || a.employment === 'emp_opt_3'
  return [
    ...tourismCategories,
    ...(employed ? [yesno('hrLetter', 'Can you get an official HR letter or employment contract from your employer?', 'هل يمكنك الحصول على خطاب رسمي من الموارد البشرية أو عقد عمل من جهة عملك؟')] : []),
    ...(a.employment === 'emp_opt_2' ? [yesno('businessActive', 'Is your business currently active and operating?', 'هل نشاطك التجاري يعمل حاليًا بشكل فعلي؟')] : []),
    yesno('previous_rejection', 'Have you ever been refused a visa by any embassy?', 'هل سبق رفض تأشيرة لك من أي سفارة؟'),
    yesno('personal_overstay', 'Have you ever stayed in a country longer than your visa allowed, or without a valid visa?', 'هل سبق أن بقيت في دولة مدة أطول من المسموح في التأشيرة أو بدون تأشيرة سارية؟'),
    yesno('relative_overstay', 'Has a parent, brother, sister or child of yours ever overstayed a visa or stayed illegally?', 'هل سبق لأحد والديك أو إخوتك أو أبنائك تجاوز مدة التأشيرة أو الإقامة بشكل غير قانوني؟'),
  ]
}

// ── Canada Express Entry (lib/canada-crs.ts) ───────────────────────────────────────────────
const ABILITIES: { id: LangAbility; label: L10n }[] = [
  { id: 'reading', label: L('Reading', 'القراءة') }, { id: 'writing', label: L('Writing', 'الكتابة') },
  { id: 'speaking', label: L('Speaking', 'المحادثة') }, { id: 'listening', label: L('Listening', 'الاستماع') },
]
const crsEducation = [
  c('less_than_secondary', 'Less than secondary school', 'أقل من الثانوية'),
  c('secondary', 'Secondary school (high school) diploma', 'شهادة الثانوية'),
  c('one_year', 'One-year program after secondary school', 'برنامج دراسي لمدة سنة بعد الثانوية'),
  c('two_year', 'Two-year program after secondary school', 'برنامج دراسي لمدة سنتين بعد الثانوية'),
  c('bachelors', "Bachelor's degree or a 3+ year program", 'بكالوريوس أو برنامج 3 سنوات أو أكثر'),
  c('two_or_more_creds', 'Two or more qualifications (one is 3+ years)', 'مؤهلان أو أكثر (أحدهما 3 سنوات أو أكثر)'),
  c('masters', "Master's or professional degree", 'ماجستير أو شهادة مهنية'),
  c('phd', 'Doctorate (PhD)', 'دكتوراه'),
]
const years5 = [
  c('none', 'None / less than 1 year', 'لا يوجد / أقل من سنة'), c('1_year', '1 year', 'سنة'), c('2_years', '2 years', 'سنتان'),
  c('3_years', '3 years', '3 سنوات'), c('4_years', '4 years', '4 سنوات'), c('5_plus', '5 years or more', '5 سنوات أو أكثر'),
]
const crsAge = [c('17_or_less', '17 or younger', '17 أو أقل'), c('18', '18', '18'), c('19', '19', '19'), c('20_29', '20–29', '20–29'),
  ...Array.from({ length: 15 }, (_, i) => String(30 + i)).map(n => c(n, n, n)), c('45_plus', '45 or older', '45 أو أكثر')]
const scoreOptions = (test: string, ability: LangAbility) =>
  getTestScoreOptions(test as LangTestType, ability).map(o => c(o.rawValue, o.label.replace(/\s+/g, ' '), o.label.replace(/\s+/g, ' ')))

function canada(a: Answers): Question[] {
  const qs: Question[] = [
    yesno('ca_spouse', 'Will your spouse or partner come with you to Canada?', 'هل سيرافقك الزوج / الزوجة إلى كندا؟'),
    { id: 'ca_age', label: L('Your age', 'عمرك'), kind: 'choice', options: crsAge },
    { id: 'ca_education', label: L('Your highest completed education', 'أعلى مؤهل دراسي حصلت عليه'), kind: 'choice', options: crsEducation },
    { id: 'ca_englishTest', label: L('English test you have taken', 'اختبار اللغة الإنجليزية الذي أديته'), kind: 'choice', options: [
      c('IELTS', 'IELTS General', 'IELTS General'), c('CELPIP_G', 'CELPIP-G', 'CELPIP-G'), c('PTE_Core', 'PTE Core', 'PTE Core'), c('none', 'No test yet', 'لم أختبر بعد')] },
  ]
  if (a.ca_englishTest && a.ca_englishTest !== 'none') for (const ab of ABILITIES) {
    qs.push({ id: `ca_en_${ab.id}`, label: L(`English score: ${ab.label.en}`, `درجة الإنجليزية: ${ab.label.ar}`), kind: 'choice', options: scoreOptions(a.ca_englishTest, ab.id) })
  }
  qs.push({ id: 'ca_frenchTest', label: L('French test you have taken', 'اختبار اللغة الفرنسية الذي أديته'), kind: 'choice', options: [
    c('none', 'None', 'لا يوجد'), c('TEF_Canada', 'TEF Canada', 'TEF Canada'), c('TCF_Canada', 'TCF Canada', 'TCF Canada')] })
  if (a.ca_frenchTest && a.ca_frenchTest !== 'none') for (const ab of ABILITIES) {
    qs.push({ id: `ca_fr_${ab.id}`, label: L(`French score: ${ab.label.en}`, `درجة الفرنسية: ${ab.label.ar}`), kind: 'choice', options: scoreOptions(a.ca_frenchTest, ab.id) })
  }
  qs.push(
    { id: 'ca_canWorkExp', label: L('Skilled work experience inside Canada', 'خبرة عمل ماهرة داخل كندا'), kind: 'choice', options: years5 },
    { id: 'ca_foreignWorkExp', label: L('Skilled work experience outside Canada (last 10 years)', 'خبرة عمل ماهرة خارج كندا (آخر 10 سنوات)'), kind: 'choice', options: [
      c('none', 'None / less than 1 year', 'لا يوجد / أقل من سنة'), c('1_2_years', '1 to 2 years', 'من سنة إلى سنتين'), c('3_plus_years', '3 years or more', '3 سنوات أو أكثر')] },
    yesno('ca_trades', 'Do you have a Canadian certificate of qualification in a skilled trade?', 'هل لديك شهادة تأهيل كندية في حرفة ماهرة؟'),
    yesno('ca_sibling', 'Do you have a brother or sister in Canada who is a citizen or permanent resident?', 'هل لديك أخ أو أخت في كندا يحمل الجنسية أو الإقامة الدائمة؟'),
    { id: 'ca_studyCanada', label: L('Have you studied in Canada after secondary school?', 'هل درست في كندا بعد الثانوية؟'), kind: 'choice', options: [
      c('none', 'No', 'لا'), c('1_2_years', 'Yes, 1–2 years', 'نعم، سنة إلى سنتين'), c('3_plus_years', 'Yes, 3 years or more', 'نعم، 3 سنوات أو أكثر')] },
    { id: 'ca_jobOffer', label: L('Do you have a valid job offer in Canada?', 'هل لديك عرض عمل ساري في كندا؟'), kind: 'choice', options: [
      c('none', 'No', 'لا'), c('noc00', 'Yes, a senior management job (NOC TEER 0, group 00)', 'نعم، وظيفة إدارة عليا (NOC TEER 0 مجموعة 00)'),
      c('other_noc', 'Yes, another skilled job (NOC TEER 0, 1, 2 or 3)', 'نعم، وظيفة ماهرة أخرى (NOC TEER 0 أو 1 أو 2 أو 3)')] },
    yesno('ca_pnp', 'Do you have a nomination from a Canadian province or territory?', 'هل لديك ترشيح من إحدى المقاطعات الكندية؟'),
  )
  if (a.ca_spouse === 'yes') qs.push(
    { id: 'ca_sp_education', label: L("Your partner's highest education", 'أعلى مؤهل دراسي للزوج / الزوجة'), kind: 'choice', options: crsEducation },
    { id: 'ca_sp_english', label: L("Your partner's English level", 'مستوى الإنجليزية للزوج / الزوجة'), kind: 'choice', options: [
      c('clb4_or_less', 'Basic or no test (CLB 4 or less)', 'مبتدئ أو بدون اختبار (CLB 4 أو أقل)'), c('clb5_6', 'CLB 5–6 (about IELTS 5–5.5)', 'CLB 5–6 (حوالي IELTS 5–5.5)'),
      c('clb7_8', 'CLB 7–8 (about IELTS 6–6.5)', 'CLB 7–8 (حوالي IELTS 6–6.5)'), c('clb9_plus', 'CLB 9+ (about IELTS 7+)', 'CLB 9 أو أكثر (حوالي IELTS 7 أو أكثر)')] },
    { id: 'ca_sp_canWorkExp', label: L("Your partner's skilled work experience inside Canada", 'خبرة عمل الزوج / الزوجة داخل كندا'), kind: 'choice', options: years5 },
  )
  return qs
}

// ── Australia skilled migration (lib/australia-gsm.ts) ─────────────────────────────────────
function australia(): Question[] {
  return [
    { id: 'au_subclass', label: L('Which visa are you aiming for?', 'ما التأشيرة التي تستهدفها؟'), kind: 'choice', options: [
      c('189', 'Skilled Independent (189)', 'المستقل الماهر (189)'), c('190', 'Skilled Nominated by a state (190)', 'الماهر بترشيح من ولاية (190)'),
      c('491', 'Skilled Work Regional (491)', 'العمل الماهر في المناطق الإقليمية (491)')] },
    { id: 'au_age', label: L('Your age', 'عمرك'), kind: 'choice', options: [
      c('18_24', '18–24', '18–24'), c('25_32', '25–32', '25–32'), c('33_39', '33–39', '33–39'), c('40_44', '40–44', '40–44'), c('45_plus', '45 or older', '45 أو أكثر')] },
    { id: 'au_english', label: L('Your English level', 'مستوى اللغة الإنجليزية'), kind: 'choice', options: [
      c('below', 'Below IELTS 6 / no test yet', 'أقل من IELTS 6 / لم أختبر بعد'), c('competent', 'Competent (IELTS 6 in each skill)', 'جيد (IELTS 6 في كل مهارة)'),
      c('proficient', 'Proficient (IELTS 7 in each skill)', 'جيد جدًا (IELTS 7 في كل مهارة)'), c('superior', 'Superior (IELTS 8 in each skill)', 'ممتاز (IELTS 8 في كل مهارة)')] },
    { id: 'au_overseasExp', label: L('Skilled work experience outside Australia (last 10 years)', 'خبرة عمل ماهرة خارج أستراليا (آخر 10 سنوات)'), kind: 'choice', options: [
      c('less_than_3', 'Less than 3 years', 'أقل من 3 سنوات'), c('3_4_years', '3–4 years', '3–4 سنوات'), c('5_7_years', '5–7 years', '5–7 سنوات'), c('8_plus_years', '8 years or more', '8 سنوات أو أكثر')] },
    { id: 'au_australianExp', label: L('Skilled work experience inside Australia (last 10 years)', 'خبرة عمل ماهرة داخل أستراليا (آخر 10 سنوات)'), kind: 'choice', options: [
      c('less_than_1', 'None / less than 1 year', 'لا يوجد / أقل من سنة'), c('1_2_years', '1–2 years', '1–2 سنة'), c('3_4_years', '3–4 years', '3–4 سنوات'),
      c('5_7_years', '5–7 years', '5–7 سنوات'), c('8_plus_years', '8 years or more', '8 سنوات أو أكثر')] },
    { id: 'au_qualification', label: L('Your highest qualification', 'أعلى مؤهل لديك'), kind: 'choice', options: [
      c('doctorate', 'Doctorate (PhD)', 'دكتوراه'), c('bachelor_master', "Bachelor's or master's degree", 'بكالوريوس أو ماجستير'),
      c('diploma_trade', 'Australian diploma or trade qualification', 'دبلوم أسترالي أو مؤهل حرفي'), c('recognized_award', 'Other qualification recognised by the assessing body', 'مؤهل آخر معترف به من جهة التقييم'),
      c('none', 'None of these', 'لا شيء مما سبق')] },
    yesno('au_specialist', 'Do you have an Australian master’s by research or PhD in a STEM or ICT field?', 'هل لديك ماجستير بحثي أو دكتوراه أسترالية في مجال علمي أو تقني؟'),
    yesno('au_study', 'Have you studied in Australia for at least 2 academic years?', 'هل درست في أستراليا لمدة سنتين دراسيتين على الأقل؟'),
    yesno('au_professionalYear', 'Have you completed a Professional Year in Australia (accounting, ICT or engineering)?', 'هل أكملت برنامج Professional Year في أستراليا (محاسبة أو تقنية معلومات أو هندسة)؟'),
    yesno('au_communityLanguage', 'Do you hold a NAATI community language credential?', 'هل لديك اعتماد لغة مجتمعية من NAATI؟'),
    yesno('au_regionalStudy', 'Did you study in a regional area of Australia?', 'هل درست في منطقة إقليمية في أستراليا؟'),
    { id: 'au_partner', label: L('Your spouse or partner', 'الزوج / الزوجة'), kind: 'choice', options: [
      c('single_or_citizen', 'I am single, or my partner is an Australian citizen / permanent resident', 'أعزب، أو الزوج / الزوجة مواطن أو مقيم دائم في أستراليا'),
      c('partner_skills_english', 'Partner has competent English and a positive skills assessment', 'الزوج / الزوجة لديه إنجليزية جيدة وتقييم مهارات إيجابي'),
      c('partner_english_only', 'Partner has competent English only', 'الزوج / الزوجة لديه إنجليزية جيدة فقط'),
      c('none', 'None of the above', 'لا شيء مما سبق')] },
  ]
}

// ── Job seeker (lib/job-seeker.ts) ─────────────────────────────────────────────────────────
const levels = [c('none', 'Below A1 / no certificate', 'أقل من A1 / بدون شهادة'), ...['a1', 'a2', 'b1', 'b2', 'c1', 'c2'].map(v => c(v, v.toUpperCase(), v.toUpperCase()))]
const age: Question = { id: 'js_age', label: L('Your age', 'عمرك'), kind: 'number', min: 16, max: 80 }
const months: Question = { id: 'js_months', label: L('How long do you plan to stay?', 'ما المدة التي تنوي البقاء فيها؟'), kind: 'choice', options: [c('6', '6 months', '6 أشهر'), c('9', '9 months', '9 أشهر')] }
const bank: Question[] = [
  { id: 'js_bankBalance', label: L('Money available in your bank account', 'المبلغ المتاح في حسابك البنكي'), kind: 'money', hint: L('Numbers only, e.g. 800000', 'أرقام فقط، مثل 800000') },
  { id: 'js_bankCurrency', label: L('Currency of that amount', 'عملة هذا المبلغ'), kind: 'choice', options: [c('EGP', 'Egyptian pounds (EGP)', 'جنيه مصري'), c('EUR', 'Euro (EUR)', 'يورو'), c('SEK', 'Swedish krona (SEK)', 'كرونة سويدية')] },
]

function jobSeeker(a: Answers): Question[] {
  switch (a.destination) {
    case 'germany': return [
      { id: 'js_recognised', label: L('Are your university and degree recognised in Germany (Anabin H+ and “equivalent”)?', 'هل جامعتك وشهادتك معترف بهما في ألمانيا (Anabin H+ و“معادلة”)؟'), kind: 'choice', options: [
        c('yes', 'Yes, both', 'نعم، الاثنان'), c('partial', 'Partly / with conditions', 'جزئيًا / بشروط'), c('no', 'No', 'لا'), c('unknown', "I don't know", 'لا أعرف')] },
      age,
      { id: 'js_language', label: L('Language you will use', 'اللغة التي ستعتمد عليها'), kind: 'choice', options: [c('german', 'German', 'الألمانية'), c('english', 'English', 'الإنجليزية')] },
      { id: 'js_languageLevel', label: L('Your level in that language', 'مستواك في هذه اللغة'), kind: 'choice', options: levels },
      { id: 'js_experience', label: L('Work experience in your field after graduating', 'خبرة العمل في مجالك بعد التخرج'), kind: 'choice', options: [
        c('none', 'Less than 2 years', 'أقل من سنتين'), c('two', '2+ years within the last 5 years', 'سنتان أو أكثر خلال آخر 5 سنوات'), c('five', '5+ years within the last 7 years', '5 سنوات أو أكثر خلال آخر 7 سنوات')] },
      ...bank,
    ]
    case 'austria': return [
      age,
      { id: 'js_education', label: L('Your highest qualification', 'أعلى مؤهل لديك'), kind: 'choice', options: [
        c('none', 'None of these', 'لا شيء مما يلي'), c('degree', 'University degree (4+ years)', 'شهادة جامعية (4 سنوات أو أكثر)'),
        c('mint', 'Science / technology / engineering / maths degree (4+ years)', 'شهادة علوم أو تكنولوجيا أو هندسة أو رياضيات (4 سنوات أو أكثر)'), c('phd', 'PhD / habilitation', 'دكتوراه')] },
      yesno('js_research', 'Do you have documented research or innovation work?', 'هل لديك أعمال بحثية أو ابتكارات موثقة؟'),
      yesno('js_awards', 'Have you received recognised awards or prizes?', 'هل حصلت على جوائز معترف بها؟'),
      { id: 'js_years', label: L('Years of work experience in your field', 'سنوات الخبرة في مجالك'), kind: 'number', min: 0, max: 60 },
      yesno('js_austrianExperience', 'Have you worked in Austria for 6 months or more?', 'هل عملت في النمسا لمدة 6 أشهر أو أكثر؟'),
      { id: 'js_language', label: L('Your strongest foreign language', 'أقوى لغة أجنبية لديك'), kind: 'choice', options: [
        c('german', 'German', 'الألمانية'), c('english', 'English', 'الإنجليزية'), c('french', 'French', 'الفرنسية'), c('spanish', 'Spanish', 'الإسبانية'),
        c('bosnian', 'Bosnian', 'البوسنية'), c('croatian', 'Croatian', 'الكرواتية'), c('serbian', 'Serbian', 'الصربية')] },
      { id: 'js_languageLevel', label: L('Your level in that language', 'مستواك في هذه اللغة'), kind: 'choice', options: levels },
      ...bank,
    ]
    case 'sweden': return [
      yesno('js_secondCycle', "Do you have a master's degree or PhD?", 'هل لديك ماجستير أو دكتوراه؟'),
      yesno('js_outsideSweden', 'Will you apply from outside Sweden?', 'هل ستقدم من خارج السويد؟'),
      { id: 'js_years', label: L('Years of work experience in your field of study', 'سنوات الخبرة في مجال دراستك'), kind: 'number', min: 0, max: 60 },
      months,
      ...bank,
    ]
    case 'training': return [
      age,
      { id: 'js_german', label: L('Your German level', 'مستواك في اللغة الألمانية'), kind: 'choice', options: levels },
      { id: 'js_school', label: L('Your school qualification', 'مؤهلك الدراسي'), kind: 'choice', options: [
        c('diploma', 'Diploma', 'دبلوم'), c('secondary', 'Secondary school certificate', 'شهادة الثانوية'), c('none', 'None', 'لا يوجد')] },
      months,
      ...bank,
    ]
    default: return []
  }
}

const destinationQ = (options: Choice[]): Question => ({ id: 'destination', label: L('Which country are you interested in?', 'ما الدولة التي تهتم بها؟'), kind: 'choice', options })

/** Questions to show right now for this program, given the answers so far (some depend on earlier answers). */
export function questionsFor(program: AssessedProgram, a: Answers): Question[] {
  if (program === 'tourism') return tourism(a)
  if (program === 'immigration') {
    const dest = destinationQ([c('canada', 'Canada', 'كندا'), c('australia', 'Australia', 'أستراليا')])
    return [dest, ...(a.destination === 'canada' ? canada(a) : a.destination === 'australia' ? australia() : [])]
  }
  const dest = destinationQ([c('germany', 'Germany – Opportunity Card', 'ألمانيا – بطاقة الفرص'), c('austria', 'Austria – Job Seeker Visa', 'النمسا – تأشيرة البحث عن عمل'),
    c('sweden', 'Sweden – Look for Work', 'السويد – تأشيرة البحث عن عمل'), c('training', 'Germany – vocational training search', 'ألمانيا – البحث عن تدريب مهني')])
  return [dest, ...jobSeeker(a)]
}

export function answered(q: Question, v: string | undefined): boolean {
  if (!v?.trim()) return false
  if (q.kind === 'number') { const n = Number(v); return Number.isFinite(n) && n >= (q.min ?? -Infinity) && n <= (q.max ?? Infinity) }
  if (q.kind === 'money') return /^\d{1,13}(\.\d{1,2})?$/.test(v.replace(/,/g, ''))
  return true
}

/** Ids of visible questions that still need an answer. */
export const unanswered = (program: AssessedProgram, a: Answers) => questionsFor(program, a).filter(q => !answered(q, a[q.id])).map(q => q.id)

/** Drops answers to questions that are no longer shown (e.g. after changing destination). */
export function pruneAnswers(program: AssessedProgram, a: Answers): Answers {
  const ids = new Set(questionsFor(program, a).map(q => q.id))
  return Object.fromEntries(Object.entries(a).filter(([k]) => ids.has(k)))
}
