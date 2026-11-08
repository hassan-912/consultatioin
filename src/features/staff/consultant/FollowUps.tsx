import { Link } from 'react-router-dom'
import { useT, translate } from '../../../i18n'
import { repo } from '../../../data'
import { reportActionError } from '../../../data/feedback'
import { getConsultant } from '../../../store/actions'
import { programName } from '../../../config/programs'
import { formatInZone } from '../../../domain/time'
import type { Booking } from '../../../domain/types'
import type { ConsultationRecord } from '../../../store/useAppStore'
import { Button, Ltr } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { whatsappLink } from '../finance/whatsappMessage'

/** The reminder the consultant sends, in the language the client booked in. */
export function followUpMessage(b: Booking, record?: ConsultationRecord): string {
  const lang = b.customer.consultationLang
  const program = record?.recommendedProgram ?? (b.customer.program || undefined)
  return translate(lang, 'staff.followUps.message', {
    client: b.customer.name.trim(),
    consultant: getConsultant(b.consultantId).name[lang],
    program: program ? programName(program)[lang] : '—',
  })
}

/** "Thinking" clients this consultant still has to follow up, newest decision first. */
export function pendingFollowUps(bookings: Booking[], records: Record<string, ConsultationRecord>) {
  return bookings
    .filter(b => records[b.id]?.nextStep === 'thinking' && !records[b.id]?.followedUpAt)
    .sort((a, b) => (records[b.id]?.nextStepAt ?? 0) - (records[a.id]?.nextStepAt ?? 0))
}

export function FollowUps({ bookings, records }: { bookings: Booking[]; records: Record<string, ConsultationRecord> }) {
  const { t, l, lang } = useT()
  const list = pendingFollowUps(bookings, records)
  const done = (id: string) => repo.markFollowedUp(id).catch(reportActionError)
  return (
    <section aria-labelledby="followups-title" className="mt-8">
      <h2 id="followups-title" className="text-lg font-semibold text-ink">{t('staff.followUps.title')}</h2>
      <p className="mb-3 text-sm text-muted">{t('staff.followUps.hint')}</p>
      {list.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map(b => {
            const r = records[b.id]
            const program = r?.recommendedProgram ?? (b.customer.program || undefined)
            return (
              <li key={b.id} className="rounded-2xl bg-white p-4 ring-1 ring-gold/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/staff/client/${b.id}`} dir="auto" className="block truncate font-semibold text-ink hover:underline">{b.customer.name}</Link>
                    <p className="text-sm text-muted"><Ltr>{b.customer.phone}</Ltr></p>
                  </div>
                  {program && <span className="shrink-0 rounded-full bg-gold-soft px-2 py-0.5 text-xs font-semibold text-gold-deep">{l(programName(program))}</span>}
                </div>
                <p className="mt-1 text-xs text-muted">{t('staff.followUps.since', { date: formatInZone(b.startIso, b.tz, lang, 'date') })}</p>
                <p dir="auto" className="mt-3 rounded-xl bg-paper px-3 py-2 text-sm text-slate">{followUpMessage(b, r)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={whatsappLink(b.customer.phone, followUpMessage(b, r))} target="_blank" rel="noopener noreferrer"
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-ok px-3 text-sm font-semibold text-white hover:brightness-110">
                    <Icon name="chat" size={16} />{t('staff.followUps.send')}
                  </a>
                  <Button size="sm" variant="ghost" onClick={() => void done(b.id)}><Icon name="check" size={15} />{t('staff.followUps.done')}</Button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-mist bg-white px-4 py-6 text-center text-sm text-muted">{t('staff.followUps.none')}</p>
      )}
    </section>
  )
}
