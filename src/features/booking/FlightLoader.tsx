import { useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { Icon } from '../../components/Icon'

const ROUTE = 'M 30 96 C 110 6, 250 6, 330 96'
const PLANE = 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z'
const STEPS = ['payReturn.step1', 'payReturn.step2', 'payReturn.step3'] as const

/**
 * "Your ticket is being issued": a plane flies the route while we wait for EasyKash's confirmation, then lands.
 * Steps show real progress only: checking while waiting, then all three tick in turn once confirmed.
 */
export function FlightLoader({ landed }: { landed: boolean }) {
  const { t } = useT()
  // Only real progress is shown: while waiting we are checking with EasyKash; the next steps tick, one after
  // another, once the booking is actually confirmed.
  const [ticked, setTicked] = useState(0)
  useEffect(() => {
    if (!landed) { setTicked(0); return }
    const ids = STEPS.map((_, i) => setTimeout(() => setTicked(i + 1), i * 280))
    return () => ids.forEach(clearTimeout)
  }, [landed])
  const active = landed ? ticked : 0

  return (
    <div role="status" aria-live="polite" className="overflow-hidden rounded-3xl bg-slate-deep text-white shadow-[var(--shadow-lift)]">
      <div className="relative px-5 pt-6">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-mist">
          <span>{t('ticket.from')}</span>
          <span>{t('ticket.to')}</span>
        </div>
        <svg viewBox="0 0 360 110" className="mt-1 w-full rtl:-scale-x-100" aria-hidden="true">
          <path d={ROUTE} fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="2" strokeDasharray="2 7" strokeLinecap="round" />
          {landed && <path d={ROUTE} fill="none" stroke="var(--color-gold)" strokeWidth="2.5" strokeLinecap="round" className="mg-trace" pathLength={1} />}
          <circle cx="30" cy="96" r="5" fill="var(--color-gold)" />
          <circle cx="330" cy="96" r={landed ? 7 : 5} fill={landed ? 'var(--color-ok)' : 'currentColor'} fillOpacity={landed ? 1 : 0.35} className="transition-all duration-500" />
          {landed ? (
            <g transform="translate(330 96)">
              <path d="M-3.5 0 L-1 2.5 L3.5 -2.5" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ) : (
            <>
              {/* Flying plane; hidden for reduced motion, where a still plane sits mid-route instead. */}
              <g className="motion-reduce:hidden">
                <g>
                  <animateMotion dur="3.2s" repeatCount="indefinite" rotate="auto" path={ROUTE} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".45 0 .55 1" />
                  <g transform="rotate(45) translate(-12 -12)"><path d={PLANE} fill="var(--color-gold)" /></g>
                </g>
              </g>
              <g className="hidden motion-reduce:block" transform="translate(180 30) rotate(45) translate(-12 -12)"><path d={PLANE} fill="var(--color-gold)" /></g>
            </>
          )}
        </svg>
      </div>

      <div className="border-t border-dashed border-white/15 px-5 pb-6 pt-5 text-center">
        <h1 className="text-2xl font-semibold">{t(landed ? 'payReturn.landed' : 'payReturn.checking')}</h1>
        {!landed && (
          <p className="mx-auto mt-2 inline-flex items-center gap-2 rounded-full bg-gold/15 px-3 py-1.5 text-sm font-semibold text-gold">
            <Icon name="alert" size={15} />{t('payReturn.dontClose')}
          </p>
        )}
        <ol className="mx-auto mt-5 grid max-w-xs gap-2.5 text-start text-sm">
          {STEPS.map((key, i) => {
            const done = i < active
            const now = i === active
            return (
              <li key={key} className={`flex items-center gap-3 transition-opacity duration-300 ${done || now ? 'opacity-100' : 'opacity-40'}`}>
                <span className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full ${done ? 'bg-ok text-white' : now ? 'bg-gold/20 text-gold' : 'bg-white/10 text-mist'}`}>
                  {done ? <Icon name="check" size={14} /> : now ? <span className="size-2 animate-pulse rounded-full bg-gold motion-reduce:animate-none" /> : <span className="size-1.5 rounded-full bg-current" />}
                </span>
                <span className={done ? 'text-white' : now ? 'font-semibold text-white' : 'text-mist'}>{t(key)}</span>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
