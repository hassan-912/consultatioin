import { useLocation } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { safePath, safeUrl } from './safeUrl'

// Vercel Web Analytics (visits per page) and Speed Insights (load speed for real visitors).
// Every event's address is rebuilt from the current page with private codes replaced; staff screens send nothing.
const clean = <E extends { url: string }>(e: E): E | null => {
  const url = safeUrl(window.location.href)
  return url ? { ...e, url } : null
}

export function SiteAnalytics() {
  const path = safePath(useLocation().pathname)
  return (
    <>
      <Analytics route={path} path={path} beforeSend={clean} />
      <SpeedInsights route={path ?? undefined} beforeSend={e => { const c = clean(e); return c ? { ...c, route: path ?? undefined } : null }} />
    </>
  )
}
