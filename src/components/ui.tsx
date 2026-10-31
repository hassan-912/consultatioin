import { forwardRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { useT } from '../i18n'
import type { BookingStatus } from '../domain/types'
import { Icon } from './Icon'
import { isLive } from '../data/mode'
import { reportActionError } from '../data/feedback'

/** Keeps phone numbers, emails, references and prices left-to-right inside Arabic text. */
export const Ltr = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <bdi dir="ltr" className={className}>{children}</bdi>
)

type Variant = 'primary' | 'gold' | 'ghost' | 'quiet' | 'danger' | 'light'
type Size = 'md' | 'lg' | 'sm'

const variants: Record<Variant, string> = {
  primary: 'bg-slate text-white hover:bg-slate-deep active:bg-ink shadow-sm',
  gold: 'bg-gold text-ink hover:bg-[#d4b67c] active:bg-[#b8975a] shadow-[0_6px_18px_-8px_rgb(201_168_106/0.9)]',
  ghost: 'border border-line bg-white text-slate hover:border-mist hover:bg-mist-soft/50',
  quiet: 'text-navy hover:bg-mist-soft/70',
  danger: 'border border-bad/30 bg-white text-bad hover:bg-bad-soft',
  light: 'bg-white/10 text-white border border-white/20 hover:bg-white/20 backdrop-blur',
}
const sizes: Record<Size, string> = {
  sm: 'min-h-10 px-3.5 text-sm gap-1.5 rounded-xl',
  md: 'min-h-11 px-5 text-[15px] gap-2 rounded-xl',
  lg: 'min-h-13 px-6 text-base gap-2.5 rounded-2xl',
}

export const btn = (v: Variant = 'primary', s: Size = 'md', extra = '') =>
  `inline-flex items-center justify-center font-semibold transition-colors duration-150 disabled:opacity-45 disabled:pointer-events-none select-none ${variants[v]} ${sizes[s]} ${extra}`

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }>(
  ({ variant = 'primary', size = 'md', className = '', type = 'button', onClick, disabled, ...rest }, ref) => {
    const [busy, setBusy] = useState(false)
    return <button ref={ref} type={type} className={btn(variant, size, className)} {...rest} disabled={disabled || busy} aria-busy={busy || undefined} onClick={e => {
      try {
        const pending = onClick?.(e) as unknown
        if (pending && typeof (pending as Promise<unknown>).then === 'function') {
          setBusy(true)
          Promise.resolve(pending).catch(reportActionError).finally(() => setBusy(false))
        }
      } catch (error) { reportActionError(error) }
    }} />
  },
)

export const ButtonLink = ({ variant = 'primary', size = 'md', className = '', ...rest }: LinkProps & { variant?: Variant; size?: Size }) => (
  <Link className={btn(variant, size, className)} {...rest} />
)

export function DemoBadge({ className = '', tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  const { t } = useT()
  if (isLive) return null
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        tone === 'dark' ? 'bg-white/10 text-mist ring-1 ring-white/15' : 'bg-gold-soft text-gold-deep ring-1 ring-gold/30'
      } ${className}`}
    >
      <Icon name="info" size={12} />
      {t('common.demo')}
    </span>
  )
}

export type PlaceholderKind = 'photo' | 'bio' | 'video' | 'title' | 'specializations' | 'languages' | 'qualifications'

export function Placeholder({ kind, hint, className = '' }: { kind: PlaceholderKind; hint?: string; className?: string }) {
  const { t } = useT()
  return (
    <div className={`rounded-xl border border-dashed border-mist bg-white/60 px-4 py-3 text-sm text-muted ${className}`}>
      <p className="flex items-center gap-2 font-semibold text-slate">
        <Icon name="clock" size={15} className="text-gold-deep" />
        {t(`placeholder.${kind}`)}
      </p>
      {hint && <p className="mt-1">{hint}</p>}
    </div>
  )
}

const statusTone: Record<BookingStatus, string> = {
  reserved: 'bg-mist-soft text-slate',
  'on-hold': 'bg-warn-soft text-warn',
  confirmed: 'bg-ok-soft text-ok',
  'checked-in': 'bg-ok-soft text-ok',
  completed: 'bg-mist-soft text-slate',
  'no-show': 'bg-bad-soft text-bad',
  expired: 'bg-bad-soft text-bad',
  rejected: 'bg-bad-soft text-bad',
  'wrong-amount': 'bg-warn-soft text-warn',
  duplicate: 'bg-warn-soft text-warn',
  'late-transfer': 'bg-warn-soft text-warn',
  cancelled: 'bg-mist-soft text-muted',
}

export function StatusChip({ status, className = '' }: { status: BookingStatus; className?: string }) {
  const { t } = useT()
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[status]} ${className}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {t(`status.${status}`)}
    </span>
  )
}

export function SectionTitle({ children, aside, id }: { children: ReactNode; aside?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 id={id} className="text-lg font-semibold text-ink">{children}</h2>
      {aside}
    </div>
  )
}

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-card)] ring-1 ring-line/60 ${className}`}>{children}</div>
)

export function Notice({ tone = 'info', children, className = '' }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; children: ReactNode; className?: string }) {
  const map = {
    info: ['bg-mist-soft/70 text-slate', 'info'],
    warn: ['bg-warn-soft text-warn', 'alert'],
    bad: ['bg-bad-soft text-bad', 'alert'],
    ok: ['bg-ok-soft text-ok', 'shield'],
  } as const
  return (
    <div className={`flex gap-2.5 rounded-xl px-3.5 py-3 text-sm ${map[tone][0]} ${className}`}>
      <Icon name={map[tone][1]} size={17} className="mt-0.5" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Two-step in-page confirmation (native confirm() is unavailable in embedded viewers). */
export function ConfirmButton({ label, confirmText, onConfirm, variant = 'danger', size = 'md', className = '', children }: {
  label: string; confirmText: string; onConfirm: () => unknown; variant?: Variant; size?: Size; className?: string; children?: ReactNode
}) {
  const [asking, setAsking] = useState(false)
  const { t } = useT()
  if (!asking)
    return <Button variant={variant} size={size} className={className} onClick={() => setAsking(true)}>{children ?? label}</Button>
  return (
    <div role="group" aria-label={confirmText} className={`col-span-full flex flex-wrap items-center gap-2 rounded-xl bg-bad-soft p-2 ${className}`}>
      <p className="flex-1 px-1 text-sm font-semibold text-bad">{confirmText}</p>
      <Button size="sm" variant="danger" onClick={() => { setAsking(false); return onConfirm() }}>{t('common.confirm')}</Button>
      <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>{t('common.cancel')}</Button>
    </div>
  )
}
