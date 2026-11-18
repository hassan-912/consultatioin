import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { useAppStore } from '../store/useAppStore'

/** The MG logo link: back to the start, where the visitor picks their location again. */
export function HomeLink({ children, className }: { children: ReactNode; className?: string }) {
  const { t } = useT()
  const setLocation = useAppStore(s => s.setLocation)
  return (
    <Link to="/" aria-label={t('nav.home')} className={className} onClick={() => setLocation(null)}>
      {children}
    </Link>
  )
}
