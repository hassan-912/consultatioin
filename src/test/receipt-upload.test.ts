import { describe, it, expect, vi } from 'vitest'
import { receiptHandler } from '../../supabase/functions/create-receipt-upload/handler'
const origin = 'https://example.com'
const capability = { booking_id: 'booking', path: 'booking/random.pdf' }
function setup() {
  const authorize = vi.fn(async () => capability)
  const sign = vi.fn(async () => ({ signedUrl: 'https://storage/upload', token: 'signed' }))
  return { authorize, sign, handler: receiptHandler({ siteUrl: origin, anonKey: 'anon', authorize, sign }) }
}
const request = (body: unknown, headers = {}) => new Request('https://edge/upload', { method: 'POST', headers: { origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
describe('private receipt endpoint', () => {
  it('authorizes before signing and returns a bucket-relative path', async () => {
    const { handler, authorize, sign } = setup()
    const response = await handler(request({ manage_token: 'a'.repeat(32), mime_type: 'application/pdf' }))
    expect(response.status).toBe(200)
    expect(authorize).toHaveBeenCalledWith('a'.repeat(32), 'pdf')
    expect(sign).toHaveBeenCalledWith(capability.path)
    expect(await response.json()).toMatchObject({ bucket: 'receipts', ...capability, token: 'signed' })
  })
  it.each(['image/svg+xml', 'text/plain', '', null])('rejects unsafe MIME %s', async mime_type => {
    const { handler, sign } = setup()
    expect((await handler(request({ manage_token: 'a'.repeat(32), mime_type }))).status).toBe(400)
    expect(sign).not.toHaveBeenCalled()
  })
  it('rejects untrusted origins and authenticated contexts', async () => {
    const { handler, authorize } = setup()
    expect((await handler(request({}, { origin: 'https://evil.example' }))).status).toBe(403)
    expect((await handler(request({}, { authorization: 'Bearer staff-jwt' }))).status).toBe(403)
    expect(authorize).not.toHaveBeenCalled()
  })
  it('does not sign when capability validation fails', async () => {
    const { handler, authorize, sign } = setup()
    authorize.mockRejectedValueOnce(new Error('NOT_FOUND'))
    expect((await handler(request({ manage_token: 'a'.repeat(32), mime_type: 'image/jpeg' }))).status).toBe(404)
    expect(sign).not.toHaveBeenCalled()
  })
  it('limits actual request bytes, even without content-length', async () => {
    const { handler, authorize } = setup()
    expect((await handler(request({ padding: 'x'.repeat(3000) }))).status).toBe(413)
    expect(authorize).not.toHaveBeenCalled()
  })
  it('handles preflight without signing', async () => {
    const { handler, sign } = setup()
    const response = await handler(new Request('https://edge/upload', { method: 'OPTIONS', headers: { origin } }))
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(origin)
    expect(sign).not.toHaveBeenCalled()
  })
})
