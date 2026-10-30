import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { geoNaturalEarth1, geoPath, type GeoPermissibleObjects } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import world from 'world-atlas/countries-110m.json'
import { useT } from '../../i18n'
import type { L10n } from '../../domain/types'

// Map of where MG customers can go from every branch. Geography never mirrors in RTL.
const W = 960
const H = 470

type Place = { id: string; name: L10n; at: [number, number] }

export const BRANCH_POINTS: Place[] = [
  { id: 'nasr-city', name: { en: 'Nasr City', ar: 'مدينة نصر' }, at: [31.34, 30.06] },
  { id: 'sheikh-zayed', name: { en: 'Sheikh Zayed', ar: 'الشيخ زايد' }, at: [30.98, 30.04] },
  { id: 'dubai', name: { en: 'Dubai', ar: 'دبي' }, at: [55.3, 25.26] },
]

export const DESTINATIONS: Place[] = [
  { id: 'usa', name: { en: 'USA', ar: 'الولايات المتحدة' }, at: [-77.0, 38.9] },
  { id: 'canada', name: { en: 'Canada', ar: 'كندا' }, at: [-79.4, 43.7] },
  { id: 'uk', name: { en: 'United Kingdom', ar: 'المملكة المتحدة' }, at: [-0.12, 51.5] },
  { id: 'schengen', name: { en: 'Schengen', ar: 'دول الشنغن' }, at: [4.35, 50.85] },
]

// ISO 3166 numeric ids for highlighted countries.
const DEST_IDS = new Set([
  '840', '124', '826',
  // Schengen area
  '040', '056', '100', '191', '203', '208', '233', '246', '250', '276', '300', '348', '352', '380', '428', '438',
  '440', '442', '470', '528', '578', '616', '620', '642', '703', '705', '724', '752', '756',
])
const HOME_IDS = new Set(['818', '784'])

/** Which part of the loop is showing: a branch being highlighted, or the routes fanning out. */
export type RoutePhase = { kind: 'branch'; index: number } | { kind: 'routes' }

const PHASES: RoutePhase[] = [
  { kind: 'branch', index: 0 },
  { kind: 'branch', index: 1 },
  { kind: 'branch', index: 2 },
  { kind: 'routes' },
]
const PHASE_MS = [1300, 1300, 1300, 6000]

export function useRoutePhase(): [RoutePhase, number] {
  const reduce = useReducedMotion()
  const [i, setI] = useState(reduce ? 3 : 0)
  const [cycle, setCycle] = useState(0)
  useEffect(() => {
    if (reduce) return
    const id = setTimeout(() => {
      setI(v => (v + 1) % PHASES.length)
      if (i === PHASES.length - 1) setCycle(c => c + 1)
    }, PHASE_MS[i])
    return () => clearTimeout(id)
  }, [i, reduce])
  return [PHASES[i], cycle]
}

