import { useState, type FormEvent } from 'react'
import { useT } from '../../../i18n'
import type { Booking, PaymentMethodId } from '../../../domain/types'
import { defaultPaymentMethod, paymentConfig } from '../../../config/payments'
import { convertEgp, useEgpToForeign } from '../../../data/fxRates'
import { useAppStore } from '../../../store/useAppStore'
import { expireDue } from '../../../store/actions'
import { SlotTaken, HoldExpired, type PaymentInput } from '../../../data'
import { isLive } from '../../../data/mode'
import { errorKey } from '../../../data/feedback'
import { compressReceipt } from '../../../domain/receipt'
import { formatMoney } from '../../../domain/pricing'
import { CopyField } from '../../../components/CopyField'
import { Countdown } from '../../../components/widgets'
import { TextField } from '../../../components/fields'
import { Button, Ltr, Notice } from '../../../components/ui'
import { Icon } from '../../../components/Icon'

export function PaymentStep({ booking, onSubmit, onExpiredRestart }: {
  booking: Booking
  onSubmit: (p: PaymentInput) => Promise<unknown>
  onExpiredRestart: () => void
}) {
  const { t, l, lang } = useT()
  const now = useAppStore(s => s.now)
  const [method, setMethod] = useState<PaymentMethodId>(() => defaultPaymentMethod(booking.customer.phone))
  const [txnRef, setTxnRef] = useState('')
  const [receipt, setReceipt] = useState<string>()
  const [receiptImage, setReceiptImage] = useState<string>()
  const [originalReceipt, setOriginalReceipt] = useState<Blob>()
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [serverExpired, setServerExpired] = useState(false)
  const [error, setError] = useState<string>()
  const m = paymentConfig.methods.find(x => x.id === method)!
  const expired = serverExpired || booking.status === 'expired' || (booking.status === 'reserved' && booking.holdExpiresAt <= now())
  const amount = formatMoney(booking.price, lang)
  const rates = useEgpToForeign(m.currency !== 'EGP')
  const money = (n: number, c: string) => new Intl.NumberFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n)
  const equivalent = m.currency === 'EGP' ? null : !rates ? '' : m.currency === 'AED'
    ? money(convertEgp(booking.price.amount, rates.AED), 'AED')
    : `${money(convertEgp(booking.price.amount, rates.USD), 'USD')} / ${money(convertEgp(booking.price.amount, rates.EUR), 'EUR')}`

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

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (txnRef.trim().length < 4) return setError(t('validation.txnRef'))
    // Timers are throttled in background tabs, so re-check the deadline at submit time.
    if (busy || reading) return
    if (booking.status === 'reserved' && booking.holdExpiresAt <= now()) { setServerExpired(true); if (!isLive) expireDue(); return }
    setBusy(true); setError(undefined)
    try { await onSubmit({ method, txnRef, receiptName: receipt, receiptImage, receipt: originalReceipt }) }
    catch (err) {
      if (err instanceof HoldExpired) setServerExpired(true)
      else setError(t(err instanceof SlotTaken ? 'payment.slotTaken' : errorKey(err)))
      if (!isLive) expireDue()
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} noValidate className="grid grid-cols-[minmax(0,1fr)] gap-5">
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

      <div>
        <h2 className="text-2xl font-semibold text-ink">{t('payment.title')}</h2>
        <div className="mt-4 flex items-baseline justify-between rounded-2xl bg-gold-soft px-5 py-4 ring-1 ring-gold/40">
          <span className="font-semibold text-gold-deep">{t('payment.amount')}</span>
          <span className="font-display text-3xl font-semibold text-ink"><Ltr>{amount}</Ltr></span>
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">{t('payment.method')}</legend>
        {(['egypt', 'international'] as const).map(region => (
          <div key={region} className="mb-3 last:mb-0">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <Icon name={region === 'egypt' ? 'pin' : 'globe'} size={14} />{t(region === 'egypt' ? 'payment.insideEgypt' : 'payment.outsideEgypt')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {paymentConfig.methods.filter(pm => pm.region === region).map(pm => (
                <label
                  key={pm.id}
                  className={`flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 px-3 text-center text-sm font-semibold has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-gold/40 sm:text-base ${
                    method === pm.id ? 'border-slate bg-white text-ink' : 'border-line bg-white text-muted hover:border-mist'
                  }`}
                >
                  <input type="radio" name="method" className="sr-only" checked={method === pm.id} onChange={() => setMethod(pm.id)} />
                  <Icon name={pm.id === 'instapay' ? 'card' : pm.id === 'vodafone-cash' ? 'phone' : 'building'} size={18} />
                  {l(pm.label)}
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>

      <div className="grid gap-2">
        {m.link && (
          <a href={m.link} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-slate px-5 font-semibold text-white hover:brightness-110">
            <Icon name="card" size={18} />{t('payment.openLink', { method: l(m.label) })}
          </a>
        )}
        <CopyField label={m.currency === 'EGP' ? t('payment.amount') : t('payment.amountEgp')} value={String(booking.price.amount)} />
        {equivalent !== null && (
          <div className="rounded-xl border border-gold/40 bg-gold-soft px-3.5 py-2.5 text-sm">
            <p className="text-xs text-gold-deep">{t('payment.equivalent')}</p>
            <p className="font-semibold text-ink"><Ltr>{equivalent || t('payment.rateLoading')}</Ltr></p>
            <p className="mt-0.5 text-xs text-muted">{t('payment.equivalentHint', { amount })}</p>
          </div>
        )}
        {m.fields.map(f => <CopyField key={f.value} label={l(f.label)} value={f.value} mono={f.mono !== false} />)}
        <CopyField label={t('common.reference')} value={booking.reference} />
        {m.placeholder && <Notice tone="warn">{t('payment.pendingConfig')}</Notice>}
      </div>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-line">
        <h3 className="mb-3 font-semibold text-ink">{t('payment.instructions')}</h3>
        <ol className="grid gap-2.5 text-sm text-slate">
          {paymentConfig.instructions.map((ins, i) => (
            <li key={i} className="flex gap-3">
              <span dir="ltr" className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-paper text-xs font-semibold text-slate ring-1 ring-line">{i + 1}</span>
              <span>{l(ins)}</span>
            </li>
          ))}
        </ol>
      </section>

      <TextField
        label={t('payment.txnRef')}
        dir="ltr"
        autoComplete="off"
        value={txnRef}
        onChange={e => {
          setTxnRef(e.target.value)
          setError(undefined)
        }}
        hint={t('payment.txnRefHint')}
        error={error}
      />

      <div>
        <p className="mb-1.5 text-sm font-semibold text-ink">{t('payment.receipt')}</p>
        <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-mist bg-white px-4 text-sm text-slate hover:bg-paper has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-gold/40">
          <Icon name="upload" size={18} />
          <span className="truncate">{receipt ? t('payment.receiptChosen', { name: receipt }) : t('payment.receipt')}</span>
          <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={async e => {
              const file = e.target.files?.[0]
              setReading(true); setError(undefined); setReceiptImage(undefined); setOriginalReceipt(undefined); setReceipt(undefined)
              try {
                if (file && (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type) || file.size > 5 * 1024 * 1024)) throw new Error('Invalid receipt')
                const image = file ? await compressReceipt(file) : undefined
                setReceiptImage(image); setOriginalReceipt(file); setReceipt(file?.name)
              } catch { setError(t('data.upload')) } finally { setReading(false) }
            }} />
        </label>
        {receiptImage && <img src={receiptImage} alt={t('payment.receipt')} className="mt-2 max-h-40 rounded-lg ring-1 ring-line" />}
        <p className="mt-1.5 text-xs text-muted">{t('payment.receiptHint')}</p>
      </div>

      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      <Button type="submit" variant="gold" size="lg" className="w-full" disabled={busy || reading}>{busy || reading ? t('data.saving') : t('payment.submit')}</Button>
    </form>
  )
}
