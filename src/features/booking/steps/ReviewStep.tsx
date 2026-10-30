import { useT } from '../../../i18n'
import { bookingConfig } from '../../../config/booking'
import type { Branch, Consultant, CustomerDetails, Format } from '../../../domain/types'
import { programName } from '../../../config/programs'
import { formatMoney, priceFor } from '../../../domain/pricing'
import { cleanPhone } from '../../../domain/phone'
import { Button, Ltr } from '../../../components/ui'
import { MapCard, TimeWithZone } from '../shared'

export function ReviewStep({ consultant, branch, format, durationMin, slotStartIso, details, onEdit, onContinue }: {
  consultant: Consultant; branch: Branch; format: Format; durationMin: number; slotStartIso: string; details: CustomerDetails
  onEdit: (step: 0 | 1 | 2) => void
  onContinue: () => void
}) {
  const { t, l, lang } = useT()
  const price = priceFor(format, durationMin)
  const edit = (step: 0 | 1 | 2) => (
    <button type="button" onClick={() => onEdit(step)} className="min-h-11 px-2 text-sm font-semibold text-navy hover:underline">{t('common.edit')}</button>
  )
  const block = (title: string, step: 0 | 1 | 2, children: React.ReactNode) => (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-line">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted">{title}</h3>
        {edit(step)}
      </div>
      {children}
    </section>
  )
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div>
        <h2 className="text-2xl font-semibold text-ink">{t('booking.reviewTitle')}</h2>
        <p className="mt-1 text-sm text-muted">{t('booking.reviewHint')}</p>
      </div>
      {block(t('common.consultant'), 0, (
        <>
          <p className="font-semibold text-ink">{l(consultant.name)}</p>
          <p className="text-sm text-slate">{t(`format.${format}`)} · {t('common.durationRange', bookingConfig.durationRange)}</p>
        </>
      ))}
      {block(t('common.date'), 1, <TimeWithZone iso={slotStartIso} tz={branch.timeZone} showLocal={format === 'online'} />)}
      {block(t('booking.detailsTitle'), 2, (
        <dl className="grid gap-1 text-sm">
          <div className="font-semibold text-ink">{details.name}</div>
          <div><Ltr>{cleanPhone(details.phone)}</Ltr></div>
          <div><Ltr>{details.email}</Ltr></div>
          <div className="text-muted">
            {t('booking.channel')}: {t(details.channel === 'email' ? 'booking.channelEmail' : 'booking.channelWhatsapp')}
          </div>
          {details.program && <div className="text-muted">{t('booking.program')}: {l(programName(details.program))}</div>}
          {details.note && <div className="text-muted">“{details.note}”</div>}
        </dl>
      ))}
      {format === 'in-person' && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted">{t('booking.branchAddress')}</h3>
          <MapCard branch={branch} />
        </div>
      )}
      <div className="flex items-center justify-between rounded-2xl bg-slate-deep px-5 py-4 text-white">
        <div>
          <p className="text-sm text-mist">{t('booking.total')}</p>
          <p className="text-sm text-mist">{t('common.durationRange', bookingConfig.durationRange)}</p>
        </div>
        <p className="font-display text-3xl font-semibold"><Ltr>{formatMoney(price, lang)}</Ltr></p>
      </div>
      <Button variant="gold" size="lg" className="w-full" onClick={onContinue}>{t('booking.toPayment')}</Button>
    </div>
  )
}
