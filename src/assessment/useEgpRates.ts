import { useEffect, useState } from 'react'
import { parseEgpRates, type EgpRates } from './calculator/exchange-rates'

// Same public provider and validation as the Visa File Strength Calculator (app/api/exchange-rates). It allows
// browser requests directly, so no server route is needed. Only staff screens load this; customers never do.
const PROVIDER = 'https://open.er-api.com/v6/latest/EUR'
const REFRESH_MS = 15 * 60 * 1000

let cached: EgpRates | null = null
let failed = false
let request: Promise<void> | null = null
let lastAttempt = 0
const listeners = new Set<() => void>()

function refresh() {
  if (request || Date.now() - lastAttempt < 60000) return request
  lastAttempt = Date.now()
  request = fetch(PROVIDER, { cache: 'no-store', signal: AbortSignal.timeout(12000) })
    .then(r => { if (!r.ok) throw new Error('Rate unavailable'); return r.json() })
    .then(data => { cached = parseEgpRates(data); failed = false })
    .catch(() => { failed = true })
    .finally(() => { request = null; listeners.forEach(fn => fn()) })
  return request
}

/** Live EUR/SEK → EGP rates; refreshes every 15 minutes and when the tab regains focus. */
export function useEgpRates(enabled = true) {
  const [, rerender] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const update = () => rerender(n => n + 1)
    listeners.add(update)
    const stale = !cached || Date.now() - Date.parse(cached.updatedAt) > REFRESH_MS
    if (stale) void refresh()
    const whenVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    const timer = window.setInterval(whenVisible, REFRESH_MS)
    window.addEventListener('focus', whenVisible)
    document.addEventListener('visibilitychange', whenVisible)
    return () => {
      listeners.delete(update)
      window.clearInterval(timer)
      window.removeEventListener('focus', whenVisible)
      document.removeEventListener('visibilitychange', whenVisible)
    }
  }, [enabled])
  return { rates: cached, error: failed && !cached }
}

/** Test helper. */
export function resetEgpRates(next: EgpRates | null = null) { cached = next; failed = false; request = null; lastAttempt = 0 }
