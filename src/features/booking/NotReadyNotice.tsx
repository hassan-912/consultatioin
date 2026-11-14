import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { Icon } from '../../components/Icon'

/** Shown instead of payment when the client isn't ready for the program yet. Nothing is reserved or charged. */
export function NotReadyNotice() {
  const { t } = useT()
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <section role="status" aria-labelledby="not-ready-title" className="rounded-[1.5rem] bg-white p-6 text-center shadow-[var(--shadow-card)] ring-1 ring-line sm:p-8">
        <span className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-gold-soft text-gold-deep"><Icon name="phone" size={26} /></span>
        <h2 id="not-ready-title" className="font-display text-2xl font-semibold text-ink">{t('booking.notReadyTitle')}</h2>
        <p className="mt-3 text-lg text-slate">{t('booking.notReadyBody')}</p>
        <p className="mt-2 text-sm text-muted">{t('booking.notReadyNote')}</p>
        <Link to="/" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate px-5 font-semibold text-white hover:bg-slate-deep">
          {t('booking.notReadyHome')}
        </Link>
      </section>
    </main>
  )
}
