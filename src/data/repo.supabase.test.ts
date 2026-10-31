import { mapBooking, rpcFailure, STAFF_BOOKING_COLUMNS, receiptBlob } from './supabase'
import { HoldExpired, SlotTaken } from './types'

const row = {
 id: 'b1', reference: 'MG-ABCD-EFGH', qr_token: 'qr', manage_token: 'manage', consultant_id: 'mohamed-gamal',
 branch_id: 'nasr-city', format: 'online', starts_at: '2026-11-01T10:00:00+02:00', ends_at: '2026-11-01T10:30:00+02:00',
 tz: 'Africa/Cairo', price_amount: 1000, price_currency: 'EGP', status: 'on-hold', hold_expires_at: '2026-10-30T20:00:00Z',
 created_at: '2026-10-30T19:30:00Z', customer: { name: 'Sara', phone: '+201001234567', email: null, channel: 'whatsapp', lang: 'ar', program: 'immigration', note: null },
 payment: { method: 'instapay', txn_ref: 'TX1', submitted_at: '2026-10-30T19:35:00Z', has_receipt: true },
}
test('maps nested customer RPC JSON, timestamps and receipt metadata faithfully', () => {
 const b = mapBooking(row)
 expect(b.startIso).toBe('2026-11-01T08:00:00.000Z')
 expect(b.customer).toMatchObject({ consultationLang: 'ar', email: '', note: '' })
 expect(b.payment).toEqual({ method: 'instapay', txnRef: 'TX1', submittedAt: Date.parse('2026-10-30T19:35:00Z'), hasReceipt: true, receiptPath: undefined })
 expect(b.holdExpiresAt).toBe(Date.parse(row.hold_expires_at))
})
test('staff query never selects tokens and mapper ignores tokens on staff rows', () => {
 expect(STAFF_BOOKING_COLUMNS).not.toMatch(/manage_token|qr_token|\*/)
 expect(mapBooking(row, 'staff')).toMatchObject({ manageToken: '', qrToken: '' })
})
test('SQL errors retain actionable classes and permission codes', () => {
 expect(rpcFailure({ message: 'SLOT_TAKEN', code: 'P0001' })).toBeInstanceOf(SlotTaken)
 expect(rpcFailure({ message: 'HOLD_EXPIRED', code: 'P0001' })).toBeInstanceOf(HoldExpired)
 expect(rpcFailure({ message: 'FORBIDDEN', code: 'P0001' })).toMatchObject({ code: 'FORBIDDEN' })
})
test('compressed data URL decodes to upload bytes with MIME type', async () => {
 const b = await receiptBlob({ method: 'instapay', txnRef: 'TX1', receiptImage: 'data:image/png;base64,YWJj' })
 expect(b?.type).toBe('image/png')
 expect(b?.size).toBe(3)
})
