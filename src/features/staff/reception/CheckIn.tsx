import { useStaffBookings } from '../../../data/hooks'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useT } from '../../../i18n'
import { todayIn, useAppStore } from '../../../store/useAppStore'
import { isLive } from '../../../data/mode'
import type { Booking } from '../../../domain/types'
import { DataStatus, reportActionError } from '../../../data/feedback'
import { repo } from '../../../data'
import { arrivalTiming, checkInVerdict, type CheckInVerdict } from '../../../domain/bookingStatus'
import { formatInZone, dateInZone, formatDate } from '../../../domain/time'
import { normalizeDigits } from '../../../domain/phone'
import { Button, Notice } from '../../../components/ui'
import { TextField } from '../../../components/fields'
import { Icon } from '../../../components/Icon'
import { ScreenTitle } from '../StaffApp'
import { BookingMeta } from '../common'
import { ConsultantSwap } from './ConsultantSwap'

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> }
declare global { interface Window { BarcodeDetector?: new (o: { formats: string[] }) => Detector } }

export function CheckIn() {
  const { t, lang } = useT()
  const bookings = useStaffBookings()
  const now = useAppStore(s => s.now)
  const [code, setCode] = useState('')
  const [checked, setChecked] = useState<string | null>(null)
  const [remote, setRemote] = useState<{ booking?: Booking; verdict: CheckInVerdict }>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [camera, setCamera] = useState<'off' | 'on' | 'unavailable'>('off')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const find = (raw: string) => {
    const q = normalizeDigits(raw).trim()
    return Object.values(bookings).find(b => b.qrToken === q || b.reference === q.toUpperCase())
  }
  const booking = isLive ? remote?.booking : checked !== null ? find(checked) : undefined
  const verdict: CheckInVerdict | null = isLive ? remote?.verdict ?? null : checked === null ? null : checkInVerdict(booking, booking ? todayIn(booking.tz) : todayIn('Africa/Cairo'))
  const lookupCode = async (value: string) => {
    setChecked(value)
    if (!isLive) return
    setBusy(true); setError(null); setRemote(undefined)
    try { setRemote(await repo.checkIn(value)) } catch (error) { setError(error) } finally { setBusy(false) }
  }

  const lookup = (e?: FormEvent) => {
    e?.preventDefault()
    void lookupCode(code)
  }

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(tr => tr.stop())
    streamRef.current = null
    setCamera('off')
  }
  useEffect(() => stopCamera, [])

  const startCamera = async () => {
    if (!window.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) return setCamera('unavailable')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      setCamera('on')
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
      requestAnimationFrame(async function scan() {
        const v = videoRef.current
        if (!streamRef.current || !v) return
        if (v.srcObject !== stream) {
          v.srcObject = stream
          await v.play().catch(() => {})
        }
        const found = await detector.detect(v).catch(() => [])
        if (found[0]) {
          setCode(found[0].rawValue)
          void lookupCode(found[0].rawValue)
          stopCamera()
          return
        }
        requestAnimationFrame(scan)
      })
    } catch {
      setCamera('unavailable')
    }
  }

  const tone: Record<CheckInVerdict, 'ok' | 'warn' | 'bad'> = {
    ok: 'ok', 'on-hold': 'warn', unpaid: 'warn', 'wrong-date': 'warn',
    'not-found': 'bad', 'already-used': 'bad', cancelled: 'bad', expired: 'bad',
  }

  return (
    <>
      <ScreenTitle title={t('staff.screens.checkin')} />
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-5 ring-1 ring-line">
          <h2 className="mb-3 font-semibold text-ink">{t('staff.reception.scanTitle')}</h2>
          <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-slate-deep text-mist">
            {camera === 'on' ? (
              <video ref={videoRef} className="size-full object-cover" muted playsInline />
            ) : (
              <Icon name="qr" size={56} className="opacity-40" />
            )}
            <span className="pointer-events-none absolute inset-10 rounded-2xl border-2 border-gold/70" aria-hidden />
          </div>
          {camera === 'unavailable' && <Notice tone="warn" className="mt-3">{t('staff.reception.cameraUnavailable')}</Notice>}
          <Button variant="ghost" className="mt-3 w-full" onClick={camera === 'on' ? stopCamera : startCamera}>
            <Icon name="qr" size={16} />
            {camera === 'on' ? t('staff.reception.stopCamera') : t('staff.reception.startCamera')}
          </Button>
          <form onSubmit={lookup} className="mt-4 grid gap-3 border-t border-line pt-4">
            <TextField label={t('staff.reception.manual')} dir="ltr" value={code} onChange={e => setCode(e.target.value)} placeholder="MG-XXXX-XXXX" />
            <Button type="submit" disabled={busy}>{t('staff.reception.lookup')}</Button>
          </form>
        </section>

        <section aria-live="polite">
          <DataStatus loading={busy} error={error} />
          {verdict && (
            <div className="grid gap-3">
              <Notice tone={tone[verdict]} className="text-base">
                <p className="font-semibold">
                  {t(`staff.reception.verdict.${verdict}`, {
                    time: booking?.checkedInAt ? formatInZone(booking.checkedInAt, booking.tz, lang, 'time') : '',
                    date: booking ? formatDate(dateInZone(booking.startIso, booking.tz), lang) : '',
                  })}
                </p>
              </Notice>
              {verdict === 'ok' && booking && <ArrivalNotice b={booking} at={booking.checkedInAt ?? now()} />}
              {booking && (
                <div className="rounded-2xl bg-white p-4 ring-1 ring-line">
                  <BookingMeta b={booking} />
                </div>
              )}
              {booking && (verdict === 'ok' || verdict === 'already-used') && (
                <ConsultantSwap key={booking.id} b={booking} onChanged={next => { if (isLive) setRemote(r => r && { ...r, booking: next }) }} />
              )}
              {!isLive && verdict === 'ok' && booking && (
                <Button size="lg" variant="primary" onClick={() => repo.checkIn(booking.qrToken || booking.reference).catch(reportActionError)}>
                  <Icon name="check" size={18} />
                  {t('staff.reception.record')}
                </Button>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  )
}

/** Tells reception whether the customer is early, on time or more than the grace period late. */
function ArrivalNotice({ b, at }: { b: Booking; at: number }) {
  const { t, lang } = useT()
  const { kind, minutes } = arrivalTiming(b, at)
  const wait = minutes >= 60
    ? t('staff.reception.timing.hours', { h: Math.floor(minutes / 60), m: minutes % 60 })
    : t('staff.reception.timing.mins', { m: minutes })
  return (
    <Notice tone={kind === 'on-time' ? 'ok' : 'warn'}>
      <p className="flex items-center gap-2 font-semibold">
        <Icon name="clock" size={16} className="shrink-0" />
        {t(`staff.reception.timing.${kind}`, { time: formatInZone(b.startIso, b.tz, lang, 'time'), wait })}
      </p>
    </Notice>
  )
}
