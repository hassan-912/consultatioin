import { useMemo } from 'react'
import { geoNaturalEarth1, geoPath, type GeoPermissibleObjects } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import world from 'world-atlas/countries-110m.json'

const W = 1440
const H = 760

/**
 * Faint world map behind the page, in one flat grey so it never competes with cards or text.
 * Purely decorative: sits under every card and never takes pointer events.
 */
export function CountryBackdrop() {
  const { land, borders } = useMemo(() => {
    const topo = world as unknown as Topology<{ countries: GeometryCollection }>
    const countries = feature(topo, topo.objects.countries)
    const path = geoPath(geoNaturalEarth1().fitExtent([[0, 0], [W, H]], { type: 'Sphere' }))
    return {
      land: path(countries as GeoPermissibleObjects) ?? '',
      borders: path(mesh(topo, topo.objects.countries, (a, b) => a !== b)) ?? '',
    }
  }, [])
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 flex items-center justify-center text-slate opacity-[0.07]">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="h-full w-full" style={{ direction: 'ltr' }}>
        <path d={land} fill="currentColor" />
        <path d={borders} fill="none" stroke="#F6F7F9" strokeWidth="0.8" />
      </svg>
    </div>
  )
}
