import type { L10n } from '../domain/types'
import type { EgpRates } from './calculator/exchange-rates'
import { evaluate } from './evaluate'
import type { StoredAssessment } from './questions'

/**
 * Is the client ready for this program? If not, they don't pay: the request goes to the sales manager, who calls
 * them. The admin edits these numbers (Not ready → Rules). The check runs in the browser: someone who bypasses it
 * only ends up paying for a consultation, so it needs no server copy.
 */
export interface ReadinessRules {
  /** Tourism: file strength below this (0–100) is not ready. */
  tourismMinScore: number
  /** Tourism: no bank account at all. */
  tourismNoBank: boolean
  /** Tourism: an Egyptian account with less than 250,000. */
  tourismLowBank: boolean
  /** Tourism: has stayed in a country longer than their visa allowed. */
  tourismOverstay: boolean
  /** Australia: points below this (65 is the legal minimum). */
  australiaMinPoints: number
  /** Canada: CRS points below this. */
  canadaMinCrs: number
  /** Job seeking: not enough money in the bank for that country. */
  jobSeekerFunds: boolean
  /** Job seeking: more than this many other problems in the answers. */
  jobSeekerMaxIssues: number
}

export const defaultReadinessRules: ReadinessRules = {
  tourismMinScore: 60, tourismNoBank: true, tourismLowBank: true, tourismOverstay: true,
  australiaMinPoints: 65, canadaMinCrs: 380, jobSeekerFunds: true, jobSeekerMaxIssues: 2,
}

const numberKeys = ['tourismMinScore', 'australiaMinPoints', 'canadaMinCrs', 'jobSeekerMaxIssues'] as const
const flagKeys = ['tourismNoBank', 'tourismLowBank', 'tourismOverstay', 'jobSeekerFunds'] as const
export const ruleLimits: Record<(typeof numberKeys)[number], [number, number]> = {
  tourismMinScore: [0, 100], australiaMinPoints: [0, 200], canadaMinCrs: [0, 1200], jobSeekerMaxIssues: [0, 20],
}

/** Saved rules on top of the defaults; anything missing or out of range falls back to the default. */
export function mergeRules(saved: unknown): ReadinessRules {
  const r: ReadinessRules = { ...defaultReadinessRules }
  if (!saved || typeof saved !== 'object') return r
  const s = saved as Record<string, unknown>
  for (const k of numberKeys) {
    const v = s[k]; const [lo, hi] = ruleLimits[k]
    if (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi) r[k] = v
  }
  for (const k of flagKeys) if (typeof s[k] === 'boolean') r[k] = s[k] as boolean
  return r
}

export interface Readiness {
  ready: boolean
  /** Why not, for the sales manager. Empty when ready. */
  reasons: L10n[]
  score: number | null
  max: number | null
  title: L10n
}

const L = (en: string, ar: string): L10n => ({ en, ar })
const RATES_ISSUE = 'The currency rate is unavailable'

export function readinessOf(s: StoredAssessment, rules: ReadinessRules, fx: EgpRates | null): Readiness {
  const r = evaluate(s, fx)
  const a = s.answers
  const reasons: L10n[] = []
  if (s.program === 'tourism') {
    if (r.score !== null && r.score < rules.tourismMinScore) reasons.push(L(`File strength ${r.score}/100, below ${rules.tourismMinScore}`, `قوة الملف ${r.score}/100، أقل من ${rules.tourismMinScore}`))
    if (rules.tourismNoBank && a.bank === 'bank_opt_4') reasons.push(L('No bank account', 'لا يوجد حساب بنكي'))
    if (rules.tourismLowBank && a.bank === 'bank_opt_5') reasons.push(L('Egyptian account with less than 250,000 EGP', 'حساب بالجنيه برصيد أقل من 250 ألف جنيه'))
    if (rules.tourismOverstay && a.personal_overstay === 'yes') reasons.push(L('Stayed longer than a visa allowed before', 'سبق له تجاوز مدة التأشيرة'))
  } else if (s.program === 'immigration') {
    const australia = a.destination === 'australia'
    const min = australia ? rules.australiaMinPoints : rules.canadaMinCrs
    if (r.score !== null && r.score < min) {
      reasons.push(australia
        ? L(`Australia points ${r.score}, below ${min}`, `نقاط أستراليا ${r.score}، أقل من ${min}`)
        : L(`Canada CRS ${r.score}, below ${min}`, `نقاط CRS لكندا ${r.score}، أقل من ${min}`))
    }
  } else {
    // A missing exchange rate is our problem, not the client's: it never counts against them.
    const issues = r.issues.filter(i => !i.startsWith(RATES_ISSUE))
    const funds = issues.filter(i => i.startsWith('Your bank balance is short'))
    const others = issues.filter(i => !funds.includes(i))
    if (rules.jobSeekerFunds) funds.forEach(i => reasons.push(L(i, `رصيد البنك غير كافٍ: ${i.replace('Your bank balance is short by ', 'ينقصه ').replace(/\.$/, '')}`)))
    if (others.length > rules.jobSeekerMaxIssues) reasons.push(L(`${others.length} problems: ${others.join(' ')}`, `${others.length} مشكلات في الملف: ${others.join(' ')}`))
  }
  return { ready: reasons.length === 0, reasons, score: r.score, max: r.max, title: r.title }
}
