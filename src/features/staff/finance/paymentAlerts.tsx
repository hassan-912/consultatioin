import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../../../i18n'
import { useAppStore } from '../../../store/useAppStore'
import { useStaffBookings } from '../../../data/hooks'
import { useLiveData } from '../../../data/liveState'
import { isLive } from '../../../data/mode'
import { Notice } from '../../../components/ui'

/** Statuses that sit in the finance review queue. */
export const REVIEW_STATUSES = ['on-hold', 'wrong-amount', 'duplicate', 'late-transfer']
const canReview = (role: string) => role === 'finance' || role === 'admin'

/** Live count of payments awaiting review for finance/admin; 0 for every other role. */
export function useReviewCount(): number {
  const role = useAppStore(s => s.role)
  const bookings = useStaffBookings()
  return canReview(role) ? Object.values(bookings).filter(b => REVIEW_STATUSES.includes(b.status)).length : 0
}

export function PaymentBadge() {
  const { t } = useT()
  const count = useReviewCount()
  if (!count) return null
  return (
    <span className="ms-auto inline-flex min-w-6 items-center justify-center rounded-full bg-gold px-1.5 text-xs font-bold text-ink" aria-label={t('staff.finance.alerts.badge', { count })}>
      <span aria-hidden="true">{count}</span>
    </span>
  )
}

const SOUND_KEY = 'mg-payment-sound'
const readSound = () => { try { return localStorage.getItem(SOUND_KEY) === '1' } catch { return false } }
function beep() {
  try {
    const Ctx = window.AudioContext
    if (!Ctx) return
    const ctx = new Ctx(); const osc = ctx.createOscillator(); const gain = ctx.createGain()
    osc.frequency.value = 880; gain.gain.value = 0.05
    osc.connect(gain); gain.connect(ctx.destination)
    osc.start(); osc.stop(ctx.currentTime + 0.18)
    osc.onended = () => { void ctx.close() }
  } catch { /* sound is optional */ }
}

/**
 * In-page alert for newly arrived on-hold payments while the workspace is open. The first snapshot after
 * sign-in (or after a live reload) only seeds what is already known, so opening the app never announces
 * old items. The live region stays mounted so assistive tech announces its text changes politely.
 */
export function NewPaymentNotice() {
  const { t } = useT()
  const role = useAppStore(s => s.role)
  const bookings = useStaffBookings()
  const loading = useLiveData(s => s.loading)
  const staffKey = useLiveData(s => s.staffKey)
  const enabled = canReview(role) && (!isLive || (!loading && staffKey !== null))
  const seen = useRef<Set<string> | null>(null)
  const [notice, setNotice] = useState<{ id: string; reference: string } | null>(null)
  const [sound, setSound] = useState(readSound)
  const soundRef = useRef(sound)
  soundRef.current = sound
  useEffect(() => {
    if (!enabled) { seen.current = null; setNotice(null); return }
    const onHold = Object.values(bookings).filter(b => b.status === 'on-hold')
    if (!seen.current) { seen.current = new Set(onHold.map(b => b.id)); return }
    const fresh = onHold.filter(b => !seen.current!.has(b.id))
    onHold.forEach(b => seen.current!.add(b.id))
    if (!fresh.length) return
    const latest = fresh.sort((a, b) => (b.payment?.submittedAt ?? b.createdAt) - (a.payment?.submittedAt ?? a.createdAt))[0]
    setNotice({ id: latest.id, reference: latest.reference })
    if (soundRef.current) beep()
  }, [bookings, enabled])
  const toggleSound = (on: boolean) => {
    setSound(on)
    try { localStorage.setItem(SOUND_KEY, on ? '1' : '0') } catch { /* preference only */ }
    if (on) beep()
  }
  if (!canReview(role)) return null
  return (
    <div className="mb-4 grid gap-2">
      <div aria-live="polite" aria-atomic="true">
        {notice && (
          <Notice tone="ok" className="items-center justify-between">
            <span className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold">{t('staff.finance.alerts.newPayment', { reference: notice.reference })}</span>
              <Link to={`/staff/payments?focus=${encodeURIComponent(notice.id)}`} onClick={() => setNotice(null)} className="inline-flex min-h-11 items-center font-semibold underline">
                {t('staff.finance.alerts.view')}
              </Link>
            </span>
            <button type="button" onClick={() => setNotice(null)} className="min-h-11 px-2 font-semibold">{t('staff.finance.alerts.dismiss')}</button>
          </Notice>
        )}
      </div>
      <label className="inline-flex min-h-11 items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={sound} onChange={e => toggleSound(e.target.checked)} className="size-4" />
        {t('staff.finance.alerts.sound')}
      </label>
    </div>
  )
}

/** Visible and announced when the live subscription drops; polling keeps data fresh meanwhile. */
export function ConnectionIndicator() {
  const { t } = useT()
  const connection = useLiveData(s => s.connection)
  return (
    <div aria-live="polite" aria-atomic="true">
      {isLive && connection === 'reconnecting' && <Notice tone="warn" className="mb-4">{t('staff.finance.alerts.reconnecting')}</Notice>}
    </div>
  )
}
