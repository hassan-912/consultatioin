// The site keeps the page after # (hash routing), and some of those addresses carry private codes
// (ticket, booking and meeting links). Analytics only ever gets the page name, with codes replaced.

const PUBLIC: RegExp[] = [/^\/$/, /^\/consultant\/[a-z0-9-]+$/, /^\/book\/[a-z0-9-]+$/, /^\/find$/, /^\/team$/, /^\/pay\/return$/]
const PRIVATE: [RegExp, string][] = [
  [/^\/ticket\/[^/]+$/, '/ticket/[token]'],
  [/^\/booking\/[^/]+\/assessment$/, '/booking/[token]/assessment'],
  [/^\/booking\/[^/]+\/room$/, '/booking/[token]/room'],
  [/^\/booking\/[^/]+$/, '/booking/[token]'],
  [/^\/meet\/[^/]+$/, '/meet/[token]'],
]

/** The page name to report, or null for pages that are never tracked (staff screens). */
export function safePath(path: string): string | null {
  const p = (path.split('?')[0] || '/').replace(/\/+$/, '') || '/'
  if (p === '/staff' || p.startsWith('/staff/')) return null
  if (PUBLIC.some(r => r.test(p))) return p
  for (const [r, name] of PRIVATE) if (r.test(p)) return name
  return '/[other]'
}

/** A full address made safe to send: origin plus the page name, nothing else. */
export function safeUrl(href: string): string | null {
  const u = new URL(href)
  const path = safePath(u.hash.replace(/^#/, '') || '/')
  return path === null ? null : `${u.origin}${path}`
}
