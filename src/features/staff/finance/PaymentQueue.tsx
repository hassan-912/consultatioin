import { useState } from 'react'
import { useT } from '../../../i18n'
import { useAppStore } from '../../../store/useAppStore'
import { repo, SlotTaken } from '../../../data'
import type { Booking } from '../../../domain/types'
import { formatInZone } from '../../../domain/time'
import { formatMoney } from '../../../domain/pricing'
import { paymentConfig } from '../../../config/payments'
import { Button, Ltr, Notice } from '../../../components/ui'
import { TextField } from '../../../components/fields'
import { Icon } from '../../../components/Icon'
import { BottomSheet } from '../../../components/widgets'
import { WhatsAppSender } from './WhatsAppSender'
import { ScreenTitle } from '../StaffApp'
import { BookingMeta, Empty, Tabs } from '../common'

const REVIEW = ['on-hold', 'wrong-amount', 'duplicate', 'late-transfer']

function ReviewItem({ b }: { b: Booking }) {
  const { t, l, lang } = useT()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string>()
  const method = paymentConfig.methods.find(m => m.id === b.payment?.method)
  const [slotTaken, setSlotTaken] = useState(false)
  const [viewing, setViewing] = useState(false)
  const act = (e: Parameters<typeof repo.staffTransition>[1]) =>
    repo.staffTransition(b.id, e, 'finance').catch(err => {
      if (err instanceof SlotTaken) setSlotTaken(true)
      else throw err
    })
  const onHold = b.status === 'on-hold'

  return (
    <article aria-label={b.reference} className="rounded-2xl bg-white p-4 ring-1 ring-line sm:p-5">
      <BookingMeta b={b} />
      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-paper p-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-muted">{t('staff.finance.expected')}</dt><dd className="font-semibold"><Ltr>{formatMoney(b.price, lang)}</Ltr></dd></div>
        <div><dt className="text-xs text-muted">{t('payment.method')}</dt><dd className="font-semibold">{method ? l(method.label) : '—'}</dd></div>
        <div><dt className="text-xs text-muted">{t('staff.finance.txn')}</dt><dd className="font-semibold"><Ltr>{b.payment?.txnRef ?? '—'}</Ltr></dd></div>
        <div>
          <dt className="text-xs text-muted">{t('staff.finance.receipt')}</dt>
          <dd className="truncate font-semibold">
            {b.payment?.receiptImage ? (
              <button type="button" onClick={() => setViewing(true)} className="group mt-0.5 flex items-center gap-2 text-start" aria-label={t('staff.finance.viewReceipt')}>
                <img src={b.payment.receiptImage} alt="" className="h-12 w-9 rounded-md object-cover ring-1 ring-line group-hover:ring-slate" />
                <span className="text-sm font-semibold text-navy group-hover:underline">{t('staff.finance.viewReceipt')}</span>
              </button>
            ) : (
              b.payment?.receiptName ?? <span className="font-normal text-muted">{t('staff.finance.noReceipt')}</span>
            )}
          </dd>
        </div>
        {b.payment && (
          <div className="col-span-2 sm:col-span-4"><dt className="sr-only">{t('staff.finance.submitted')}</dt>
            <dd className="text-xs text-muted">{t('staff.finance.submitted')}: {formatInZone(b.payment.submittedAt, 'Africa/Cairo', lang, 'full')}</dd>
          </div>
        )}
      </dl>

      <BottomSheet open={viewing} onClose={() => setViewing(false)} title={`${t('staff.finance.receipt')} — ${b.reference}`}>
        <div className="grid gap-4 pb-4 sm:grid-cols-[1fr_200px]">
          <img src={b.payment?.receiptImage} alt={t('staff.finance.receipt')} className="mx-auto max-h-[60dvh] w-auto rounded-xl ring-1 ring-line" />
          <dl className="grid content-start gap-3 text-sm">
            <div><dt className="text-xs text-muted">{t('staff.finance.expected')}</dt><dd className="font-semibold"><Ltr>{formatMoney(b.price, lang)}</Ltr></dd></div>
            <div><dt className="text-xs text-muted">{t('staff.finance.txn')}</dt><dd className="font-semibold"><Ltr>{b.payment?.txnRef}</Ltr></dd></div>
            <div><dt className="text-xs text-muted">{t('payment.method')}</dt><dd className="font-semibold">{method ? l(method.label) : '—'}</dd></div>
            <p className="text-xs text-muted">{t('staff.finance.verifiedBy')}</p>
          </dl>
        </div>
      </BottomSheet>
      {slotTaken && <Notice tone="bad" className="mt-4">{t('staff.finance.slotTaken')}</Notice>}
      {rejecting ? (
        <div className="mt-4 grid gap-3">
          <TextField label={t('staff.finance.reason')} value={reason} onChange={e => { setReason(e.target.value); setErr(undefined) }} error={err} />
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => (reason.trim() ? act({ type: 'reject', reason: reason.trim() }) : setErr(t('staff.finance.reasonRequired')))}>
              {t('common.confirm')}
            </Button>
            <Button variant="ghost" onClick={() => setRejecting(false)}>{t('common.cancel')}</Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => act({ type: 'verify' })}>
            <Icon name="check" size={16} />
            {t('staff.finance.verify')}
          </Button>
          {onHold && <Button variant="danger" onClick={() => setRejecting(true)}>{t('staff.finance.reject')}</Button>}
          {onHold && <Button variant="ghost" onClick={() => act({ type: 'wrong-amount' })}>{t('staff.finance.wrongAmount')}</Button>}
          {onHold && <Button variant="ghost" onClick={() => act({ type: 'duplicate' })}>{t('staff.finance.duplicate')}</Button>}
        </div>
      )}
    </article>
  )
}

