import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useT } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { cancelBooking, getConsultant, rescheduleBooking, submitPayment } from '../../store/actions'
import { Header } from '../../components/Header'
import { Footer } from '../../components/Footer'
import { Button, ButtonLink, ConfirmButton, Notice, StatusChip } from '../../components/ui'
import { BottomSheet } from '../../components/widgets'
import { Icon } from '../../components/Icon'
import { branchById } from '../../config/branches'
import { contact } from '../../config/contact'
import { BoardingPass } from './BoardingPass'
import { getSaver, ticketPdf } from './ticketPdf'
import { PaymentStep } from '../booking/steps/PaymentStep'
import { SlotStep } from '../booking/steps/SlotStep'
import { useStartBooking } from '../directory/ConsultantCard'
import type { Booking } from '../../domain/types'

export function NotFound() {
  const { t } = useT()
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-lg px-4 py-16 text-center">
        <Icon name="search" size={32} className="mx-auto text-mist" />
        <p className="mt-4 text-lg font-semibold text-ink">{t('ticket.notFound')}</p>
        <ButtonLink to="/find" className="mt-6">{t('ticket.findTitle')}</ButtonLink>
      </main>
    </>
  )
}

export function BookingPage() {
  const { token = '' } = useParams()
  const booking = useAppStore(s => Object.values(s.bookings).find(b => b.manageToken === token))
  if (!booking) return <NotFound />
  return <Manage b={booking} />
}

const RESCHEDULABLE = ['on-hold', 'confirmed']
const CANCELLABLE = ['reserved', 'on-hold', 'confirmed']

function Manage({ b }: { b: Booking }) {
  const { t, l } = useT()
  const now = useAppStore(s => s.now)
  const passRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)
  const [reschedOpen, setReschedOpen] = useState(false)
  const [newSlot, setNewSlot] = useState<string | null>(null)
  const [reschedError, setReschedError] = useState<string | null>(null)
  const startBooking = useStartBooking()
  const consultant = getConsultant(b.consultantId)
  const branch = branchById(b.branchId)
  const channel = t(b.customer.channel === 'email' ? 'booking.channelEmail' : 'booking.channelWhatsapp')
  const canPay = (b.status === 'reserved' && b.holdExpiresAt > now()) || b.status === 'rejected'

  const [saver, setSaver] = useState<Awaited<ReturnType<typeof getSaver>>>(null)
  const [downloadError, setDownloadError] = useState(false)
  useEffect(() => {
    let live = true
    getSaver().then(fn => live && setSaver(() => fn))
    return () => {
      live = false
    }
  }, [])

  const download = async () => {
    if (!passRef.current || !saver) return
    setDownloading(true)
    setDownloadError(false)
    try {
      await saver(`MG-ticket-${b.reference}.pdf`, await ticketPdf(passRef.current))
    } catch (err) {
      // A viewer declining the save dialog is not an error worth showing.
      if ((err as { code?: string })?.code !== 'declined') setDownloadError(true)
    } finally {
      setDownloading(false)
    }
  }

  const help = t(`statusHelp.${b.status}`, { channel, reason: b.rejectReason ?? '—' })
  const tone = ['confirmed', 'checked-in', 'completed'].includes(b.status) ? 'ok' : ['expired', 'rejected', 'cancelled', 'no-show'].includes(b.status) ? 'bad' : 'warn'

  return (
    <>
      <Header />
      <main id="main" className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[440px_minmax(0,1fr)]">
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-semibold text-ink">{t('ticket.title')}</h1>
            <StatusChip status={b.status} />
          </div>
          <BoardingPass ref={passRef} booking={b} />
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
          <Notice tone={tone}>
            <p className="font-semibold">{t(`status.${b.status}`)}</p>
            <p className="mt-0.5">{help}</p>
            {b.ticketSentVia && <p className="mt-1 text-xs">{t('ticket.sentVia', { channel: t(b.ticketSentVia === 'email' ? 'booking.channelEmail' : 'booking.channelWhatsapp') })}</p>}
          </Notice>

          {canPay && (
            <div className="rounded-3xl bg-paper p-1">
              <PaymentStep booking={b} onSubmit={p => submitPayment(b.id, p)} onExpiredRestart={() => startBooking(b.consultantId)} />
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {b.status === 'confirmed' && b.format === 'online' && b.meetingUrl && (
              <a href={b.meetingUrl} className="col-span-full inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-ok px-6 text-base font-semibold text-white hover:brightness-110">
                <Icon name="video" size={20} />
                {t('ticket.join')}
              </a>
            )}
            {saver && (
              <Button variant="primary" size="lg" onClick={download} disabled={downloading}>
                <Icon name="download" size={18} />
                {downloading ? t('ticket.downloading') : t('ticket.download')}
              </Button>
            )}
            <Button variant="ghost" size="lg" onClick={() => startBooking(b.consultantId)}>
              <Icon name="history" size={18} />
              {t('ticket.bookAgain')}
            </Button>
            {RESCHEDULABLE.includes(b.status) && (
              <Button variant="ghost" size="lg" onClick={() => setReschedOpen(true)}>
                <Icon name="calendar" size={18} />
                {t('ticket.reschedule')}
              </Button>
            )}
            {CANCELLABLE.includes(b.status) && (
              <ConfirmButton size="lg" label={t('ticket.cancelBooking')} confirmText={t('ticket.cancelConfirm')} onConfirm={() => cancelBooking(b.id, 'customer')}>
                <Icon name="x" size={18} />
                {t('ticket.cancelBooking')}
              </ConfirmButton>
            )}
          </div>
          {downloadError && <Notice tone="bad">{t('ticket.downloadFailed')}</Notice>}
          <p className="text-xs text-muted">{t('ticket.policyPending')}</p>

          <div className="rounded-2xl bg-white p-4 text-sm ring-1 ring-line">
            <p className="font-semibold text-ink">{t('common.support')}</p>
            <p className="mt-1 text-slate">
              <a className="font-semibold text-navy hover:underline" href={`tel:${contact.hotline}`}>{t('common.hotline')} <bdi dir="ltr">{contact.hotline}</bdi></a>
              {' — '}
              <a className="text-navy hover:underline" href={`mailto:${contact.email}`}><bdi dir="ltr">{contact.email}</bdi></a>
            </p>
            <p className="mt-2 text-muted">
              <Link to={`/consultant/${consultant.id}`} className="text-navy underline underline-offset-2">{l(consultant.name)}</Link> — {l(branch.name)}
            </p>
          </div>
        </div>
      </main>

      <BottomSheet
        open={reschedOpen}
        onClose={() => setReschedOpen(false)}
        title={t('ticket.reschedule')}
        footer={
          <Button
            className="w-full"
            size="lg"
            disabled={!newSlot}
            onClick={() => {
              try {
                rescheduleBooking(b.id, newSlot!, 'customer')
                setReschedOpen(false)
                setReschedError(null)
              } catch {
                setReschedError(t('payment.slotTaken'))
              }
              setNewSlot(null)
            }}
          >
            {t('common.confirm')}
          </Button>
        }
      >
        <p className="mb-4 text-sm text-muted">{t('ticket.rescheduleNote')}</p>
        <SlotStep
          consultantId={b.consultantId}
          branch={branch}
          format={b.format}
          durationMin={b.durationMin}
          slotStartIso={newSlot}
          error={reschedError}
          excludeBookingId={b.id}
          onChange={p => p.slotStartIso !== undefined && setNewSlot(p.slotStartIso)}
        />
      </BottomSheet>
      <Footer />
    </>
  )
}
