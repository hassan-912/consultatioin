import { Link, useParams } from 'react-router-dom'
import { useT } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { getConsultant } from '../../store/actions'
import { consultants } from '../../config/consultants'
import { branchById } from '../../config/branches'
import { kpiConfig } from '../../config/kpi'
import { countryById, programName } from '../../config/programs'
import { Header } from '../../components/Header'
import { Footer } from '../../components/Footer'
import { Avatar, CountUp } from '../../components/widgets'
import { ScoreBar } from '../../components/ScoreBar'
import { Button, DemoBadge, Placeholder } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { useConsultantStats, useOutcomes } from '../shared/availability'
import { experienceText, useStartBooking } from '../directory/ConsultantCard'
import { VideoPlayer } from './VideoPlayer'
import { ApprovalStats } from './ApprovalStats'
import { SlotCalendar } from './SlotCalendar'
import { DirectoryPage } from '../directory/DirectoryPage'

export function ProfilePage() {
  const { id = '' } = useParams()
  const { t, l, lang } = useT()
  const overrides = useAppStore(s => s.consultantOverrides)
  const minSample = useAppStore(s => s.approvalMinSample) ?? kpiConfig.approvalMinSample
  if (!consultants.some(c => c.id === id)) return <DirectoryPage />
  const c = getConsultant(id, overrides)
  return <Profile key={c.id} c={c} t={t} l={l} lang={lang} minSample={minSample} />
}

function Profile({ c, t, l, lang, minSample }: { c: ReturnType<typeof getConsultant>; minSample: number } & Pick<ReturnType<typeof useT>, 't' | 'l' | 'lang'>) {
  const branch = branchById(c.branchId)
  const stats = useConsultantStats(c)
  const outcomes = useOutcomes(c.id)
  const startBooking = useStartBooking()

  return (
    <>
      <Header />
      <div className="bg-slate-deep text-white">
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-6">
          <Link to="/" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-mist hover:text-white">
            <Icon name="chevron" size={16} className="rotate-180" />
            {t('profile.back')}
          </Link>
          <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end">
            <Avatar consultant={c} size="xl" showPending />
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">{l(c.name)}</h1>
              <p className={`mt-1.5 text-base ${c.title ? 'text-white/90' : 'text-mist'}`}>{c.title ? l(c.title) : t('placeholder.title')}</p>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-mist">
                <Icon name="pin" size={15} className="text-gold" />
                {l(branch.name)}, {l(branch.city)}
              </p>
            </div>
            <Button variant="gold" size="lg" className="hidden sm:inline-flex" onClick={() => startBooking(c.id)}>
              {t('common.book')}
            </Button>
          </div>
        </div>
      </div>

      <main id="main" className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid min-w-0 gap-6">
          <section aria-labelledby="about" className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
            <h2 id="about" className="mb-3 text-lg font-semibold text-ink">{t('profile.about')}</h2>
            {c.bio ? <p className="leading-relaxed text-slate">{l(c.bio)}</p> : <Placeholder kind="bio" hint={t('placeholder.bioHint')} />}
          </section>

          <VideoPlayer consultant={c} />

          <section aria-labelledby="programs" className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 id="programs" className="text-lg font-semibold text-ink">{t('profile.programs')}</h2>
              {c.demoPrograms && <DemoBadge />}
            </div>
            <ul className="flex flex-wrap gap-2">
              {c.programs.map(p => (
                <li key={p} className="rounded-full bg-paper px-3 py-1.5 text-sm font-semibold text-slate ring-1 ring-line">{l(programName(p))}</li>
              ))}
            </ul>
            <h3 className="mt-5 mb-2 text-sm font-semibold text-ink">{t('profile.countries')}</h3>
            <ul className="flex flex-wrap gap-2">
              {c.countries.map(code => {
                const ct = countryById(code)
                return (
                  <li key={code} className="inline-flex items-center gap-2 rounded-full bg-paper px-3 py-1.5 text-sm text-slate ring-1 ring-line">
                    <span aria-hidden>{ct.flag}</span>
                    {l(ct.name)}
                  </li>
                )
              })}
            </ul>
            {c.demoPrograms && <p className="mt-3 text-xs text-muted">{t('profile.demoPrograms')}</p>}
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-ink">{t('profile.languages')}</h3>
                {c.languages ? <p>{c.languages.map(l).join('، ')}</p> : <Placeholder kind="languages" />}
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-ink">{t('profile.qualifications')}</h3>
                {c.qualifications ? <ul>{c.qualifications.map((q, i) => <li key={i}>{l(q)}</li>)}</ul> : <Placeholder kind="qualifications" />}
              </div>
            </div>
          </section>

          <SlotCalendar consultant={c} />
        </div>

        <aside className="grid content-start gap-6">
          <section aria-labelledby="activity" className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 id="activity" className="text-lg font-semibold text-ink">{t('profile.activity')}</h2>
              <DemoBadge />
            </div>
            <dl className="grid grid-cols-3 gap-3">
              <div>
                <dt className="text-xs text-muted">{t('common.yearsOfExperience')}</dt>
                <dd dir="ltr" className="mt-1 text-start font-display text-2xl font-semibold rtl:text-end">{experienceText(c, lang)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t('common.completed')}</dt>
                <dd className="mt-1 font-display text-2xl font-semibold"><CountUp value={stats.total} /></dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t('common.thisMonth')}</dt>
                <dd className="mt-1 font-display text-2xl font-semibold"><CountUp value={stats.thisMonth} /></dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-muted">{t('profile.activityNote')}</p>
          </section>

          <section role="region" aria-labelledby="kpi" className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 id="kpi" className="text-lg font-semibold text-ink">{t('profile.kpiTitle')}</h2>
              <DemoBadge />
            </div>
            <ScoreBar score={stats.kpi} />
          </section>

          <section role="region" aria-labelledby="feedback" className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
            <h2 id="feedback" className="mb-3 text-lg font-semibold text-ink">{t('profile.ratingTitle')}</h2>
            <p className="font-semibold text-slate">{t('profile.noFeedback')}</p>
            <p className="mt-1 text-sm text-muted">{t('profile.noFeedbackHint')}</p>
          </section>

          <ApprovalStats outcomes={outcomes} minSample={minSample} />
        </aside>
      </main>

      <div className="safe-bottom sticky bottom-0 z-20 border-t border-line bg-white/95 px-4 pt-3 backdrop-blur sm:hidden">
        <Button variant="primary" size="lg" className="w-full" onClick={() => startBooking(c.id)}>{t('common.book')}</Button>
      </div>
      <Footer />
    </>
  )
}
