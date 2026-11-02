import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useT, pluralCategory } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { getConsultants } from '../../store/actions'
import { Header } from '../../components/Header'
import { Footer } from '../../components/Footer'
import { Button, DemoBadge } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { formatDate } from '../../domain/time'
import { WorldRoutes, useRoutePhase } from './WorldRoutes'
import { Filters } from './Filters'
import { ConsultantCard } from './ConsultantCard'
import { isLive } from '../../data/mode'
import { usePublicMetadata } from '../../data/hooks'
import { useLiveData } from '../../data/liveState'
import { DataStatus } from '../../data/feedback'
import { LocationGate, locationName } from './LocationGate'
import { branchById } from '../../config/branches'

export function DirectoryPage() {
  const { t, l, lang } = useT()
  const [phase, cycle] = useRoutePhase()
  const filters = useAppStore(s => s.filters)
  const overrides = useAppStore(s => s.consultantOverrides)
  const location = useAppStore(s => s.location)
  const setLocation = useAppStore(s => s.setLocation)
  const resetFilters = useAppStore(s => s.resetFilters)
  const metadata = usePublicMetadata()
  const metadataError = useLiveData(s => s.metadataError)

  const list = useMemo(
    () =>
      getConsultants(overrides).filter(c => {
        // Branch comes from the welcome screen; online vs in person is chosen while booking.
        if (location && c.branchId !== location) return false
        if (filters.program !== 'all' && !c.programs.includes(filters.program)) return false
        return true
      }),
    [filters.program, location, overrides],
  )

  const comingSoon = location ? branchById(location).comingSoon : false

  return (
    <>
      {!location && <LocationGate />}
      <div className="relative overflow-hidden bg-slate-deep pb-20 text-white">
        <div className="grain absolute inset-0" aria-hidden />
        <div className="absolute -end-40 -top-40 size-[520px] rounded-full bg-navy/60 blur-3xl" aria-hidden />
        <Header variant="overlay" />
        <section aria-labelledby="hero-title" className="relative mx-auto grid max-w-6xl items-center gap-2 px-4 pt-20 sm:px-6 sm:pt-20 md:grid-cols-[0.9fr_1.1fr] md:gap-6">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}>
            <h1 id="hero-title" className="text-4xl font-semibold leading-[1.05] lg:text-5xl">{t('directory.heroTitle')}</h1>
            <p className="mt-3 max-w-[48ch] text-[15px] leading-relaxed text-mist lg:text-base">{t('directory.subtitle')}</p>
          </motion.div>
          <WorldRoutes phase={phase} cycle={cycle} className="mx-auto h-auto max-h-[300px] w-full" />
        </section>
      </div>

      <main id="main" className="mx-auto max-w-6xl px-4 sm:px-6">
        <Filters resultCount={list.length} />

        {location && (
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-line">
            <Icon name="pin" size={18} className="text-gold-deep" />
            <p className="text-sm text-slate">{t('gate.showing')} <span className="font-semibold text-ink">{l(locationName(location))}</span></p>
            <Button variant="ghost" size="sm" className="ms-auto" onClick={() => setLocation(null)}>{t('gate.change')}</Button>
          </div>
        )}

        <div className="mt-10 mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-ink">{t('directory.title')}</h2>
            <p className="mt-1 text-sm text-muted">
              {t(`directory.count.${pluralCategory(lang, list.length)}`, { n: list.length })} — {t('directory.availableOn', { date: formatDate(filters.date, lang) })}
            </p>
          </div>
          <DemoBadge />
        </div>

        {isLive && !metadata ? <DataStatus loading={!metadataError} error={metadataError} /> : list.length ? (
          <div className="grid gap-4 sm:gap-5">
            {list.map(c => <ConsultantCard key={c.id} consultant={c} />)}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-mist bg-white px-6 py-14 text-center">
            <Icon name="search" size={28} className="mx-auto text-mist" />
            <p className="mt-3 text-lg font-semibold text-ink">{comingSoon ? t('gate.soonTitle', { place: l(locationName(location!)) }) : t('directory.empty')}</p>
            <p className="mt-1 text-muted">{comingSoon ? t('gate.soonHint') : t('directory.emptyHint')}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {filters.program !== 'all' && <Button variant="ghost" onClick={resetFilters}>{t('directory.clearFilters')}</Button>}
              <Button variant="primary" onClick={() => setLocation(null)}>{t('gate.change')}</Button>
            </div>
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
