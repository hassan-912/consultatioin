import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../../../i18n'
import { useAppStore } from '../../../store/useAppStore'
import { useStaffBookings } from '../../../data/hooks'
import { useLiveData } from '../../../data/liveState'
import { isLive } from '../../../data/mode'
import type { Booking } from '../../../domain/types'
import { isPaid } from '../../../domain/bookingStatus'
import { Icon } from '../../../components/Icon'
import { chime, desktopNotify, flashTitle } from '../finance/paymentAlerts'

const SOUND_KEY = 'mg-sales-paid-sound'
const readSound = () => { try { return localStorage.getItem(SOUND_KEY) !== '0' } catch { return true } }

/**
 * Which bookings just became paid. `seen` holds the ids already known to be paid (null before the first
 * snapshot). Returns the newly paid bookings and the updated `seen` set.
 */
export function freshlyPaid(bookings: Booking[], seen: Set<string> | null): { fresh: Booking[]; seen: Set<string> } {
  const paid = bookings.filter(b => isPaid(b.status))
  // First snapshot after sign-in: remember what is already paid, announce nothing.
  if (!seen) return { fresh: [], seen: new Set(paid.map(b => b.id)) }
  const fresh = paid.filter(b => !seen.has(b.id))
  return { fresh, seen: new Set([...seen, ...fresh.map(b => b.id)]) }
}

/** Sales manager only: a pop-up card, a chime, a flashing tab title and a desktop notification when a client pays. */
export function SalesPaidNotice() {
  const { t } = useT()
  const manager = useAppStore(s => s.role === 'sales' && !!s.staffSession?.salesManager)
  const bookings = useStaffBookings()
  const loading = useLiveData(s => s.loading)
  const staffKey = useLiveData(s => s.staffKey)
  const enabled = manager && (!isLive || (!loading && staffKey !== null))
  const seen = useRef<Set<string> | null>(null)
  const [notice, setNotice] = useState<{ name: string; reference: string } | null>(null)
  const [sound, setSound] = useState(readSound)
  const soundRef = useRef(sound)
  soundRef.current = sound
  const tRef = useRef(t)
  tRef.current = t
  useEffect(() => {
    if (!enabled) { seen.current = null; setNotice(null); return }
    const next = freshlyPaid(Object.values(bookings), seen.current)
    seen.current = next.seen
    if (!next.fresh.length) return
    const latest = [...next.fresh].sort((a, b) => b.createdAt - a.createdAt)[0]
    const info = { name: latest.customer.name, reference: latest.reference }
    setNotice(info)
    if (soundRef.current) chime()
    const tr = tRef.current
    flashTitle(tr('sales.alerts.title'))
    desktopNotify(tr('sales.alerts.title'), tr('sales.alerts.body', info), () => setNotice(null), 'mg-sales-paid')
  }, [bookings, enabled])
  const toggleSound = (on: boolean) => {
    setSound(on)
    try { localStorage.setItem(SOUND_KEY, on ? '1' : '0') } catch { /* preference only */ }
    if (on) chime()
  }
  if (!manager) return null
  return (
    <div className="mb-4">
      <div aria-live="polite" aria-atomic="true" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center sm:inset-x-auto sm:bottom-6 sm:end-6">
        {notice && (
          <div className="alert-pop pointer-events-auto w-full max-w-sm rounded-2xl bg-slate-deep p-4 text-white shadow-[var(--shadow-lift)] ring-4 ring-gold">
            <div className="flex items-start gap-3">
              <span className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-gold text-ink">
                <span className="absolute inset-0 animate-ping rounded-full bg-gold/60 motion-reduce:animate-none" aria-hidden />
                <Icon name="bell" size={22} className="relative" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-gold">{t('sales.alerts.title')}</p>
                <p dir="auto" className="mt-0.5 text-base font-semibold">{t('sales.alerts.body', notice)}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setNotice(null)} className="min-h-11 rounded-xl px-3 font-semibold text-mist hover:text-white">{t('sales.alerts.dismiss')}</button>
              <Link to="/staff/my-clients" onClick={() => setNotice(null)} className="inline-flex min-h-11 items-center rounded-xl bg-gold px-4 font-semibold text-ink hover:brightness-105">
                {t('sales.alerts.view')}
              </Link>
            </div>
          </div>
        )}
      </div>
      <label className="inline-flex min-h-11 items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={sound} onChange={e => toggleSound(e.target.checked)} className="size-4" />
        {t('sales.alerts.sound')}
      </label>
    </div>
  )
}
