import { useEffect, useState } from 'react'

// Reference rates for showing a booking's EGP price in AED / USD / EUR on the payment step. Same public provider
// as the file assessment (no key, no visitor data). Display only: finance verifies what actually arrived.
const PROVIDER = 'https://open.er-api.com/v6/latest/EGP'
export type ForeignCurrency = 'AED' | 'USD' | 'EUR'
export type EgpRatesOut = Record<ForeignCurrency, number>

let cached: { rates: EgpRatesOut; at: number } | null = null
let request: Promise<void> | null = null

function load() {
  return request ??= fetch(PROVIDER, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
    .then(r => { if (!r.ok) throw new Error('Rate unavailable'); return r.json() })
    .then((d: { result?: string; base_code?: string; rates?: Record<string, number> }) => {
      const r = d.rates ?? {}
      const ok = d.result === 'success' && d.base_code === 'EGP' && (['AED', 'USD', 'EUR'] as const).every(c => Number.isFinite(r[c]) && r[c] > 0)
      if (ok) cached = { rates: { AED: r.AED, USD: r.USD, EUR: r.EUR }, at: Date.now() }
    })
    .catch(() => undefined)
    .finally(() => { request = null })
}

/** Units of each currency per 1 EGP, or null while loading / unavailable. */
export function useEgpToForeign(enabled: boolean): EgpRatesOut | null {
  const [, rerender] = useState(0)
  useEffect(() => {
    if (!enabled || (cached && Date.now() - cached.at < 30 * 60 * 1000)) return
    let live = true
    void load()?.then(() => { if (live) rerender(n => n + 1) })
    return () => { live = false }
  }, [enabled])
  return enabled ? cached?.rates ?? null : null
}

/** Whole units, rounded up so the transfer is never short. */
export const convertEgp = (amount: number, rate: number) => Math.ceil(amount * rate)

/** Test helper. */
export function resetFxRates(next: EgpRatesOut | null = null) { cached = next ? { rates: next, at: Date.now() } : null; request = null }