function SendItem({ b }: { b: Booking }) {
  const { t } = useT()
  const via = b.customer.channel
  return (
    <article aria-label={b.reference} className="rounded-2xl bg-white p-4 ring-1 ring-line sm:p-5">
      <BookingMeta b={b} />
      <div className="mt-4 rounded-xl bg-paper p-3 text-sm">
        <p className="text-xs text-muted">{t('booking.channel')}: <span className="font-semibold text-ink">{t(via === 'email' ? 'booking.channelEmail' : 'booking.channelWhatsapp')}</span></p>
        <p className="mt-1"><Ltr>{via === 'email' ? b.customer.email : b.customer.phone}</Ltr></p>
      </div>
      {via === 'email' ? (
        <>
          <div className="mt-4">
            <Button onClick={() => repo.staffTransition(b.id, { type: 'mark-sent', via: 'email' }, 'finance')}>
              <Icon name="mail" size={16} />
              {t('staff.finance.sendEmail')}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">{t('staff.finance.emailSimulated')}</p>
        </>
      ) : (
        <WhatsAppSender b={b} />
      )}
    </article>
  )
}

export function PaymentQueue() {
  const { t } = useT()
  const all = Object.values(useAppStore(s => s.bookings))
  const [tab, setTab] = useState<'review' | 'sent' | 'history'>('review')
  const review = all.filter(b => REVIEW.includes(b.status))
    // Newest submissions first.
    .sort((a, b) => (b.payment?.submittedAt ?? b.createdAt) - (a.payment?.submittedAt ?? a.createdAt))
  const toSend = all
    .filter(b => b.status === 'confirmed' && !b.ticketSentAt)
    .sort((a, b) => (b.payment?.submittedAt ?? b.createdAt) - (a.payment?.submittedAt ?? a.createdAt))
  const history = all.filter(b => b.ticketSentAt).sort((a, b) => (b.ticketSentAt ?? 0) - (a.ticketSentAt ?? 0)).slice(0, 15)

  return (
    <>
      <ScreenTitle title={t('staff.screens.payments')} />
      <Notice tone="info" className="mb-5">{t('staff.finance.verifiedBy')}</Notice>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'review', label: t('staff.finance.tabs.review'), count: review.length },
          { id: 'sent', label: t('staff.finance.tabs.sent'), count: toSend.length },
          { id: 'history', label: t('staff.finance.tabs.history') },
        ]}
      />
      <div className="grid gap-3">
        {tab === 'review' && (review.length ? review.map(b => <ReviewItem key={b.id} b={b} />) : <Empty>{t('staff.finance.queueEmpty')}</Empty>)}
        {tab === 'sent' && (toSend.length ? toSend.map(b => <SendItem key={b.id} b={b} />) : <Empty>{t('staff.finance.queueEmpty')}</Empty>)}
        {tab === 'history' && history.map(b => (
          <div key={b.id} className="rounded-2xl bg-white p-4 ring-1 ring-line">
            <BookingMeta b={b} />
            <p className="mt-2 text-xs text-muted">{t('staff.finance.sentTo', { to: b.ticketSentVia === 'email' ? b.customer.email : b.customer.phone })}</p>
          </div>
        ))}
      </div>
    </>
  )
}
