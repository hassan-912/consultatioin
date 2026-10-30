import type { CSSProperties } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useT } from '../../i18n'

// Schematic route map: origins (our branches) to the destinations MG advises on. Geography never mirrors in RTL.
const P = {
  canada: [96, 92],
  cairo: [338, 158],
  dubai: [404, 186],
  australia: [520, 286],
  nz: [584, 318],
} as const

const arc = (a: readonly number[], b: readonly number[], lift: number) => {
  const mx = (a[0] + b[0]) / 2
  const my = Math.min(a[1], b[1]) - lift
  return `M${a[0]} ${a[1]} Q${mx} ${my} ${b[0]} ${b[1]}`
}

const routes = [
  arc(P.cairo, P.canada, 120),
  arc(P.dubai, P.canada, 170),
  arc(P.cairo, P.australia, 70),
  arc(P.dubai, P.nz, 60),
]

export function FlightPaths({ className = '' }: { className?: string }) {
  const { l } = useT()
  const reduce = useReducedMotion()
  const label = (x: number, y: number, text: string, anchor: 'start' | 'end' | 'middle' = 'start', origin = false) => (
    <text x={x} y={y} textAnchor={anchor} className={origin ? 'fill-gold' : 'fill-mist'} style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-display)' }}>
      {text}
    </text>
  )
  return (
    <svg viewBox="0 0 640 360" className={className} style={{ direction: 'ltr' }} aria-hidden>
      <defs>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#C9A86A" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#C9A86A" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* latitude lines */}
      {[70, 140, 210, 280].map(y => (
        <path key={y} d={`M0 ${y} Q320 ${y - 18} 640 ${y}`} stroke="white" strokeOpacity="0.06" fill="none" />
      ))}
      {routes.map((d, i) => (
        <g key={i}>
          <path d={d} stroke="white" strokeOpacity="0.12" strokeWidth="1" fill="none" />
          <motion.path
            d={d}
            stroke="#C9A86A"
            strokeWidth="1.5"
            strokeDasharray="3 6"
            fill="none"
            initial={reduce ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.85 }}
            transition={{ duration: 1.6, delay: 0.25 + i * 0.22, ease: [0.3, 0.7, 0.2, 1] }}
          />
        </g>
      ))}
      {!reduce && (
        <g style={{ offsetPath: `path("${routes[0]}")`, offsetRotate: 'auto', animation: 'mg-fly 7s 1.8s ease-in-out infinite both' } as CSSProperties}>
          <path d="M-7 0 L5 -4 L7 0 L5 4 Z" fill="white" />
        </g>
      )}
      {[P.cairo, P.dubai].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="22" fill="url(#glow)" />
          <circle cx={x} cy={y} r="4.5" fill="#C9A86A" />
        </g>
      ))}
      {[P.canada, P.australia, P.nz].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.5" fill="none" stroke="white" strokeOpacity="0.8" strokeWidth="1.5" />
      ))}
      {label(P.canada[0] - 8, P.canada[1] + 24, l({ en: 'Canada', ar: 'كندا' }))}
      {label(P.cairo[0] - 12, P.cairo[1] + 26, l({ en: 'Cairo', ar: 'القاهرة' }), 'end', true)}
      {label(P.dubai[0] + 12, P.dubai[1] + 4, l({ en: 'Dubai', ar: 'دبي' }), 'start', true)}
      {label(P.australia[0] - 10, P.australia[1] + 4, l({ en: 'Australia', ar: 'أستراليا' }), 'end')}
      {label(P.nz[0] - 4, P.nz[1] + 24, l({ en: 'New Zealand', ar: 'نيوزيلندا' }), 'end')}
    </svg>
  )
}
