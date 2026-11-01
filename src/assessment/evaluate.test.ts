import { evaluate } from './evaluate'
import { calculateScore } from './calculator/scoring'
import { calculateCRS, DEFAULT_CRS_FORM } from './calculator/canada-crs'
import { calculateAustraliaGSM, DEFAULT_AUSTRALIA_GSM_FORM } from './calculator/australia-gsm'
import { pruneAnswers, questionsFor, unanswered } from './questions'

test('tourism score matches the public calculator, including penalties', () => {
  const answers = {
    age_bracket: 'age_opt_2', education: 'edu_opt_1', employment: 'emp_opt_1', marital: 'mar_opt_1', travel: 'trav_opt_1,trav_opt_2',
    bank: 'bank_opt_1', purpose: 'purp_opt_1', asset: 'asset_opt_1,asset_opt_4', hrLetter: 'yes', previous_rejection: 'yes', personal_overstay: 'no', relative_overstay: 'no',
  }
  const r = evaluate({ program: 'tourism', answers })
  const direct = calculateScore({ age_bracket: ['age_opt_2'], education: ['edu_opt_1'], employment: ['emp_opt_1'], marital: ['mar_opt_1'], travel: ['trav_opt_1', 'trav_opt_2'], bank: ['bank_opt_1'], purpose: ['purp_opt_1'], asset: ['asset_opt_1', 'asset_opt_4'] }, { previous_rejection: true }, null)
  expect(r.score).toBe(direct.finalScore)
  expect(r.score).toBe(91) // 4+9+5+5+29(capped)+29+10+5 = 96, minus 5 for the refusal
  expect(r.verdict.label.en).toBe('Strong file')
  expect(r.complete).toBe(true)
  expect(r.rows.some(row => row.points === -5)).toBe(true)
  expect(evaluate({ program: 'tourism', answers: { ...answers, hrLetter: 'no' } }).score).toBe(41)
})

test('Canada CRS uses the official grid from the calculator (IELTS scores converted to CLB)', () => {
  const answers = {
    destination: 'canada', ca_spouse: 'no', ca_age: '20_29', ca_education: 'masters', ca_englishTest: 'IELTS',
    ca_en_reading: 'ielts_r_70', ca_en_writing: 'ielts_w_70', ca_en_speaking: 'ielts_s_70', ca_en_listening: 'ielts_l_80',
    ca_frenchTest: 'none', ca_canWorkExp: 'none', ca_foreignWorkExp: '3_plus_years', ca_trades: 'no', ca_sibling: 'no', ca_studyCanada: 'none', ca_jobOffer: 'none', ca_pnp: 'no',
  }
  const r = evaluate({ program: 'immigration', answers })
  const direct = calculateCRS({ ...DEFAULT_CRS_FORM, age: '20_29', education: 'masters', lang1_reading: 'clb9', lang1_writing: 'clb9', lang1_speaking: 'clb9', lang1_listening: 'clb9', foreignWorkExp: '3_plus_years' })
  expect(r.max).toBe(1200)
  expect(r.score).toBe(direct.total)
  expect(r.score).toBeGreaterThan(400)
})

test('Australia points match the calculator and flag the 65 minimum', () => {
  const answers = {
    destination: 'australia', au_subclass: '190', au_age: '25_32', au_english: 'proficient', au_overseasExp: '5_7_years', au_australianExp: 'less_than_1',
    au_qualification: 'bachelor_master', au_specialist: 'no', au_study: 'no', au_professionalYear: 'no', au_communityLanguage: 'no', au_regionalStudy: 'no', au_partner: 'single_or_citizen',
  }
  const r = evaluate({ program: 'immigration', answers })
  const direct = calculateAustraliaGSM({ ...DEFAULT_AUSTRALIA_GSM_FORM, subclass: '190', age: '25_32', english: 'proficient', overseasExp: '5_7_years', australianExp: 'less_than_1', qualification: 'bachelor_master', specialistEducation: false, australianStudy: false, professionalYear: false, communityLanguage: false, regionalStudy: false, partnerSkills: 'single_or_citizen' })
  expect(r.score).toBe(direct.total)
  expect(r.threshold).toBe(65)
})

test('job seeker Germany uses the calculator rules with self-declared recognition and EGP funds', () => {
  const answers = { destination: 'germany', js_recognised: 'yes', js_age: '29', js_language: 'english', js_languageLevel: 'b2', js_experience: 'two', js_bankBalance: '800000', js_bankCurrency: 'EGP' }
  const r = evaluate({ program: 'job-seeking', answers })
  expect(r.verdict.tone).toBe('ok')
  expect(r.issues).toEqual([])
  const poor = evaluate({ program: 'job-seeking', answers: { ...answers, js_bankBalance: '1000' } })
  expect(poor.issues.join(' ')).toMatch(/short by/)
  expect(evaluate({ program: 'job-seeking', answers: { ...answers, js_recognised: 'unknown' } }).issues.join(' ')).toMatch(/Anabin/)
})

test('follow-up questions appear and stale answers are dropped when an earlier answer changes', () => {
  expect(questionsFor('immigration', {}).map(q => q.id)).toEqual(['destination'])
  const withTest = questionsFor('immigration', { destination: 'canada', ca_englishTest: 'IELTS' }).map(q => q.id)
  expect(withTest).toContain('ca_en_reading')
  expect(pruneAnswers('immigration', { destination: 'australia', ca_age: '30' })).toEqual({ destination: 'australia' })
  expect(unanswered('tourism', {})).toContain('bank')
  expect(questionsFor('tourism', { employment: 'emp_opt_2' }).map(q => q.id)).toContain('businessActive')
})
