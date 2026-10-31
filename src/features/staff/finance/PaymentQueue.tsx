import { useStaffBookings } from '../../../data/hooks'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useT } from '../../../i18n'
import { repo, SlotTaken } from '../../../data'
import type { Booking } from '../../../domain/types'
import { formatInZone } from '../../../domain/time'
import { formatMoney } from '../../../domain/pricing'
import { paymentConfig } from '../../../config/payments'
import { Button, Ltr, Notice } from '../../../components/ui'
import { Segmented, TextField } from '../../../components/fields'
import { Icon } from '../../../components/Icon'
import { BottomSheet } from '../../../components/widgets'
import { WhatsAppSender } from './WhatsAppSender'
import { ScreenTitle } from '../StaffApp'
import { BookingMeta, Empty, Tabs } from '../common'
import { isLive } from '../../../data/mode'
import { DataStatus, errorKey } from '../../../data/feedback'

import { REVIEW_STATUSES as REVIEW } from './paymentAlerts'

function ReviewItem({ b, focused }: { b: Booking; focused?: boolean }) {
  const { t, l, lang } = useT()
  const ref = useRef<HTMLElement>(null)
  useEffect(() => { if (focused) { ref.current?.scrollIntoView?.({ block: 'center' }); ref.current?.focus() } }, [focused])
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string>()
  const method = paymentConfig.methods.find(m => m.id === b.payment?.method)
  const [slotTaken, setSlotTaken] = useState(false)
  const [viewing, setViewing] = useState(false)
  const [receiptUrl, setReceiptUrl] = useState<string>()
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [receiptError, setReceiptError] = useState<unknown>(null)
  const viewReceipt = async () => {
    setViewing(true); setReceiptLoading(true); setReceiptError(null)
    try {
      const url = await repo.receiptUrl(b.id)
      if (!url) throw new Error('Receipt unavailable')
      setReceiptUrl(url)
    }
    catch (error) { setReceiptError(error) } finally { setReceiptLoading(false) }
  }
  const act = (e: Parameters<typeof repo.staffTransition>[1]) =>
    repo.staffTransition(b.id, e, 'finance').catch(err => {
      if (err instanceof SlotTaken) setSlotTaken(true)
      else setErr(t(errorKey(err)))
    })
  const onHold = b.status === 'on-hold'

  return (
    <article ref={ref} tabIndex={-1} aria-label={b.reference} className={`rounded-2xl bg-white p-4 outline-none ring-1 sm:p-5 ${focused ? 'ring-2 ring-gold' : 'ring-line'}`}>
      <BookingMeta b={b} />
      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-paper p-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-muted">{t('staff.finance.expected')}</dt><dd className="font-semibold"><Ltr>{formatMoney(b.price, lang)}</Ltr></dd></div>
        <div><dt className="text-xs text-muted">{t('payment.method')}</dt><dd className="font-semibold">{method ? l(method.label) : '—'}</dd></div>
        <div><dt className="text-xs text-muted">{t('staff.finance.txn')}</dt><dd className="font-semibold"><Ltr>{b.payment?.txnRef ?? '—'}</Ltr></dd></div>
        <div>
          <dt className="text-xs text-muted">{t('staff.finance.receipt')}</dt>
          <dd className="truncate font-semibold">
            {b.payment?.receiptImage || b.payment?.hasReceipt ? (
              <button type="button" onClick={() => void viewReceipt()} className="group mt-0.5 flex min-h-11 items-center gap-2 text-start" aria-label={t('staff.finance.viewReceipt')}>
                {b.payment.receiptImage && <img src={b.payment.receiptImage} alt="" className="h-12 w-9 rounded-md object-cover ring-1 ring-line group-hover:ring-slate" />}
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

      <BottomSheet open={viewing} onClose={() => { setViewing(false); setReceiptUrl(undefined) }} title={`${t('staff.finance.receipt')} — ${b.reference}`}>
        <div className="grid gap-4 pb-4 sm:grid-cols-[1fr_200px]">
          <DataStatus loading={receiptLoading} error={receiptError} />
          {receiptUrl && (b.payment?.receiptPath?.toLowerCase().endsWith('.pdf')
            ? <iframe src={receiptUrl} title={t('staff.finance.receipt')} className="h-[60dvh] w-full" />
            : <img src={receiptUrl} alt={t('staff.finance.receipt')} className="mx-auto max-h-[60dvh] w-auto rounded-xl ring-1 ring-line" />)}
          <dl className="grid content-start gap-3 text-sm">
            <div><dt className="text-xs text-muted">{t('staff.finance.expected')}</dt><dd className="font-semibold"><Ltr>{formatMoney(b.price, lang)}</Ltr></dd></div>
            <div><dt className="text-xs text-muted">{t('staff.finance.txn')}</dt><dd className="font-semibold"><Ltr>{b.payment?.txnRef}</Ltr></dd></div>
            <div><dt className="text-xs text-muted">{t('payment.method')}</dt><dd className="font-semibold">{method ? l(method.label) : '—'}</dd></div>
            <p className="text-xs text-muted">{t('staff.finance.verifiedBy')}</p>
          </dl>
        </div>
      </BottomSheet>
      {slotTaken && <Notice tone="bad" className="mt-4">{t('staff.finance.slotTaken')}</Notice>}
      {err && !rejecting && <p role="alert" className="mt-3 text-sm text-bad">{err}</p>}
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
  const preferred = b.customer.channel
  const hasEmail = !!b.customer.email?.trim()
  // Finance may send by either channel; the customer's preference is only the default.
  const [via, setVia] = useState<'email' | 'whatsapp'>(preferred === 'email' && hasEmail ? 'email' : 'whatsapp')
  const [queued, setQueued] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const sendEmail = async () => {
    setBusy(true); setError(null)
    try { await repo.queueTicketEmail(b.id); setQueued(true) } catch (err) { setError(err) } finally { setBusy(false) }
  }
  const emailNote = queued ? 'staff.finance.emailQueued'
    : !isLive ? 'staff.finance.emailSimulated'
    : preferred === 'email' ? 'staff.finance.emailAuto' : 'staff.finance.emailManual'
  return (
    <article aria-label={b.reference} className="rounded-2xl bg-white p-4 ring-1 ring-line sm:p-5">
      <BookingMeta b={b} />
      <div className="mt-4 grid gap-1 rounded-xl bg-paper p-3 text-sm">
        <p className="text-xs text-muted">{t('staff.finance.preferred')}: <span className="font-semibold text-ink">{t(preferred === 'email' ? 'booking.channelEmail' : 'booking.channelWhatsapp')}</span></p>
        {hasEmail && <p><Ltr>{b.customer.email}</Ltr></p>}
        <p><Ltr>{b.customer.phone}</Ltr></p>
      </div>
      <div className="mt-4">
        <Segmented
          name={`send-via-${b.id}`}
          label={t('staff.finance.sendVia')}
          value={via}
          onChange={setVia}
          options={[
            { value: 'email', label: t('booking.channelEmail'), disabled: !hasEmail },
            { value: 'whatsapp', label: t('booking.channelWhatsapp') },
          ]}
        />
      </div>
      {via === 'email' ? (
        hasEmail ? (
          <>
            <div className="mt-4">
              <Button disabled={busy || queued} onClick={() => void sendEmail()}>
                <Icon name="mail" size={16} />
                {t('staff.finance.sendEmail')}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted">{t(emailNote)}</p>
            {error != null && <Notice tone="bad" className="mt-3">{t(errorKey(error))}</Notice>}
          </>
        ) : <Notice tone="warn" className="mt-4">{t('staff.finance.emailNoAddress')}</Notice>
      ) : (
        <WhatsAppSender b={b} />
      )}
    </article>
  )
}

export function PaymentQueue() {
  const { t } = useT()
  const all = Object.values(useStaffBookings())
  const [tab, setTab] = useState<'review' | 'sent' | 'history'>('review')
  const [params] = useSearchParams()
  const focusId = params.get('focus')
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
        {tab === 'review' && (review.length ? review.map(b => <ReviewItem key={b.id} b={b} focused={b.id === focusId} />) : <Empty>{t('staff.finance.queueEmpty')}</Empty>)}
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
