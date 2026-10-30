import { branches } from './branches'
import { consultants } from './consultants'
import { bookingConfig } from './booking'
import { pendingDecisions } from './pendingDecisions'
import { paymentConfig } from './payments'
import { contact } from './contact'

const allText = (o: unknown) => JSON.stringify(o)

describe('branches', () => {
  test('exactly three, no Qena', () => {
    expect(branches.map(b => b.id)).toEqual(['nasr-city', 'sheikh-zayed', 'dubai'])
    expect(allText(branches)).not.toMatch(/Qena|قنا/)
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
  test('only Mohamed Gamal has a title; no bios', () => {
    const titled = consultants.filter(c => c.title)
    expect(titled.map(c => c.id)).toEqual(['mohamed-gamal'])
    expect(titled[0].title!.en).toBe('Senior Immigration Specialist & Contract Manager')
    expect(consultants.every(c => c.bio === null)).toBe(true)
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
    expect(bookingConfig.durations).toEqual({ online: [15, 30], 'in-person': [30, 45] })
    expect(bookingConfig.autoConfirm).toBe(false)
    expect(bookingConfig.holdMinutes).toBe(30)
  })
  test('one shared payment config with two methods', () => {
    expect(paymentConfig.methods.map(m => m.id)).toEqual(['instapay', 'vodafone-cash'])
  })
})

test('pending decisions cover spec §9', () => {
  expect(pendingDecisions.length).toBeGreaterThanOrEqual(10)
  const ids = pendingDecisions.map(d => d.id)
  for (const id of ['payment-details', 'dubai-currency', 'policies', 'meeting-platform', 'integrations', 'esmail-spelling'])
    expect(ids).toContain(id)
})
