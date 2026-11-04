import { createHmac } from 'node:crypto'
import { easykashHandler, signature, SIGNED_FIELDS, type Dependencies } from '../../supabase/functions/easykash-webhook/handler'

const secret = 'hmac-test-secret'
const paid = {
  ProductCode: 'EDV4471', Amount: '11.00', ProductType: 'Direct Pay', PaymentMethod: 'Cash Through Fawry', status: 'PAID',
  easykashRef: '2911105009', customerReference: 'TEST11111', BuyerName: 'Sara', Timestamp: '1626166791',
}
// Independent reference: the HMAC from EasyKash's Node.js sample.
const sign = (p: Record<string, string>) => createHmac('sha512', secret).update(SIGNED_FIELDS.map(f => p[f]).join('')).digest('hex')

function setup(over: Partial<Dependencies> = {}) {
  const deps = { config: { hmacSecret: secret }, record: vi.fn().mockResolvedValue(true), log: vi.fn(), ...over } satisfies Dependencies
  const url = 'https://x.supabase.co/functions/v1/easykash-webhook'
  const get = (params: Record<string, string> = {}) => easykashHandler(deps)(new Request(`${url}?${new URLSearchParams(params)}`))
  const post = (body: unknown) => easykashHandler(deps)(new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
  return { deps, get, post }
}

test('signature matches EasyKash’s documented algorithm, in field order', async () => {
  expect(SIGNED_FIELDS.map(f => paid[f]).join('')).toBe('EDV447111.00Direct PayCash Through FawryPAID2911105009TEST11111')
  expect(await signature(paid, secret)).toBe(sign(paid))
})

test('a plain GET (EasyKash’s URL check, Postman) answers 200 and records nothing', async () => {
  const { deps, get } = setup()
  const res = await get()
  expect(res.status).toBe(200)
  expect(deps.record).not.toHaveBeenCalled()
  // Works before the secret is set, so the URL can be saved in EasyKash first.
  expect((await setup({ config: {} }).get()).status).toBe(200)
})

test('a signed GET callback is recorded with its values as sent', async () => {
  const { deps, get } = setup()
  const res = await get({ ...paid, signatureHash: sign(paid), unexpected: 'dropped' })
  expect(res.status).toBe(200)
  expect(deps.record).toHaveBeenCalledWith({ ...paid, signatureHash: sign(paid) })
})

test('a signed POST JSON callback is recorded too', async () => {
  const { deps, post } = setup()
  expect((await post({ ...paid, signatureHash: sign(paid) })).status).toBe(200)
  expect(deps.record).toHaveBeenCalledTimes(1)
})

test('forged or altered callbacks change nothing', async () => {
  const { deps, get } = setup()
  expect((await get({ ...paid, signatureHash: 'f'.repeat(128) })).status).toBe(401)
  expect((await get({ ...paid, Amount: '1.00', signatureHash: sign(paid) })).status).toBe(401)
  expect((await get({ ...paid })).status).toBe(400)
  expect(deps.record).not.toHaveBeenCalled()
})

test('payment details without a configured secret are refused, not trusted', async () => {
  const { deps, get } = setup({ config: {} })
  expect((await get({ ...paid, signatureHash: sign(paid) })).status).toBe(503)
  expect(deps.record).not.toHaveBeenCalled()
})

test('other methods are refused; a failed save asks EasyKash to retry', async () => {
  const { deps } = setup({ record: vi.fn().mockRejectedValue(new Error('db')) })
  const handler = easykashHandler(deps)
  expect((await handler(new Request('https://x.example/', { method: 'PUT' }))).status).toBe(405)
  const res = await handler(new Request(`https://x.example/?${new URLSearchParams({ ...paid, signatureHash: sign(paid) })}`))
  expect(res.status).toBe(500)
})
