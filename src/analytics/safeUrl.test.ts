import { safePath, safeUrl } from './safeUrl'

test('public pages keep their name; consultant ids are public and stay', () => {
  expect(safePath('/')).toBe('/')
  expect(safePath('/consultant/mohamed-gamal')).toBe('/consultant/mohamed-gamal')
  expect(safePath('/book/ahmed-salama')).toBe('/book/ahmed-salama')
  expect(safePath('/find')).toBe('/find')
  expect(safePath('/team')).toBe('/team')
})

test('private ticket, booking and meeting codes are replaced', () => {
  expect(safePath('/ticket/abc123secret')).toBe('/ticket/[token]')
  expect(safePath('/booking/abc123secret')).toBe('/booking/[token]')
  expect(safePath('/booking/abc123secret/assessment')).toBe('/booking/[token]/assessment')
  expect(safePath('/meet/abc123secret')).toBe('/meet/[token]')
})

test('query values (payment ids, sales codes) are dropped', () => {
  expect(safePath('/pay/return?token=secret&id=9')).toBe('/pay/return')
})

test('staff screens are not tracked', () => {
  expect(safePath('/staff')).toBeNull()
  expect(safePath('/staff/bookings')).toBeNull()
})

test('an unknown address is not sent as typed', () => {
  expect(safePath('/something/odd123')).toBe('/[other]')
})

test('safeUrl reads the page from the # part of the address and drops everything private', () => {
  expect(safeUrl('https://consultatioin.vercel.app/?ref=ab12cd34#/ticket/secret?x=1')).toBe('https://consultatioin.vercel.app/ticket/[token]')
  expect(safeUrl('https://consultatioin.vercel.app/')).toBe('https://consultatioin.vercel.app/')
  expect(safeUrl('https://consultatioin.vercel.app/#/staff/payments')).toBeNull()
})
