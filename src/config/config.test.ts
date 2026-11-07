import { branches } from './branches'
import { consultants as allConsultants } from './consultants'
// The hidden 5 EGP payment-test consultant isn't part of the company line-up.
const consultants = allConsultants.filter(c => !c.hidden)
import { bookingConfig } from './booking'
import { pendingDecisions } from './pendingDecisions'
import { defaultCurrency, payCurrencies, paymentMethodLabels } from './payments'
import { contact } from './contact'

const allText = (o: unknown) => JSON.stringify(o)

describe('branches', () => {
  test('four open branches, Qena included', () => {
    expect(branches.map(b => b.id)).toEqual(['nasr-city', 'sheikh-zayed', 'dubai', 'qena'])
    expect(branches.filter(b => b.comingSoon)).toEqual([])
    expect(branches.find(b => b.id === 'qena')!.address.en).toMatch(/Dendera Bridge Street/)
  })
  test('timezones', () => {
    expect(branches.find(b => b.id === 'dubai')!.timeZone).toBe('Asia/Dubai')
    expect(branches.find(b => b.id === 'nasr-city')!.timeZone).toBe('Africa/Cairo')
  })
  test('contact', () => {
    expect(contact.hotline).toBe('17621')
    expect(contact.email).toBe('Info@mg-visa.com')
  })
})

describe('consultants', () => {
  test('seven, no Wael, branch split 4/2/1', () => {
    expect(consultants).toHaveLength(7)
    expect(allText(consultants)).not.toMatch(/Wael|وائل/)
    const count = (id: string) => consultants.filter(c => c.branchId === id).length
    expect([count('nasr-city'), count('sheikh-zayed'), count('dubai')]).toEqual([4, 2, 1])
  })
  test('titles from the brief and mg-visa.com; every consultant has a bio in both languages', () => {
    expect(consultants.find(c => c.id === 'mohamed-gamal')!.title!.en).toBe('Senior Immigration Specialist & Contract Manager')
    expect(consultants.filter(c => c.id !== 'mohamed-gamal').every(c => c.title?.en === 'Immigration Specialist')).toBe(true)
    expect(consultants.every(c => c.bio?.ar.includes(c.name.ar) && c.bio.en.includes(c.name.en))).toBe(true)
  })
  test('Esmail spelling flagged', () => {
    expect(consultants.find(c => c.id === 'mohamed-esmail')!.nameNeedsConfirmation).toBe(true)
  })
  test('experience', () => {
    const exp = Object.fromEntries(consultants.map(c => [c.id, c.experienceYears]))
    expect(exp).toEqual({
      'mohamed-gamal': 5, 'ahmed-salama': 3, 'ahmed-khalil': 1.5, 'mohamed-esmail': 2,
      'ahmed-tarek': 3, 'mohamed-salah': 1.5, 'mohamed-abdelaziz': 2,
    })
    expect(consultants.find(c => c.id === 'ahmed-salama')!.experienceLabel?.en).toBe('3+')
  })
})

describe('booking & payments', () => {
  test('durations and flags', () => {
    expect(bookingConfig.durationRange).toEqual({ min: 15, max: 30 })
    expect(Object.values(bookingConfig.prices).flatMap(Object.values)).toEqual([1000, 1000])
    expect(bookingConfig.autoConfirm).toBe(false)
    expect(bookingConfig.holdMinutes).toBe(30)
  })
  test('online payment through EasyKash in four currencies; older methods keep their labels', () => {
    expect(payCurrencies).toEqual(['EGP', 'USD', 'EUR', 'AED'])
    expect([defaultCurrency('+201001234567'), defaultCurrency('+971501234567'), defaultCurrency('+447700900123')]).toEqual(['EGP', 'AED', 'USD'])
    expect(Object.keys(paymentMethodLabels)).toEqual(['easykash', 'instapay', 'vodafone-cash', 'bank-aed', 'bank-usd-eur'])
  })
})

test('pending decisions cover spec §9', () => {
  expect(pendingDecisions.length).toBeGreaterThanOrEqual(10)
  const ids = pendingDecisions.map(d => d.id)
  for (const id of ['payment-details', 'dubai-currency', 'policies', 'meeting-platform', 'integrations', 'esmail-spelling'])
    expect(ids).toContain(id)
})
