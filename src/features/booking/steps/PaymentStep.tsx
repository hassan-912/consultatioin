import { useState } from 'react'
import { useT } from '../../../i18n'
import type { Booking, PayCurrency } from '../../../domain/types'
import { defaultCurrency, easykashOptions, payCurrencies } from '../../../config/payments'
import { convertEgp, useEgpToForeign } from '../../../data/fxRates'
import { useAppStore } from '../../../store/useAppStore'
import { expireDue } from '../../../store/actions'
import { HoldExpired } from '../../../data'
import { isLive } from '../../../data/mode'
import { errorKey } from '../../../data/feedback'
import { formatMoney } from '../../../domain/pricing'
import { Countdown } from '../../../components/widgets'
import { Button, Ltr } from '../../../components/ui'
import { Icon } from '../../../components/Icon'

export function PaymentStep({ booking, onPay, onExpiredRestart }: {
  booking: Booking
  /** Starts the EasyKash payment and leaves the page; rejects when it can't start. */
  onPay: (currency: PayCurrency) => Promise<unknown>
  onExpiredRestart: () => void
}) {
  const { t, l, lang } = useT()
  const now = useAppStore(s => s.now)
  const [currency, setCurrency] = useState<PayCurrency>(() => defaultCurrency(booking.customer.phone))
  const [busy, setBusy] = useState(false)
  const [serverExpired, setServerExpired] = useState(false)
  const [error, setError] = useState<string>()
  const expired = serverExpired || booking.status === 'expired' || (booking.status === 'reserved' && booking.holdExpiresAt <= now())
  const egp = formatMoney(booking.price, lang)
  const rates = useEgpToForeign(currency !== 'EGP')
  const money = (n: number, c: string) => new Intl.NumberFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n)
  // Display only: the server works out the charged amount with the same rule (live rate, rounded up).
  const amount = currency === 'EGP' ? egp : rates ? money(convertEgp(booking.price.amount, rates[currency]), currency) : null

  if (expired)
    return (
      <div className="rounded-3xl bg-white p-6 text-center ring-1 ring-line">
        <span className="mx-auto inline-flex size-14 items-center justify-center rounded-full bg-bad-soft text-bad"><Icon name="clock" size={26} /></span>
        <h2 className="mt-4 text-2xl font-semibold text-ink">{t('payment.expiredTitle')}</h2>
        <p className="mx-auto mt-2 max-w-[48ch] text-slate">{t('payment.expiredBody')}</p>
        <p className="mt-3 text-sm text-muted">{t('common.reference')}: <Ltr className="font-semibold text-ink">{booking.reference}</Ltr></p>
        <Button className="mt-6" onClick={onExpiredRestart}>{t('payment.chooseAnother')}</Button>
      </div>
    )

  const pay = async () => {
    if (busy) return
    // Timers are throttled in background tabs, so re-check the deadline now.
    if (booking.status === 'reserved' && booking.holdExpiresAt <= now()) { setServerExpired(true); if (!isLive) expireDue(); return }
    setBusy(true); setError(undefined)
    try { await onPay(currency) }
    catch (err) {
      if (err instanceof HoldExpired) setServerExpired(true)
      else setError(t(errorKey(err)))
      setBusy(false)
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="rounded-3xl bg-slate-deep p-5 text-white sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-mist">{t('common.reference')}</p>
            <p data-testid="booking-ref" dir="ltr" className="font-display text-2xl font-semibold tracking-wider text-gold">{booking.reference}</p>
          </div>
          <div className="text-end">
            <p className="text-sm text-mist">{t('payment.reservedUntil')}</p>
            <div className="[&_span]:text-white"><Countdown untilMs={booking.holdExpiresAt} now={now} onDone={() => { setServerExpired(true); if (!isLive) expireDue() }} /></div>
          </div>
        </div>
        <p className="mt-3 text-sm text-mist">{t('payment.deadlineNote')}</p>
      </div>

      <h2 className="text-2xl font-semibold text-ink">{t('payment.title')}</h2>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">{t('payment.currency')}</legend>
        <div className="grid grid-cols-4 gap-2">
          {payCurrencies.map(c => (
            <label key={c} className={`flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border-2 px-2 font-display text-base font-semibold has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-gold/40 ${
              currency === c ? 'border-slate bg-white text-ink' : 'border-line bg-white text-muted hover:border-mist'}`}>
              <input type="radio" name="currency" className="sr-only" checked={currency === c} onChange={() => { setCurrency(c); setError(undefined) }} />
              {c}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="rounded-2xl bg-gold-soft px-5 py-4 ring-1 ring-gold/40">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold text-gold-deep">{t('payment.amount')}</span>
          <span data-testid="pay-amount" className="font-display text-3xl font-semibold text-ink"><Ltr>{amount ?? t('payment.rateLoading')}</Ltr></span>
        </div>
        {currency !== 'EGP' && <p className="mt-1.5 text-xs text-muted">{t('payment.rateNote', { amount: egp })}</p>}
      </div>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-line">
        <p className="flex items-start gap-2.5 text-sm text-slate">
          <Icon name="card" size={18} className="mt-0.5 shrink-0 text-navy" />
          <span>{t('payment.onlineNote')}</span>
        </p>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">{t('payment.accepted')}</p>
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {easykashOptions.map(o => <li key={o.en} className="rounded-full bg-paper px-2.5 py-1 text-xs font-semibold text-slate ring-1 ring-line">{l(o)}</li>)}
        </ul>
      </section>

      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      {/* Not blocked on the display rate: the server prices the payment itself. */}
      <Button variant="gold" size="lg" className="w-full" disabled={busy} onClick={pay}>
        {busy ? t('payment.redirecting') : t('payment.payOnline', { amount: amount ?? currency })}
      </Button>
    </div>
  )
}
