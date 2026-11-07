import { branches } from './branches'
import { consultants } from './consultants'
import { bookingConfig } from './booking'
import { pendingDecisions } from './pendingDecisions'
import { paymentConfig } from './payments'
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
  test('Egypt wallets plus two bank accounts for customers abroad', () => {
    expect(paymentConfig.methods.map(m => [m.id, m.region])).toEqual([['instapay', 'egypt'], ['vodafone-cash', 'egypt'], ['bank-aed', 'international'], ['bank-usd-eur', 'international']])
    expect(paymentConfig.methods.filter(m => m.placeholder)).toEqual([])
    expect(paymentConfig.methods.find(m => m.id === 'vodafone-cash')!.fields[0].value).toBe('01032935257')
  })
})

test('pending decisions cover spec §9', () => {
  expect(pendingDecisions.length).toBeGreaterThanOrEqual(10)
  const ids = pendingDecisions.map(d => d.id)
  for (const id of ['payment-details', 'dubai-currency', 'policies', 'meeting-platform', 'integrations', 'esmail-spelling'])
    expect(ids).toContain(id)
})
