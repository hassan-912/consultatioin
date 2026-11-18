import { captureReferral, clearReferral, currentReferral } from './referral'

beforeEach(() => { clearReferral(); window.history.replaceState(null, '', '/') })

test('a sales link is remembered and only ref leaves the address; campaign tags stay', () => {
  captureReferral({ search: '?ref=ABCD1234&utm_source=facebook', hash: '#/', pathname: '/' })
  expect(currentReferral()).toBe('abcd1234')
  expect(window.location.search).toBe('?utm_source=facebook')
  expect(window.location.hash).toBe('#/')
})

test('a ref inside the hash route is removed without dropping the route or its other values', () => {
  captureReferral({ search: '', hash: '#/book/mohamed-gamal?ref=abcd1234&lang=en', pathname: '/' })
  expect(currentReferral()).toBe('abcd1234')
  expect(window.location.hash).toBe('#/book/mohamed-gamal?lang=en')
})

test('a malformed code is ignored', () => {
  captureReferral({ search: '?ref=bad', hash: '', pathname: '/' })
  expect(currentReferral()).toBeNull()
})
