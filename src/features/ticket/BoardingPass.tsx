import { forwardRef } from 'react'
import { bookingConfig } from '../../config/booking'
import { translate, useT, type TKey, type Vars } from '../../i18n'
import type { Booking, L10n, Lang } from '../../domain/types'
import { branchById } from '../../config/branches'
import { contact } from '../../config/contact'
import { getConsultant } from '../../store/actions'
import { formatInZone, zoneLabel } from '../../domain/time'
import { Logo } from '../../components/Logo'
import { QrCode } from '../../components/widgets'
import { Ltr } from '../../components/ui'
import { Icon } from '../../components/Icon'

const VALID = ['confirmed', 'checked-in', 'completed']

export const manageUrl = (b: Booking) => `${location.origin}${location.pathname}#/booking/${b.manageToken}`

/** The entry ticket, styled as a boarding pass. */
export const BoardingPass = forwardRef<HTMLDivElement, { booking: Booking; lang?: Lang }>(({ booking: b, lang: forced }, ref) => {
  // `lang` renders the ticket in a language other than the page's (e.g. for a WhatsApp attachment).
  const ui = useT()
  const lang = forced ?? ui.lang
  const t = (k: TKey, v?: Vars) => translate(lang, k, v)
  const l = (v: L10n) => v[lang]
  const consultant = getConsultant(b.consultantId)
  const branch = branchById(b.branchId)
  const valid = VALID.includes(b.status)
  const onHold = !valid

  const field = (label: string, value: React.ReactNode, wide = false) => (
    <div className={wide ? 'col-span-2' : ''}>
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 font-semibold leading-snug text-ink">{value}</p>
    </div>
  )

  return (
    <div ref={ref} dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} className="relative mx-auto w-full max-w-[420px] overflow-hidden rounded-[28px] bg-white shadow-[var(--shadow-lift)] ring-1 ring-line">
      {/* Header band */}
      <div className="relative overflow-hidden bg-slate-deep px-5 pb-5 pt-4 text-white">
        <div className="grain absolute inset-0" aria-hidden />
        <div className="relative flex items-center justify-between">
          <Logo className="h-7" />
          <span className="text-xs text-mist">{t('ticket.boarding')}</span>
        </div>
        <div className="relative mt-5 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-mist">{t('ticket.from')}</p>
            <p className="truncate font-display text-xl font-semibold">{b.format === 'online' ? t('format.onlineShort') : l(branch.name)}</p>
          </div>
          <div className="flex flex-1 items-center gap-1 pb-2 text-gold" aria-hidden>
            <span className="h-px flex-1 border-t border-dashed border-gold/60" />
            <Icon name="plane" size={18} className="rtl:-scale-x-100" />
            <span className="h-px flex-1 border-t border-dashed border-gold/60" />
          </div>
          <div className="min-w-0 text-end">
            <p className="text-[11px] text-mist">{t('ticket.to')}</p>
            <p className="truncate font-display text-xl font-semibold">{t('ticket.toValue')}</p>
          </div>
        </div>
      </div>

      {/* Status ribbon */}
      <div className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold ${valid ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}>
        <Icon name={valid ? 'shield' : 'clock'} size={16} />
        {t(`status.${b.status}`)}
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 px-5 py-5 text-sm">
        {field(t('ticket.passenger'), b.customer.name)}
        {field(t('common.consultant'), l(consultant.name))}
        {field(t('common.date'), formatInZone(b.startIso, b.tz, lang, 'date'), true)}
        {field(t('common.time'), <><Ltr>{formatInZone(b.startIso, b.tz, lang, 'time')}</Ltr> <span className="text-xs font-normal text-muted">{zoneLabel(b.tz, lang, Date.parse(b.startIso))}</span></>)}
        {field(t('common.duration'), t('common.durationRange', bookingConfig.durationRange))}
        {field(t('ticket.gate'), t(`format.${b.format}`), true)}
        {b.format === 'in-person' && field(t('booking.branchAddress'), <span className="font-normal text-slate">{l(branch.address)}</span>, true)}
      </div>

      {/* Perforation */}
      <div className="relative h-6" aria-hidden>
        <span className="absolute -start-3 top-0 size-6 rounded-full bg-paper ring-1 ring-line" />
        <span className="absolute -end-3 top-0 size-6 rounded-full bg-paper ring-1 ring-line" />
        <span className="absolute inset-x-5 top-1/2 border-t-2 border-dashed border-line" />
      </div>

      {/* Stub */}
      <div className="flex items-center gap-4 px-5 pb-5 pt-2">
        <div className="relative shrink-0 rounded-2xl bg-white p-2 ring-1 ring-line">
          <QrCode value={b.qrToken} size={112} className={onHold ? 'opacity-25 grayscale' : ''} />
          {onHold && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="-rotate-12 rounded-md border-2 border-warn bg-white/90 px-2 py-0.5 font-display text-sm font-bold text-warn">{t('ticket.onHoldStamp')}</span>
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted">{t('common.reference')}</p>
          <p dir="ltr" className="text-start font-display text-xl font-semibold tracking-wider text-ink rtl:text-end">{b.reference}</p>
          <p className="mt-1 text-xs text-muted">{onHold ? t('ticket.notValid') : t('ticket.scan')}</p>
          <p className="mt-2 text-xs font-semibold text-ink">{t('booking.total')}: <Ltr>{b.price.amount.toLocaleString('en-US')} {b.price.currency}</Ltr></p>
        </div>
      </div>

      <div className="border-t border-line bg-paper px-5 py-3 text-xs text-muted">
        <p>
          {t('common.support')}: <Ltr className="font-semibold text-slate">{contact.hotline}</Ltr> — <Ltr>{contact.email}</Ltr>
        </p>
        <p className="mt-1 truncate">{t('ticket.manageLink')}: <Ltr>{manageUrl(b).replace(/^https?:\/\//, '')}</Ltr></p>
      </div>
    </div>
  )
})
