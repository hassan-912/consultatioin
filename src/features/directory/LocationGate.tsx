import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useT } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { branchById } from '../../config/branches'
import { contact } from '../../config/contact'
import type { BranchId, L10n } from '../../domain/types'
import { Logo } from '../../components/Logo'
import { LangSwitch } from '../../components/LangSwitch'
import { Icon } from '../../components/Icon'
import { WorldRoutes, useRoutePhase } from './WorldRoutes'

/** The four places a visitor can start from, in MG's order. UAE is the Dubai branch. */
export const LOCATIONS: { id: BranchId; name?: L10n; sub?: L10n; country: L10n }[] = [
  { id: 'dubai', name: { en: 'UAE', ar: 'الإمارات' }, sub: { en: 'Dubai branch', ar: 'فرع دبي' }, country: { en: 'United Arab Emirates', ar: 'الإمارات' } },
  { id: 'nasr-city', country: { en: 'Egypt', ar: 'مصر' } },
  { id: 'sheikh-zayed', name: { en: 'Zayed', ar: 'زايد' }, country: { en: 'Egypt', ar: 'مصر' } },
  { id: 'qena', country: { en: 'Egypt', ar: 'مصر' } },
]
export const locationName = (id: BranchId): L10n => LOCATIONS.find(x => x.id === id)?.name ?? branchById(id).name

/** Full-screen welcome: pick a branch on each page load before browsing consultants. */
export function LocationGate() {
  const { t, l, lang } = useT()
  const setLocation = useAppStore(s => s.setLocation)
  const setFilters = useAppStore(s => s.setFilters)
  const [phase, cycle] = useRoutePhase()
  const first = useRef<HTMLButtonElement>(null)
  const other = lang === 'ar' ? 'en' : 'ar'

  useEffect(() => {
    first.current?.focus({ preventScroll: true })
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const choose = (id: BranchId) => {
    setFilters({ branch: id })
    setLocation(id)
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="gate-title" className="fixed inset-0 z-50 overflow-x-hidden overflow-y-auto bg-slate-deep text-white">
      <div className="grain pointer-events-none absolute inset-0" aria-hidden />
      <div className="pointer-events-none absolute -top-48 start-1/2 size-[640px] -translate-x-1/2 rounded-full bg-navy/70 blur-3xl rtl:translate-x-1/2" aria-hidden />
      <div className="pointer-events-none absolute -bottom-40 -end-24 size-[420px] rounded-full bg-gold/10 blur-3xl" aria-hidden />
      <WorldRoutes phase={phase} cycle={cycle} className="pointer-events-none absolute inset-x-0 top-24 mx-auto h-auto max-h-[420px] w-full max-w-5xl opacity-25" />

      <div className="relative mx-auto flex min-h-dvh max-w-4xl flex-col px-4 pb-8 pt-5 sm:px-6">
        <div className="flex items-center justify-between">
          <Logo className="h-9" />
          <LangSwitch tone="dark" />
        </div>

        <div className="flex flex-1 flex-col justify-center py-10">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('gate.eyebrow')}</p>
            <h1 id="gate-title" className="mt-3 max-w-[18ch] text-4xl font-semibold leading-[1.08] sm:text-5xl">{t('gate.title')}</h1>
            <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-mist">{t('gate.subtitle')}</p>
          </motion.div>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {LOCATIONS.map((loc, i) => {
              const branch = branchById(loc.id)
              const name = loc.name ?? branch.name
              const sub = loc.sub ?? branch.city
              return (
                <motion.li key={loc.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 + i * 0.07, duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}>
                  <button
                    ref={i === 0 ? first : undefined}
                    type="button"
                    onClick={() => choose(loc.id)}
                    className="group relative flex min-h-[132px] w-full items-end justify-between gap-4 overflow-hidden rounded-3xl bg-white/[0.06] p-5 text-start ring-1 ring-white/12 backdrop-blur-sm transition duration-300 hover:-translate-y-0.5 hover:bg-white/[0.1] hover:ring-gold/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  >
                    <span className="absolute inset-x-5 top-5 flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-mist">{l(loc.country)}</span>
                      {branch.comingSoon && <span className="rounded-full bg-gold/15 px-2.5 py-0.5 text-[11px] font-semibold text-gold ring-1 ring-gold/30">{t('gate.soon')}</span>}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-display text-3xl font-semibold leading-none">{l(name)}</span>
                      <span className="mt-2 block text-sm text-mist">
                        {l(sub)} <span aria-hidden className="mx-1 text-white/30">·</span>
                        <span lang={other} dir={other === 'ar' ? 'rtl' : 'ltr'} className="text-white/60">{name[other]}</span>
                      </span>
                    </span>
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 text-white transition-colors group-hover:bg-gold group-hover:text-ink">
                      <Icon name="arrow" size={18} />
                    </span>
                  </button>
                </motion.li>
              )
            })}
          </ul>
        </div>

        <p className="text-center text-xs text-mist">
          {t('gate.help')} <a href={`tel:${contact.hotline}`} className="font-semibold text-white underline-offset-2 hover:underline"><bdi dir="ltr">{contact.hotline}</bdi></a>
        </p>
      </div>
    </div>
  )
}
