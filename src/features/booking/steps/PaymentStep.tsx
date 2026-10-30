import { useState, type FormEvent } from 'react'
import { useT } from '../../../i18n'
import type { Booking, PaymentMethodId } from '../../../domain/types'
import { paymentConfig } from '../../../config/payments'
import { useAppStore } from '../../../store/useAppStore'
import { expireDue } from '../../../store/actions'
import { formatMoney } from '../../../domain/pricing'
import { CopyField } from '../../../components/CopyField'
import { Countdown } from '../../../components/widgets'
import { TextField } from '../../../components/fields'
import { Button, Ltr, Notice } from '../../../components/ui'
import { Icon } from '../../../components/Icon'

export function PaymentStep({ booking, onSubmit, onExpiredRestart }: {
  booking: Booking
  onSubmit: (p: { method: PaymentMethodId; txnRef: string; receiptName?: string }) => void
  onExpiredRestart: () => void
}) {
  const { t, l, lang } = useT()
  const now = useAppStore(s => s.now)
  const [method, setMethod] = useState<PaymentMethodId>('instapay')
  const [txnRef, setTxnRef] = useState('')
  const [receipt, setReceipt] = useState<string>()
  const [error, setError] = useState<string>()
  const m = paymentConfig.methods.find(x => x.id === method)!
  const expired = booking.status === 'expired' || booking.holdExpiresAt <= now()
  const amount = formatMoney(booking.price, lang)

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

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (txnRef.trim().length < 4) return setError(t('validation.txnRef'))
    onSubmit({ method, txnRef, receiptName: receipt })
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      <div className="rounded-3xl bg-slate-deep p-5 text-white sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-mist">{t('common.reference')}</p>
            <p data-testid="booking-ref" dir="ltr" className="font-display text-2xl font-semibold tracking-wider text-gold">{booking.reference}</p>
          </div>
          <div className="text-end">
            <p className="text-sm text-mist">{t('payment.reservedUntil')}</p>
            <div className="[&_span]:text-white"><Countdown untilMs={booking.holdExpiresAt} now={now} onDone={expireDue} /></div>
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
        <div className="grid grid-cols-2 gap-2">
          {paymentConfig.methods.map(pm => (
            <label
              key={pm.id}
              className={`flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 px-3 font-semibold has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-gold/40 ${
                method === pm.id ? 'border-slate bg-white text-ink' : 'border-line bg-white text-muted hover:border-mist'
              }`}
            >
              <input type="radio" name="method" className="sr-only" checked={method === pm.id} onChange={() => setMethod(pm.id)} />
              <Icon name={pm.id === 'instapay' ? 'card' : 'phone'} size={18} />
              {l(pm.label)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-2">
        <CopyField label={t('payment.amount')} value={String(booking.price.amount)} />
        <CopyField label={l(m.detailLabel)} value={m.detail} />
        <CopyField label={t('payment.recipient')} value={m.recipient} mono={false} />
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
          <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={e => setReceipt(e.target.files?.[0]?.name)} />
        </label>
        <p className="mt-1.5 text-xs text-muted">{t('payment.receiptHint')}</p>
      </div>

      <Button type="submit" variant="gold" size="lg" className="w-full">{t('payment.submit')}</Button>
    </form>
  )
}