export function WorldRoutes({ phase, cycle, className = '' }: { phase: RoutePhase; cycle: number; className?: string }) {
  const { l } = useT()
  const reduce = useReducedMotion()

  const geo = useMemo(() => {
    const topo = world as unknown as Topology<{ countries: GeometryCollection }>
    const countries = feature(topo, topo.objects.countries).features
    const projection = geoNaturalEarth1().fitExtent(
      [[10, 10], [W - 10, H - 10]],
      { type: 'MultiPoint', coordinates: [[-122, 22], [-95, 56], [62, 20], [30, 64], [-70, 30]] },
    )
    const path = geoPath(projection)
    const borders = path(mesh(topo, topo.objects.countries, (a, b) => a !== b)) ?? ''
    const shapes = countries.map(c => ({ id: String(c.id), d: path(c as GeoPermissibleObjects) ?? '' }))
    const pt = (at: [number, number]) => projection(at) as [number, number]
    const arc = (a: [number, number], b: [number, number]) => path({ type: 'LineString', coordinates: [a, b] }) ?? ''
    const cairo = BRANCH_POINTS[0].at
    const dubai = BRANCH_POINTS[2].at
    const routes = DESTINATIONS.flatMap((d, i) => [
      { key: `c-${d.id}`, d: arc(cairo, d.at), delay: i * 0.35 },
      { key: `d-${d.id}`, d: arc(dubai, d.at), delay: 0.18 + i * 0.35 },
    ])
    return { shapes, borders, pt, routes, hop: arc(cairo, dubai) }
  }, [])

  const branchActive = (i: number) => phase.kind === 'routes' || (phase.kind === 'branch' && phase.index >= i)
  const routesOn = phase.kind === 'routes'

  const label = (x: number, y: number, text: string, anchor: 'start' | 'end', tone: 'gold' | 'white', big = false) => (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      style={{ fontSize: big ? 15 : 13, fontWeight: 600, fontFamily: 'var(--font-display)', paintOrder: 'stroke', stroke: '#1B242C', strokeWidth: 4 }}
      className={tone === 'gold' ? 'fill-gold' : 'fill-white'}
    >
      {text}
    </text>
  )

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} style={{ direction: 'ltr' }} role="img" aria-label={DESTINATIONS.map(d => l(d.name)).join(', ')}>
      <defs>
        <pattern id="dots" width="5" height="5" patternUnits="userSpaceOnUse">
          <circle cx="2.5" cy="2.5" r="1.1" fill="#9FAEBE" fillOpacity="0.55" />
        </pattern>
        <radialGradient id="pulse" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#C9A86A" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#C9A86A" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* land: dotted texture with tinted home and destination countries */}
      <g>
        {geo.shapes.map(s => (
          <path
            key={s.id + s.d.length}
            d={s.d}
            fill={DEST_IDS.has(s.id) ? 'rgba(201,168,106,0.22)' : HOME_IDS.has(s.id) ? 'rgba(201,168,106,0.32)' : 'url(#dots)'}
          />
        ))}
        <path d={geo.borders} fill="none" stroke="#9FAEBE" strokeOpacity="0.18" strokeWidth="0.6" />
      </g>

      {/* branch hop: Egypt → Dubai */}
      <motion.path
        key={`hop-${cycle}`}
        d={geo.hop}
        fill="none"
        stroke="#C9A86A"
        strokeWidth="2"
        strokeLinecap="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: branchActive(2) ? 1 : 0 }}
        transition={{ duration: 0.9, ease: 'easeInOut' }}
      />

      {/* routes from every branch to every destination */}
      {geo.routes.map(r => (
        <g key={`${r.key}-${cycle}`}>
          <motion.path
            d={r.d}
            fill="none"
            stroke="#C9A86A"
            strokeWidth="1.4"
            strokeDasharray="4 6"
            initial={reduce ? false : { pathLength: 0, opacity: 0 }}
            animate={routesOn ? { pathLength: 1, opacity: 0.9 } : { pathLength: 0, opacity: 0 }}
            transition={{ duration: 1.6, delay: routesOn ? r.delay : 0, ease: [0.3, 0.7, 0.2, 1] }}
          />
          {routesOn && !reduce && (
            <g style={{ offsetPath: `path("${r.d}")`, offsetRotate: 'auto', animation: `mg-fly 3.2s ${r.delay + 0.4}s ease-in-out both` } as CSSProperties}>
              <path d="M-8 0 L5 -4.5 L8 0 L5 4.5 Z" fill="#fff" />
            </g>
          )}
        </g>
      ))}

      {/* destinations */}
      {DESTINATIONS.map((d, i) => {
        const [x, y] = geo.pt(d.at)
        const side = d.id === 'canada' ? { dx: -10, dy: -10, anchor: 'end' as const } : d.id === 'usa' ? { dx: -10, dy: 18, anchor: 'end' as const } : d.id === 'uk' ? { dx: -10, dy: -10, anchor: 'end' as const } : { dx: 10, dy: -10, anchor: 'start' as const }
        return (
          <motion.g key={d.id} initial={false} animate={{ opacity: routesOn ? 1 : 0.35 }} transition={{ delay: routesOn ? 1 + i * 0.35 : 0 }}>
            <circle cx={x} cy={y} r="5" fill="none" stroke="#fff" strokeWidth="1.8" />
            {label(x + side.dx, y + side.dy, l(d.name), side.anchor, 'white')}
          </motion.g>
        )
      })}

      {/* branches */}
      {BRANCH_POINTS.map((b, i) => {
        const [x, y] = geo.pt(b.at)
        const on = branchActive(i)
        const focus = phase.kind === 'branch' && phase.index === i
        const pos = b.id === 'nasr-city' ? { dx: 12, dy: -12, anchor: 'start' as const } : b.id === 'sheikh-zayed' ? { dx: -12, dy: 22, anchor: 'end' as const } : { dx: 12, dy: 22, anchor: 'start' as const }
        return (
          <g key={b.id}>
            <motion.circle cx={x} cy={y} fill="url(#pulse)" initial={false} animate={{ r: focus ? 34 : on ? 20 : 0 }} transition={{ duration: 0.5 }} />
            <circle cx={x} cy={y} r={on ? 5.5 : 3.5} fill={on ? '#C9A86A' : '#9FAEBE'} stroke="#1B242C" strokeWidth="1.5" />
            <motion.g initial={false} animate={{ opacity: on ? 1 : 0.45 }}>
              {label(x + pos.dx, y + pos.dy, l(b.name), pos.anchor, 'gold', true)}
            </motion.g>
          </g>
        )
      })}
    </svg>
  )
}
