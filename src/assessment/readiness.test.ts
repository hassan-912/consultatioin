import { defaultReadinessRules as rules, mergeRules, readinessOf } from './readiness'
import { evaluate } from './evaluate'

const strongTourism = {
  age_bracket: 'age_opt_2', education: 'edu_opt_1', employment: 'emp_opt_1', marital: 'mar_opt_1', travel: 'trav_opt_1,trav_opt_2',
  bank: 'bank_opt_1', purpose: 'purp_opt_1', asset: 'asset_opt_1,asset_opt_4', hrLetter: 'yes', previous_rejection: 'no', personal_overstay: 'no', relative_overstay: 'no',
}

test('a strong tourism file is ready', () => {
  const r = readinessOf({ program: 'tourism', answers: strongTourism }, rules, null)
  expect(r).toMatchObject({ ready: true, reasons: [], max: 100 })
})

test('tourism: a weak file, a small Egyptian account or no account is not ready, with the reason in both languages', () => {
  const weak = readinessOf({ program: 'tourism', answers: { ...strongTourism, hrLetter: 'no', travel: 'trav_opt_5', asset: 'asset_opt_5' } }, rules, null)
  expect(weak.ready).toBe(false)
  expect(weak.reasons[0].en).toMatch(/^File strength \d+\/100, below 60$/)
  expect(weak.reasons[0].ar).toMatch(/قوة الملف/)

  const low = readinessOf({ program: 'tourism', answers: { ...strongTourism, bank: 'bank_opt_5' } }, rules, null)
  expect(low.ready).toBe(false)
  expect(low.reasons.map(x => x.en)).toContain('Egyptian account with less than 250,000 EGP')

  const none = readinessOf({ program: 'tourism', answers: { ...strongTourism, bank: 'bank_opt_4' } }, rules, null)
  expect(none.reasons.map(x => x.en)).toContain('No bank account')

  // The admin can switch a rule off.
  expect(readinessOf({ program: 'tourism', answers: { ...strongTourism, bank: 'bank_opt_5' } }, { ...rules, tourismLowBank: false }, null).ready).toBe(true)
})

test('tourism: having overstayed a visa is not ready', () => {
  const r = readinessOf({ program: 'tourism', answers: { ...strongTourism, personal_overstay: 'yes' } }, rules, null)
  expect(r.reasons.map(x => x.en)).toContain('Stayed longer than a visa allowed before')
})

test('Australia below the minimum points is not ready; the admin minimum is used', () => {
  const answers = {
    destination: 'australia', au_subclass: '190', au_age: '25_32', au_english: 'proficient', au_overseasExp: '5_7_years', au_australianExp: 'less_than_1',
    au_qualification: 'bachelor_master', au_specialist: 'no', au_study: 'no', au_professionalYear: 'no', au_communityLanguage: 'no', au_regionalStudy: 'no', au_partner: 'single_or_citizen',
  }
  const points = evaluate({ program: 'immigration', answers }).score!
  expect(readinessOf({ program: 'immigration', answers }, { ...rules, australiaMinPoints: points }, null).ready).toBe(true)
  const r = readinessOf({ program: 'immigration', answers }, { ...rules, australiaMinPoints: points + 1 }, null)
  expect(r.ready).toBe(false)
  expect(r.reasons[0].en).toBe(`Australia points ${points}, below ${points + 1}`)
})

test('saved rules fall back to the recommended ones when missing or out of range', () => {
  expect(mergeRules(null)).toEqual(rules)
  expect(mergeRules({ tourismMinScore: 55, canadaMinCrs: -3, tourismNoBank: 'no', jobSeekerFunds: false, extra: 1 }))
    .toEqual({ ...rules, tourismMinScore: 55, jobSeekerFunds: false })
})
