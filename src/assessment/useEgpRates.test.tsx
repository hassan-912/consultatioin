import { renderHook, waitFor } from '@testing-library/react'
import { resetEgpRates, useEgpRates } from './useEgpRates'

const payload = (egp: number, sek: number) => {
  const now = Math.floor(Date.now() / 1000)
  return { result: 'success', base_code: 'EUR', rates: { EGP: egp, SEK: sek }, time_last_update_unix: now - 60, time_next_update_unix: now + 86400 }
}

afterEach(() => { vi.unstubAllGlobals(); resetEgpRates() })

test('loads live EUR and SEK rates in EGP from the same provider as the calculator', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload(52, 11) })
  vi.stubGlobal('fetch', fetchMock)
  const { result } = renderHook(() => useEgpRates())
  await waitFor(() => expect(result.current.rates).not.toBeNull())
  expect(fetchMock.mock.calls[0][0]).toBe('https://open.er-api.com/v6/latest/EUR')
  expect(result.current.rates!.rates.EUR).toBe(52)
  expect(result.current.rates!.rates.SEK).toBeCloseTo(52 / 11)
})

test('reports an error when the provider fails, and does not call it when disabled', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
  vi.stubGlobal('fetch', fetchMock)
  renderHook(() => useEgpRates(false))
  expect(fetchMock).not.toHaveBeenCalled()
  const { result } = renderHook(() => useEgpRates())
  await waitFor(() => expect(result.current.error).toBe(true))
  expect(result.current.rates).toBeNull()
})
