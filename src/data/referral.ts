// Sales referral links: https://site/?ref=CODE (or #/...?ref=CODE). The code is remembered in this browser for
// 30 days and attached to the next booking the customer makes. It is a convenience, not a security boundary.
const KEY = 'mg-referral'
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const CODE = /^[a-z0-9]{8}$/

/** Reads ?ref= from the address once at start-up, remembers it, and removes it from the address bar. */
export function captureReferral(loc: Pick<Location, 'search' | 'hash' | 'pathname'> = window.location) {
  const fromSearch = new URLSearchParams(loc.search).get('ref')
  const hashQuery = loc.hash.includes('?') ? loc.hash.slice(loc.hash.indexOf('?') + 1) : ''
  const code = (fromSearch ?? new URLSearchParams(hashQuery).get('ref') ?? '').trim().toLowerCase()
  if (!CODE.test(code)) return
  try { localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() })) } catch { /* private mode: link still works this visit */ }
  memory = code
  try {
    const hash = hashQuery ? loc.hash.slice(0, loc.hash.indexOf('?')) : loc.hash
    history.replaceState(history.state, '', `${loc.pathname}${hash || '#/'}`)
  } catch { /* cosmetic only */ }
}

let memory: string | null = null

export function currentReferral(): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { code?: string; at?: number } | null
    if (saved?.code && CODE.test(saved.code) && Date.now() - (saved.at ?? 0) < MAX_AGE_MS) return saved.code
  } catch { /* fall through */ }
  return memory
}

export function clearReferral() {
  memory = null
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

/** The public link a sales person shares. */
export function referralLink(code: string): string {
  const site = import.meta.env.VITE_SITE_URL || `${window.location.origin}${window.location.pathname}`
  const url = new URL(site)
  url.search = `?ref=${code}`
  url.hash = '/'
  return url.toString()
}

/** Prototype only: a stable code derived from the username (the live code comes from the database). */
export function localReferralCode(username: string): string {
  let h = 2166136261
  for (const ch of username) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(36).padStart(8, '0').slice(-8)
}
