import { Link, useParams } from 'react-router-dom'
import { useT } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { getConsultant } from '../../store/actions'
import { consultants } from '../../config/consultants'
import { branchById } from '../../config/branches'
import { programName } from '../../config/programs'
import { Header } from '../../components/Header'
import { Footer } from '../../components/Footer'
import { Avatar } from '../../components/widgets'
import { Button, DemoBadge, Placeholder } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { useStartBooking } from '../directory/ConsultantCard'
import { VideoPlayer } from './VideoPlayer'
import { SlotCalendar } from './SlotCalendar'
import { DirectoryPage } from '../directory/DirectoryPage'
import { ConsultantFeedback } from '../reviews/Reviews'

export function ProfilePage() {
  const { id = '' } = useParams()
  const { t, l } = useT()
  const overrides = useAppStore(s => s.consultantOverrides)
  if (!consultants.some(c => c.id === id)) return <DirectoryPage />
  const c = getConsultant(id, overrides)
  return <Profile key={c.id} c={c} t={t} l={l} />
}

function Profile({ c, t, l }: { c: ReturnType<typeof getConsultant> } & Pick<ReturnType<typeof useT>, 't' | 'l'>) {
  const branch = branchById(c.branchId)
  const startBooking = useStartBooking()

  return (
    <>
      <Header />
      <section aria-labelledby="profile-name" className="bg-slate-deep text-white">
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-6">
          <Link to="/" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-mist hover:text-white">
            <Icon name="chevron" size={16} className="rotate-180" />
            {t('profile.back')}
          </Link>
          <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end">
            <Avatar consultant={c} size="2xl" showPending />
            <div className="min-w-0 flex-1">
              <h1 id="profile-name" className="text-3xl font-semibold leading-tight sm:text-4xl">{l(c.name)}</h1>
              <p className={`mt-1.5 text-base ${c.title ? 'text-white/90' : 'text-mist'}`}>{c.title ? l(c.title) : t('placeholder.title')}</p>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-mist">
                <Icon name="pin" size={15} className="text-gold" />
                {l(branch.name)}, {l(branch.city)}
              </p>
            </div>
            <div className="hidden sm:block">
              <Button variant="gold" size="lg" onClick={() => startBooking(c.id)}>
                {t('common.book')}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <main id="main" className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
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
            {c.demoPrograms && <p className="mt-3 text-xs text-muted">{t('profile.demoPrograms')}</p>}
          </section>

          <SlotCalendar consultant={c} />
        </div>

        <aside className="grid content-start gap-6">
          <ConsultantFeedback consultantId={c.id} />
        </aside>
      </main>

      <div className="safe-bottom sticky bottom-0 z-20 border-t border-line bg-white/95 px-4 pt-3 backdrop-blur sm:hidden">
        <Button variant="primary" size="lg" className="w-full" onClick={() => startBooking(c.id)}>{t('common.book')}</Button>
      </div>
      <Footer />
    </>
  )
}
