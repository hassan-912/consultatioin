import { buildConfirmationMessage, whatsappLink } from './whatsappMessage'
import type { Booking } from '../../../domain/types'

const b = (over: Partial<Booking> = {}): Booking => ({
  id: 'b1', reference: 'MG-ABCD-EFGH', qrToken: 'q'.repeat(32), manageToken: 'm'.repeat(32),
  consultantId: 'mohamed-gamal', branchId: 'nasr-city', format: 'in-person', durationMin: 30,
  startIso: '2026-11-02T08:00:00.000Z', endIso: '2026-11-02T08:30:00.000Z', tz: 'Africa/Cairo',
  price: { amount: 1000, currency: 'EGP' },
  customer: { name: 'Sara Ali', phone: '+201001234567', email: 's@e.com', channel: 'whatsapp', consultationLang: 'ar', program: 'immigration', note: '' },
  status: 'confirmed', holdExpiresAt: 0, createdAt: 0, ...over,
})

const link = 'https://example.test/#/booking/mmmm'

test('English message greets the customer, names the sender and confirms the booking', () => {
  const m = buildConfirmationMessage(b(), 'en', 'Mona', link)
  expect(m).toMatch(/^Hello Sara Ali/)
  expect(m).toContain('This is Mona from the MG International finance team')
  expect(m).toMatch(/confirmed/i)
  expect(m).toContain('MG-ABCD-EFGH')
  expect(m).toContain('Mohamed Gamal')
  expect(m).toContain('Makram Ebeid')
  expect(m).toMatch(/ticket is attached as a PDF/i)
  expect(m).toContain(link)
  expect(m).toContain('17621')
})

test('Arabic message uses Arabic text and the Arabic consultant name', () => {
  const m = buildConfirmationMessage(b(), 'ar', 'منى', link)
  expect(m).toMatch(/^مرحبًا Sara Ali/)
  expect(m).toContain('معك منى من فريق المالية')
  expect(m).toContain('محمد جمال')
  expect(m).toContain('MG-ABCD-EFGH')
  expect(m).not.toMatch(/[٠-٩]/)
})

test('online bookings point to the join button instead of an address', () => {
  const m = buildConfirmationMessage(b({ format: 'online' }), 'en', 'Mona', link)
  expect(m).not.toContain('Makram Ebeid')
  expect(m).toMatch(/Join consultation/)
})

test('WhatsApp link uses the international number without + and encodes the text', () => {
  expect(whatsappLink('+201001234567', 'Hi & bye')).toBe('https://wa.me/201001234567?text=Hi%20%26%20bye')
})
