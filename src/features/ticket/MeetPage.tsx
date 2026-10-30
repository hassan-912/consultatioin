import { useParams } from 'react-router-dom'
import { useT } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { getConsultant } from '../../store/actions'
import { formatInZone, zoneLabel } from '../../domain/time'
import { Header } from '../../components/Header'
import { Avatar } from '../../components/widgets'
import { Notice } from '../../components/ui'
import { NotFound } from './BookingPage'

/** Prototype waiting room. The real meeting platform is a pending decision. */
export function MeetPage() {
  const { token = '' } = useParams()
  const { t, l, lang } = useT()
  const b = useAppStore(s => Object.values(s.bookings).find(x => x.meetingUrl === `#/meet/${token}`))
  if (!b) return <NotFound />
  const c = getConsultant(b.consultantId)
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-xl px-4 py-12 text-center">
        <div className="mx-auto w-fit"><Avatar consultant={c} size="lg" /></div>
        <h1 className="mt-5 text-2xl font-semibold text-ink">{t('ticket.join')}</h1>
        <p className="mt-1 text-slate">{l(c.name)}</p>
        <p className="mt-3 font-semibold text-ink">{formatInZone(b.startIso, b.tz, lang, 'full')}</p>
        <p className="text-sm text-muted">{zoneLabel(b.tz, lang)}</p>
        <Notice tone="info" className="mt-6 text-start">
          {l({ en: 'Prototype waiting room. The meeting platform for online consultations is a pending decision.', ar: 'غرفة انتظار تجريبية. منصة الاجتماعات للاستشارات الأونلاين قرار لم يُحسم بعد.' })}
        </Notice>
      </main>
    </>
  )
}
