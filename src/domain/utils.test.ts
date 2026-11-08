import { makeReference, makeToken } from './ids'
import { normalizeDigits, validatePhone, validateEmail, cleanPhone } from './phone'
import { formatInZone, localEquivalent, zonedDateTimeToIso, zoneLabel, dateInZone } from './time'
import { priceFor } from './pricing'

describe('ids', () => {
  test('references are unique and readable', () => {
    const refs = new Set(Array.from({ length: 1000 }, makeReference))
    expect(refs.size).toBe(1000)
    for (const r of refs) expect(r).toMatch(/^MG-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
  })
  test('tokens are 128-bit hex', () => {
    expect(makeToken()).toMatch(/^[0-9a-f]{32}$/)
    expect(makeToken()).not.toBe(makeToken())
  })
})

describe('phone & email', () => {
  test('Arabic-Indic digits are normalised', () => {
    expect(normalizeDigits('+٢٠١٠٠١٢٣٤٥٦٧')).toBe('+201001234567')
    expect(normalizeDigits('۰۱۲')).toBe('012')
  })
  test('country code required', () => {
    expect(validatePhone('٠١٠٠١٢٣٤٥٦٧')).toBe(false)
    expect(validatePhone('+20 100 123 4567')).toBe(true)
    expect(validatePhone('+٢٠١٠٠١٢٣٤٥٦٧')).toBe(true)
    expect(cleanPhone('+20 (100) 123-4567')).toBe('+201001234567')
  })
  test('email', () => {
    expect(validateEmail('sara@example.com')).toBe(true)
    expect(validateEmail('sara@')).toBe(false)
  })
})

describe('time', () => {
  test('Cairo DST: summer is UTC+3, winter UTC+2', () => {
    expect(zonedDateTimeToIso('2026-07-15', 600, 'Africa/Cairo')).toBe('2026-07-15T07:00:00.000Z')
    expect(zonedDateTimeToIso('2026-12-15', 600, 'Africa/Cairo')).toBe('2026-12-15T08:00:00.000Z')
    expect(zonedDateTimeToIso('2026-12-15', 600, 'Asia/Dubai')).toBe('2026-12-15T06:00:00.000Z')
  })
  test('local equivalent flags a different calendar day', () => {
    expect(localEquivalent('2026-07-15T20:00:00Z', 'Africa/Cairo', 'Asia/Tokyo', 'en').differentDay).toBe(true)
    expect(localEquivalent('2026-07-15T10:00:00Z', 'Africa/Cairo', 'Europe/London', 'en').differentDay).toBe(false)
  })
  test('Arabic formatting uses Western digits', () => {
    const s = formatInZone('2026-07-15T07:00:00Z', 'Africa/Cairo', 'ar')
    expect(s).toMatch(/10/)
    expect(s).not.toMatch(/[٠-٩]/)
  })
  test('zone label and date in zone', () => {
    expect(zoneLabel('Asia/Dubai', 'en')).toMatch(/Dubai time/)
    expect(dateInZone('2026-07-15T22:30:00Z', 'Africa/Cairo')).toBe('2026-07-16')
  })
})

describe('pricing', () => {
  test('price by format and duration', () => {
    // Every consultation is a fixed 45 minutes.
    expect(priceFor('online', 45)).toEqual({ amount: 1000, currency: 'EGP' })
    expect(priceFor('in-person', 45)).toEqual({ amount: 1000, currency: 'EGP' })
    expect(() => priceFor('online', 30)).toThrow()
  })
})
