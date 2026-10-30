import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useT, pluralCategory } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { getConsultants, getRules } from '../../store/actions'
import { Header } from '../../components/Header'
import { Footer } from '../../components/Footer'
import { Button, DemoBadge } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { formatDate } from '../../domain/time'
import { WorldRoutes, useRoutePhase, BRANCH_POINTS, DESTINATIONS } from './WorldRoutes'
import { Filters } from './Filters'
import { ConsultantCard } from './ConsultantCard'

export function DirectoryPage() {
  const { t, l, lang } = useT()
  const [phase, cycle] = useRoutePhase()
  const filters = useAppStore(s => s.filters)
  const overrides = useAppStore(s => s.consultantOverrides)
  const scheduleOverrides = useAppStore(s => s.scheduleOverrides)
  const resetFilters = useAppStore(s => s.resetFilters)

  const list = useMemo(
    () =>
      getConsultants(overrides).filter(c => {
        if (filters.branch !== 'all' && c.branchId !== filters.branch) return false
        if (filters.program !== 'all' && !c.programs.includes(filters.program)) return false
        if (filters.format !== 'any' && !getRules(c.id, scheduleOverrides).formats.includes(filters.format)) return false
        return true
      }),
    [filters, overrides, scheduleOverrides],
  )

  return (
    <>
      <div className="relative overflow-hidden bg-slate-deep pb-24 text-white">
        <div className="grain absolute inset-0" aria-hidden />
        <div className="absolute -end-40 -top-40 size-[520px] rounded-full bg-navy/60 blur-3xl" aria-hidden />
        <Header variant="overlay" />
        <section aria-labelledby="hero-title" className="relative mx-auto max-w-6xl px-4 pt-24 sm:px-6 sm:pt-28">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }} className="max-w-3xl">
            <h1 id="hero-title" className="text-[2.75rem] font-semibold leading-[1.05] sm:text-6xl lg:text-7xl">{t('directory.heroTitle')}</h1>
            <p className="mt-5 max-w-[56ch] text-base leading-relaxed text-mist sm:text-lg">{t('directory.subtitle')}</p>
          </motion.div>

          <div className="relative -mx-4 mt-6 sm:mx-0">
            <WorldRoutes phase={phase} cycle={cycle} className="h-auto w-full" />
          </div>

          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold text-mist">{t('directory.ourBranches')}</p>
              <ul className="flex flex-wrap gap-2">
                {BRANCH_POINTS.map((b, i) => {
                  const on = phase.kind === 'routes' || phase.index >= i
                  const focus = phase.kind === 'branch' && phase.index === i
                  return (
                    <li
                      key={b.id}
                      className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-all duration-500 ${
                        focus ? 'bg-gold text-ink' : on ? 'bg-white/12 text-white ring-1 ring-gold/50' : 'bg-white/5 text-mist ring-1 ring-white/10'
                      }`}
                    >
                      <span className={`size-2 rounded-full ${on ? 'bg-gold' : 'bg-mist/50'} ${focus ? 'bg-ink' : ''}`} aria-hidden />
                      {l(b.name)}
                    </li>
                  )
                })}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-mist">{t('directory.fromEveryBranch')}</p>
              <ul className="flex flex-wrap gap-2">
                {DESTINATIONS.map(d => (
                  <li
                    key={d.id}
                    className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3.5 text-sm font-semibold ring-1 transition-colors duration-700 ${
                      phase.kind === 'routes' ? 'bg-white/12 text-white ring-white/25' : 'bg-white/5 text-mist ring-white/10'
                    }`}
                  >
                    <Icon name="plane" size={14} className="text-gold" />
                    {l(d.name)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>

      <main id="main" className="mx-auto max-w-6xl px-4 sm:px-6">
        <Filters resultCount={list.length} />

        <div className="mt-10 mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-ink">{t('directory.title')}</h2>
            <p className="mt-1 text-sm text-muted">
              {t(`directory.count.${pluralCategory(lang, list.length)}`, { n: list.length })} — {t('directory.availableOn', { date: formatDate(filters.date, lang) })}
            </p>
          </div>
          <DemoBadge />
        </div>

        {list.length ? (
          <div className="grid gap-4 sm:gap-5">
            {list.map(c => <ConsultantCard key={c.id} consultant={c} />)}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-mist bg-white px-6 py-14 text-center">
            <Icon name="search" size={28} className="mx-auto text-mist" />
            <p className="mt-3 text-lg font-semibold text-ink">{t('directory.empty')}</p>
            <p className="mt-1 text-muted">{t('directory.emptyHint')}</p>
            <Button variant="primary" className="mt-5" onClick={resetFilters}>{t('directory.clearFilters')}</Button>
          </div>
        )}

        <section className="mt-16" aria-labelledby="how">
          <h2 id="how" className="text-xl font-semibold text-ink">{t('directory.howTitle')}</h2>
          <ol className="mt-5 grid gap-px overflow-hidden rounded-3xl bg-line ring-1 ring-line sm:grid-cols-3">
            {(['how1', 'how2', 'how3'] as const).map((k, i) => (
              <li key={k} className="flex items-start gap-4 bg-white p-5">
                <span dir="ltr" className="font-display text-3xl font-semibold leading-none text-gold">{i + 1}</span>
                <p className="pt-1 font-semibold text-slate">{t(`directory.${k}`)}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <Footer />
    </>
  )
}
