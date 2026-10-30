import { useEffect, useRef, useState, type ReactNode } from 'react'
import { animate, AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import QRCode from 'qrcode'
import type { Consultant } from '../domain/types'
import { useT } from '../i18n'
import { Icon } from './Icon'
import { consultantPhoto } from '../features/team/photos'

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('')

/** Professional photo, or a clearly labelled initials placeholder until one is supplied. */
export function Avatar({ consultant, size = 'md', showPending = false }: { consultant: Consultant; size?: 'sm' | 'md' | 'lg' | 'xl'; showPending?: boolean }) {
  const { t, l } = useT()
  const dims = { sm: 'size-12 text-base', md: 'size-20 text-2xl', lg: 'size-28 text-4xl', xl: 'size-36 text-5xl' }[size]
  const photo = consultant.photo ?? consultantPhoto(consultant.id)
  if (photo)
    return <img src={photo} alt={l(consultant.name)} className={`${dims} shrink-0 rounded-2xl bg-mist-soft object-cover object-top`} />
  return (
    <div className="relative shrink-0">
      <div
        className={`${dims} relative flex items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-slate to-navy font-display font-semibold text-white`}
        role="img"
        aria-label={`${l(consultant.name)} — ${t('placeholder.photo')}`}
      >
        <svg className="absolute inset-0 size-full text-white/10" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M10 70 Q50 30 90 62" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 3" />
        </svg>
        <span className="relative" dir="auto">{initials(l(consultant.name))}</span>
      </div>
      {showPending && (
        <span className="absolute -bottom-2 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-muted shadow ring-1 ring-line">
          {t('placeholder.photo')}
        </span>
      )}
    </div>
  )
}

export function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(reduce ? value : 0)
  useEffect(() => {
    if (reduce) return setShown(value)
    const c = animate(0, value, { duration: 0.9, ease: [0.2, 0.8, 0.2, 1], onUpdate: setShown })
    return () => c.stop()
  }, [value, reduce])
  return <span dir="ltr" className="tabular">{shown.toFixed(decimals)}</span>
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="font-display text-2xl font-semibold leading-none text-ink">{value}</p>
      <p className="mt-1.5 text-xs leading-snug text-muted">{label}</p>
      {sub}
    </div>
  )
}

export function Countdown({ untilMs, now, onDone }: { untilMs: number; now: () => number; onDone?: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, untilMs - now()))
  const done = useRef(false)
  useEffect(() => {
    const tick = () => {
      const v = Math.max(0, untilMs - now())
      setLeft(v)
      if (v === 0 && !done.current) {
        done.current = true
        onDone?.()
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [untilMs, now, onDone])
  const m = Math.floor(left / 60000)
  const s = Math.floor((left % 60000) / 1000)
  const urgent = left < 5 * 60000
  return (
    <span dir="ltr" className={`font-display text-3xl font-semibold tabular ${urgent ? 'text-bad' : 'text-ink'}`} aria-live="off">
      {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  )
}

export function QrCode({ value, size = 132, className = '' }: { value: string; size?: number; className?: string }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    QRCode.toString(value, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#17202A', light: '#0000' } })
      .then(setSvg)
      .catch(() => setSvg(''))
  }, [value])
  return (
    <div
      data-qr-value={value}
      className={className}
      style={{ width: size, height: size }}
      role="img"
      aria-label="QR"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

export function BottomSheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const { t } = useT()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose()
      if (e.key !== 'Tab' || !ref.current) return
      // keep keyboard focus inside the open dialog
      const items = ref.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus()
    }
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div className="absolute inset-0 bg-ink/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            ref={ref}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="safe-bottom absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-white px-4 pt-3 outline-none sm:inset-x-auto sm:start-1/2 sm:w-[520px] sm:-translate-x-1/2 rtl:sm:translate-x-1/2"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" aria-hidden />
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{title}</h2>
              <button onClick={onClose} className="inline-flex size-11 items-center justify-center rounded-full hover:bg-mist-soft" aria-label={t('nav.close')}>
                <Icon name="x" />
              </button>
            </div>
            {children}
            {footer && <div className="sticky bottom-0 -mx-4 mt-4 border-t border-line bg-white px-4 py-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
