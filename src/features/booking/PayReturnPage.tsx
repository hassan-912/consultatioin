import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useT } from '../../i18n'
import { repo } from '../../data'
import { forgetPayment, pendingPayment } from '../../data/pendingPayment'
import { useAppStore } from '../../store/useAppStore'
import { Header } from '../../components/Header'
import { Button, ButtonLink, Ltr } from '../../components/ui'
import { Icon } from '../../components/Icon'
import type { Booking } from '../../domain/types'
import { FlightLoader } from './FlightLoader'

const PAID = ['confirmed', 'checked-in', 'completed']
const FLAGGED = ['on-hold', 'wrong-amount', 'late-transfer', 'duplicate']
const POLL_MS = 3000
const POLLS = 40 // about two minutes
const ASK_EASYKASH_AT = [2, 5, 10, 20, 30] // ask EasyKash directly; its callback goes to the main website
// The plane lands and the steps tick (about 1s), then the customer gets ~2s to see it before the ticket opens.
const LANDING_MS = 3500

/** The status EasyKash added to the return link, lower-cased, from the real query string or the hash route's. */
export function easykashReturnStatus(hashSearch: URLSearchParams): string {
  const fromPage = new URLSearchParams(window.location.search)
  const status = (fromPage.get('status') ?? hashSearch.get('status') ?? '').toLowerCase()
  // Tidy the address bar: EasyKash's values don't belong in a link the customer might share.
  if (fromPage.has('status') || fromPage.has('customerReference')) {
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.hash)
  }
  return status
}

/**
 * Where EasyKash sends the customer back. Its query values (?status=…) are not signed, so they only choose
 * what to say while we wait: the booking's own status, set by the verified callback, decides everything.
 */
export function PayReturnPage() {
  const { t } = useT()
  const navigate = useNavigate()
  const resetDraft = useAppStore(s => s.resetDraft)
  const [search] = useSearchParams()
  const [pending] = useState(pendingPayment)
  // EasyKash appends its values before the '#' (…/?status=FAILED&…#/pay/return), in capitals; read either place.
  const [easykashStatus] = useState(() => easykashReturnStatus(search))
  const saysFailed = easykashStatus === 'failed'
  const [booking, setBooking] = useState<Booking | null>(null)
  const [slow, setSlow] = useState(false)
  const [round, setRound] = useState(0)

  useEffect(() => {
    if (!pending) return
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    let polls = 0
    setSlow(false)
    const tick = async () => {
      polls++
      if (round > 0 && polls === 1 || ASK_EASYKASH_AT.includes(polls)) await repo.checkOnlinePayment(pending.token).catch(() => undefined)
      const b = await repo.getByManageToken(pending.token).catch(() => null)
      if (!alive) return
      setBooking(b)
      if (!b || b.status !== 'reserved' || saysFailed) return
      if (polls >= POLLS) { setSlow(true); return }
      timer = setTimeout(tick, POLL_MS)
    }
    timer = setTimeout(tick, 0)
    return () => { alive = false; clearTimeout(timer) }
  }, [pending, saysFailed, round])

  // Confirmed: the plane lands, then the ticket opens.
  const landed = !!booking && PAID.includes(booking.status)
  useEffect(() => {
    if (!booking || !landed) return
    forgetPayment()
    const id = setTimeout(() => {
      resetDraft(null)
      navigate(`/ticket/${booking.manageToken}`, { replace: true })
    }, LANDING_MS)
    return () => clearTimeout(id)
  }, [booking, landed, navigate, resetDraft])

  const panel = (icon: 'clock' | 'check' | 'alert', tone: string, title: string, body: string, actions?: React.ReactNode) => (
    <div className="rounded-3xl bg-white p-6 text-center ring-1 ring-line">
      <span className={`mx-auto inline-flex size-14 items-center justify-center rounded-full ${tone}`}><Icon name={icon} size={26} /></span>
      <h1 className="mt-4 text-2xl font-semibold text-ink">{title}</h1>
      <p className="mx-auto mt-2 max-w-[52ch] text-slate">{body}</p>
      {booking && <p className="mt-3 text-sm text-muted">{t('common.reference')}: <Ltr className="font-semibold text-ink">{booking.reference}</Ltr></p>}
      {actions && <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  )
  const viewBooking = pending && <ButtonLink to={`/booking/${pending.token}`} variant="ghost">{t('payReturn.viewBooking')}</ButtonLink>

  let content
  if (landed) content = <FlightLoader landed />
  else if (!pending) content = panel('alert', 'bg-paper text-muted', t('payReturn.missing'), t('payReturn.missingHint'), <ButtonLink to="/find">{t('ticket.findTitle')}</ButtonLink>)
  else if (booking && FLAGGED.includes(booking.status)) content = panel('check', 'bg-warn-soft text-warn', t('payReturn.flaggedTitle'), t('payReturn.flaggedBody'), viewBooking)
  else if (booking && booking.status !== 'reserved' && !PAID.includes(booking.status)) content = panel('alert', 'bg-bad-soft text-bad', t('payment.expiredTitle'), t('payment.expiredBody'), viewBooking)
  else if (booking && saysFailed) content = panel('alert', 'bg-bad-soft text-bad', t('payReturn.failedTitle'), t('payReturn.failedBody'),
    <ButtonLink to={`/booking/${pending.token}`}>{t('payReturn.tryAgain')}</ButtonLink>)
  else if (slow) content = panel('clock', 'bg-paper text-slate', t('payReturn.slowTitle'), t('payReturn.slowBody'),
    <><Button onClick={() => setRound(n => n + 1)}>{t('payReturn.checkAgain')}</Button>{viewBooking}</>)
  else content = <FlightLoader landed={landed} />

  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-xl px-4 py-12">{content}</main>
    </>
  )
}
