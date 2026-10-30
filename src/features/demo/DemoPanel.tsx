import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useT } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { applyEvent, resetDemo, skipTime } from '../../store/actions'
import { canApply, type BookingEvent } from '../../domain/bookingStatus'
import { Icon } from '../../components/Icon'
import { Ltr, StatusChip } from '../../components/ui'

/** Prototype-only controls to act out finance, reception and the passage of time. */
export function DemoPanel() {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const latest = useAppStore(s => (s.lastCustomerBookingId ? s.bookings[s.lastCustomerBookingId] : undefined))

  const actions: { label: string; e: BookingEvent; actor: 'finance' | 'consultant' }[] = [
    { label: t('demoPanel.verify'), e: { type: 'verify' }, actor: 'finance' },
    { label: t('demoPanel.reject'), e: { type: 'reject', reason: t('demoPanel.reject') }, actor: 'finance' },
    { label: t('demoPanel.wrongAmount'), e: { type: 'wrong-amount' }, actor: 'finance' },
    { label: t('demoPanel.complete'), e: { type: 'complete' }, actor: 'consultant' },
    { label: t('demoPanel.noShow'), e: { type: 'no-show' }, actor: 'consultant' },
  ]

  const btn = 'flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-start text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-35 disabled:hover:bg-transparent'

  return (
    <div className="fixed bottom-24 end-3 z-40 sm:bottom-6 sm:end-6">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            className="mb-3 w-72 rounded-2xl bg-ink/95 p-3 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur"
            role="region"
            aria-label={t('demoPanel.title')}
          >
            <p className="px-1 text-sm font-semibold">{t('demoPanel.title')}</p>
            <p className="mb-3 px-1 text-xs text-mist">{t('demoPanel.hint')}</p>
            {latest ? (
              <div className="mb-2 rounded-xl bg-white/5 px-3 py-2 text-xs">
                <p className="text-mist">{t('demoPanel.latest')}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <Ltr className="font-semibold">{latest.reference}</Ltr>
                  <StatusChip status={latest.status} />
                </div>
              </div>
            ) : (
              <p className="mb-2 px-1 text-xs text-mist">{t('demoPanel.noBooking')}</p>
            )}
            {actions.map(a => (
              <button key={a.label} type="button" className={btn} disabled={!latest || !canApply(latest, a.e.type)} onClick={() => latest && applyEvent(latest.id, a.e, a.actor)}>
                <Icon name="check" size={15} className="text-gold" />
                {a.label}
              </button>
            ))}
            <button type="button" className={btn} onClick={() => skipTime(31 * 60000)}>
              <Icon name="clock" size={15} className="text-gold" />
              {t('demoPanel.skip')}
            </button>
            <button type="button" className={`${btn} mt-1 border-t border-white/10 pt-1`} onClick={() => window.confirm(`${t('demoPanel.reset')}?`) && resetDemo()}>
              <Icon name="history" size={15} className="text-mist" />
              {t('demoPanel.reset')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={t('demoPanel.title')}
        className="ms-auto flex min-h-12 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-white shadow-xl ring-1 ring-white/15 hover:bg-slate-deep"
      >
        <Icon name={open ? 'x' : 'settings'} size={17} className="text-gold" />
        <span className="hidden sm:inline">{t('demoPanel.title')}</span>
      </button>
    </div>
  )
}
