import { useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { Icon } from '../../components/Icon'

// Climbs from the origin, then descends and levels out on the runway, so the plane lands nose-level and parks.
const ROUTE = 'M 24 92 C 96 4, 236 4, 300 76 Q 314 92, 334 92'
const END = { x: 334, y: 92 }
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
    <div role="status" aria-live="polite" className="w-full overflow-hidden rounded-3xl bg-slate-deep text-white shadow-[var(--shadow-lift)]">
      <div className="relative px-4 pt-5 sm:px-8 sm:pt-7">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-mist">
          <span>{t('ticket.from')}</span>
          <span>{t('ticket.to')}</span>
        </div>
        {/* Remounted on landing so the touchdown animation starts from the beginning. */}
        <svg key={landed ? 'landed' : 'flying'} viewBox="0 0 360 110" className="mt-1 w-full rtl:-scale-x-100" aria-hidden="true">
          <path d={ROUTE} fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="2" strokeDasharray="2 7" strokeLinecap="round" />
          {landed && <path d={ROUTE} fill="none" stroke="var(--color-gold)" strokeWidth="2.5" strokeLinecap="round" className="mg-trace" pathLength={1} />}
          <circle cx="24" cy="92" r="5" fill="var(--color-gold)" />
          {/* Runway at the destination. */}
          <line x1={END.x - 26} y1={END.y + 7} x2={END.x + 18} y2={END.y + 7} stroke={landed ? 'var(--color-ok)' : 'currentColor'} strokeOpacity={landed ? 0.9 : 0.3} strokeWidth="2" strokeLinecap="round" />
          {landed ? (
            <>
              {/* Final approach: glides down the last part of the route and stays parked, nose level. */}
              <g className="motion-reduce:hidden">
                <g>
                  <animateMotion dur="1.3s" begin="0s" fill="freeze" rotate="auto" path={ROUTE} keyPoints="0.62;1" keyTimes="0;1" calcMode="spline" keySplines=".2 .6 .3 1" />
                  <g transform="rotate(45) translate(-12 -12)"><path d={PLANE} fill="var(--color-gold)" /></g>
                </g>
              </g>
              <g className="hidden motion-reduce:block" transform={`translate(${END.x} ${END.y}) rotate(45) translate(-12 -12)`}><path d={PLANE} fill="var(--color-gold)" /></g>
              {/* Arrived: a tick above the parked plane. */}
              <g className="mg-pop" transform={`translate(${END.x} ${END.y - 26})`}>
                <circle r="9" fill="var(--color-ok)" />
                <path d="M-4 0 L-1.2 2.8 L4 -2.6" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            </>
          ) : (
            <>
              {/* Flying while we wait; fades at each end of the loop so it never looks like it has landed. */}
              <g className="motion-reduce:hidden">
                <g>
                  <animateMotion dur="3.2s" repeatCount="indefinite" rotate="auto" path={ROUTE} keyPoints="0;0.88" keyTimes="0;1" calcMode="spline" keySplines=".45 0 .55 1" />
                  <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.12;0.85;1" dur="3.2s" repeatCount="indefinite" />
                  <g transform="rotate(45) translate(-12 -12)"><path d={PLANE} fill="var(--color-gold)" /></g>
                </g>
              </g>
              <g className="hidden motion-reduce:block" transform="translate(180 30) rotate(45) translate(-12 -12)"><path d={PLANE} fill="var(--color-gold)" /></g>
            </>
          )}
        </svg>
      </div>

      <div className="border-t border-dashed border-white/15 px-4 pb-6 pt-5 text-center sm:px-8 sm:pb-8">
        <h1 className="text-xl font-semibold sm:text-2xl">{t(landed ? 'payReturn.landed' : 'payReturn.checking')}</h1>
        {!landed && (
          <p className="mx-auto mt-3 flex max-w-sm items-start sm:max-w-none justify-center gap-2 rounded-2xl bg-gold/15 px-3 py-2 text-start text-sm font-semibold text-gold sm:inline-flex sm:items-center sm:rounded-full sm:py-1.5">
            <Icon name="alert" size={15} className="mt-0.5 shrink-0 sm:mt-0" /><span>{t('payReturn.dontClose')}</span>
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
