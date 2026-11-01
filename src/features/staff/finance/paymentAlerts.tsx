import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useT } from '../../../i18n'
import { useAppStore } from '../../../store/useAppStore'
import { useStaffBookings } from '../../../data/hooks'
import { useLiveData } from '../../../data/liveState'
import { isLive } from '../../../data/mode'
import { Notice } from '../../../components/ui'
import { Icon } from '../../../components/Icon'

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
// On unless finance switched it off; only an explicit '0' disables it.
const readSound = () => { try { return localStorage.getItem(SOUND_KEY) !== '0' } catch { return true } }
let audio: AudioContext | null = null
/** Two rounds of a bright rising chime, loud enough to hear across an office. */
function chime() {
  try {
    const Ctx = window.AudioContext
    if (!Ctx) return
    audio ??= new Ctx()
    const ctx = audio
    void ctx.resume?.()
    const master = ctx.createGain()
    master.gain.value = 0.8
    master.connect(ctx.destination)
    for (const round of [0, 0.85]) {
      [784, 988, 1319].forEach((freq, i) => {
        const at = ctx.currentTime + round + i * 0.15
        const osc = ctx.createOscillator(); const gain = ctx.createGain()
        osc.type = 'triangle'; osc.frequency.value = freq
        gain.gain.setValueAtTime(0.0001, at)
        gain.gain.exponentialRampToValueAtTime(1, at + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5)
        osc.connect(gain); gain.connect(master)
        osc.start(at); osc.stop(at + 0.55)
      })
    }
  } catch { /* sound is optional */ }
}

type Permission = 'default' | 'granted' | 'denied' | 'unsupported'
const readPermission = (): Permission => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)

/** OS-level pop-up so a new payment is seen even when the tab is in the background. Only after finance opted in. */
function desktopNotify(title: string, body: string, onOpen: () => void) {
  try {
    if (readPermission() !== 'granted') return
    const n = new Notification(title, { body, tag: 'mg-payment', requireInteraction: true })
    n.onclick = () => { window.focus(); onOpen(); n.close() }
  } catch { /* pop-ups are optional */ }
}

/** Prefixes the tab title while the tab is hidden, until finance comes back to it. */
function flashTitle(text: string) {
  if (!document.hidden) return
  const original = document.title.replace(/^🔔 .*? · /, '')
  document.title = `🔔 ${text} · ${original}`
  const restore = () => {
    if (document.hidden) return
    document.title = original
    document.removeEventListener('visibilitychange', restore)
  }
  document.addEventListener('visibilitychange', restore)
}

/**
 * Alert for newly arrived on-hold payments while the workspace is open: a large pop-up card that stays until
 * dismissed, a chime, a flashing tab title and (if allowed) a desktop notification. The first snapshot after
 * sign-in (or after a live reload) only seeds what is already known, so opening the app never announces old
 * items. The live region stays mounted so assistive tech announces its text changes politely.
 */
export function NewPaymentNotice() {
  const { t } = useT()
  const navigate = useNavigate()
  const role = useAppStore(s => s.role)
  const bookings = useStaffBookings()
  const loading = useLiveData(s => s.loading)
  const staffKey = useLiveData(s => s.staffKey)
  const enabled = canReview(role) && (!isLive || (!loading && staffKey !== null))
  const seen = useRef<Set<string> | null>(null)
  const [notice, setNotice] = useState<{ id: string; reference: string } | null>(null)
  const [sound, setSound] = useState(readSound)
  const [permission, setPermission] = useState(readPermission)
  const soundRef = useRef(sound)
  soundRef.current = sound
  const tRef = useRef(t)
  tRef.current = t
  useEffect(() => {
    if (!enabled) { seen.current = null; setNotice(null); return }
    const onHold = Object.values(bookings).filter(b => b.status === 'on-hold')
    if (!seen.current) { seen.current = new Set(onHold.map(b => b.id)); return }
    const fresh = onHold.filter(b => !seen.current!.has(b.id))
    onHold.forEach(b => seen.current!.add(b.id))
    if (!fresh.length) return
    const latest = fresh.sort((a, b) => (b.payment?.submittedAt ?? b.createdAt) - (a.payment?.submittedAt ?? a.createdAt))[0]
    setNotice({ id: latest.id, reference: latest.reference })
    if (soundRef.current) chime()
    const tr = tRef.current
    flashTitle(tr('staff.finance.alerts.newPaymentTitle'))
    desktopNotify(tr('staff.finance.alerts.newPaymentTitle'), tr('staff.finance.alerts.newPayment', { reference: latest.reference }), () => {
      setNotice(null)
      navigate(`/staff/payments?focus=${encodeURIComponent(latest.id)}`)
    })
  }, [bookings, enabled, navigate])
  const toggleSound = (on: boolean) => {
    setSound(on)
    try { localStorage.setItem(SOUND_KEY, on ? '1' : '0') } catch { /* preference only */ }
    if (on) chime()
  }
  const askPermission = async () => {
    try { setPermission(await Notification.requestPermission()) } catch { setPermission(readPermission()) }
  }
  if (!canReview(role)) return null
  return (
    <div className="mb-4 grid gap-2">
      <div aria-live="polite" aria-atomic="true" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center sm:inset-x-auto sm:bottom-6 sm:end-6">
        {notice && (
          <div className="alert-pop pointer-events-auto w-full max-w-sm rounded-2xl bg-slate-deep p-4 text-white shadow-[var(--shadow-lift)] ring-4 ring-gold">
            <div className="flex items-start gap-3">
              <span className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-gold text-ink">
                <span className="absolute inset-0 animate-ping rounded-full bg-gold/60 motion-reduce:animate-none" aria-hidden />
                <Icon name="bell" size={22} className="relative" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-gold">{t('staff.finance.alerts.newPaymentTitle')}</p>
                <p className="mt-0.5 text-base font-semibold">{t('staff.finance.alerts.newPayment', { reference: notice.reference })}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setNotice(null)} className="min-h-11 rounded-xl px-3 font-semibold text-mist hover:text-white">{t('staff.finance.alerts.dismiss')}</button>
              <Link to={`/staff/payments?focus=${encodeURIComponent(notice.id)}`} onClick={() => setNotice(null)} className="inline-flex min-h-11 items-center rounded-xl bg-gold px-4 font-semibold text-ink hover:brightness-105">
                {t('staff.finance.alerts.view')}
              </Link>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <label className="inline-flex min-h-11 items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={sound} onChange={e => toggleSound(e.target.checked)} className="size-4" />
          {t('staff.finance.alerts.sound')}
        </label>
        {permission === 'default' && (
          <button type="button" onClick={() => void askPermission()} className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-navy underline underline-offset-2">
            <Icon name="bell" size={14} />
            {t('staff.finance.alerts.popupOn')}
          </button>
        )}
        {permission === 'granted' && <span className="inline-flex items-center gap-1.5 text-xs text-muted"><Icon name="check" size={14} className="text-ok" />{t('staff.finance.alerts.popupActive')}</span>}
        {permission === 'denied' && <span className="text-xs text-muted">{t('staff.finance.alerts.popupBlocked')}</span>}
      </div>
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
