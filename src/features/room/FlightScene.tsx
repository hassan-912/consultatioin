import { useEffect, useRef } from 'react'
import logoUrl from '../../assets/mg-logo-white.webp'

// The waiting-room film, drawn in code: an MG airliner cruises over the world's landmarks, then, in the
// last LAND_MS before the room opens, descends, flares and lands so that it stops just as the room opens.

/** The landing takes this long and ends when the room opens. */
export const LAND_MS = 90_000
const LAND_S = LAND_MS / 1000
/** The moment (0..1 through the landing) the wheels touch the runway. */
const TOUCH = 0.84

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const smooth = (a: number, b: number, v: number) => { const x = clamp((v - a) / (b - a)); return x * x * (3 - 2 * x) }
const mix = (a: number, b: number, t: number) => a + (b - a) * t
/** Ground speed through the landing: full speed on approach, braking to a stop after touchdown. */
const speedAt = (u: number) => 1 - smooth(TOUCH, 1, u)
/** Share of the landing's ground distance still ahead at L (1 at the start, 0 when stopped). */
function ahead(L: number) {
  let sum = 0
  for (let n = 0; n < 40; n++) sum += speedAt(L + (1 - L) * (n + 0.5) / 40) * (1 - L) / 40
  return sum / 0.92 // the whole landing: TOUCH + (1 - TOUCH) / 2
}

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/** One soft cumulus cloud, painted once to its own canvas: a shaded underside, then bright puffs on top. */
function paintCloud(w: number, h: number, seed: number, dpr: number) {
  const c = document.createElement('canvas')
  c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr)
  const g = c.getContext('2d')!
  g.scale(dpr, dpr)
  const r = rng(seed)
  const puffs = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8
    const rad = h * (0.22 + 0.2 * Math.sin(Math.PI * t) + r() * 0.08)
    return { x: w * (0.14 + 0.72 * t) + (r() - 0.5) * w * 0.06, y: h * 0.62 - rad * 0.55 + (r() - 0.5) * h * 0.08, rad }
  })
  for (const [dy, inner, outer] of [[h * 0.06, 'rgba(150,170,200,0.55)', 'rgba(150,170,200,0)'], [0, 'rgba(255,255,255,0.97)', 'rgba(255,255,255,0)']] as const) {
    for (const p of puffs) {
      const grad = g.createRadialGradient(p.x, p.y + dy - p.rad * 0.2, p.rad * 0.1, p.x, p.y + dy, p.rad)
      grad.addColorStop(0, inner); grad.addColorStop(0.7, inner.replace(/[\d.]+\)$/, '0.6)')); grad.addColorStop(1, outer)
      g.fillStyle = grad
      g.beginPath(); g.arc(p.x, p.y + dy, p.rad, 0, Math.PI * 2); g.fill()
    }
  }
  return c
}

type Ctx = CanvasRenderingContext2D

/** Distant landmarks, each drawn standing on the horizon at x, `s` pixels per unit of height. */
const LANDMARKS: ((g: Ctx, x: number, y: number, s: number) => void)[] = [
  // Giza pyramids
  (g, x, y, s) => { for (const [dx, hh] of [[0, 0.62], [0.55, 0.8], [1.05, 0.45]]) { g.beginPath(); g.moveTo(x + dx * s - hh * s * 0.75, y); g.lineTo(x + dx * s, y - hh * s); g.lineTo(x + dx * s + hh * s * 0.75, y); g.fill() } },
  // Eiffel Tower
  (g, x, y, s) => {
    g.beginPath(); g.moveTo(x - 0.32 * s, y); g.quadraticCurveTo(x - 0.1 * s, y - 0.45 * s, x - 0.05 * s, y - 1.1 * s); g.lineTo(x, y - 1.35 * s)
    g.lineTo(x + 0.05 * s, y - 1.1 * s); g.quadraticCurveTo(x + 0.1 * s, y - 0.45 * s, x + 0.32 * s, y); g.lineTo(x + 0.16 * s, y)
    g.quadraticCurveTo(x, y - 0.28 * s, x - 0.16 * s, y); g.closePath(); g.fill()
    g.fillRect(x - 0.2 * s, y - 0.42 * s, 0.4 * s, 0.035 * s); g.fillRect(x - 0.12 * s, y - 0.78 * s, 0.24 * s, 0.03 * s)
  },
  // Big Ben and Parliament
  (g, x, y, s) => {
    g.fillRect(x - 0.08 * s, y - 1.05 * s, 0.16 * s, 1.05 * s)
    g.beginPath(); g.moveTo(x - 0.1 * s, y - 1.05 * s); g.lineTo(x, y - 1.32 * s); g.lineTo(x + 0.1 * s, y - 1.05 * s); g.fill()
    g.fillRect(x + 0.08 * s, y - 0.32 * s, 0.9 * s, 0.32 * s)
    for (let i = 0; i < 6; i++) g.fillRect(x + (0.14 + i * 0.15) * s, y - 0.4 * s, 0.05 * s, 0.1 * s)
  },
  // Statue of Liberty
  (g, x, y, s) => {
    g.fillRect(x - 0.16 * s, y - 0.38 * s, 0.32 * s, 0.38 * s)
    g.beginPath(); g.moveTo(x - 0.08 * s, y - 0.38 * s); g.lineTo(x - 0.05 * s, y - 0.9 * s); g.lineTo(x + 0.06 * s, y - 0.9 * s); g.lineTo(x + 0.08 * s, y - 0.38 * s); g.fill()
    g.beginPath(); g.arc(x, y - 0.95 * s, 0.06 * s, 0, Math.PI * 2); g.fill()
    g.fillRect(x + 0.04 * s, y - 1.2 * s, 0.035 * s, 0.32 * s)
    g.beginPath(); g.arc(x + 0.06 * s, y - 1.23 * s, 0.045 * s, 0, Math.PI * 2); g.fill()
  },
  // Burj Khalifa
  (g, x, y, s) => {
    const steps = [[0.22, 0.35], [0.16, 0.7], [0.11, 1.05], [0.07, 1.35], [0.035, 1.6]]
    for (const [hw, top] of steps) g.fillRect(x - hw * s, y - top * s, hw * 2 * s, top * s)
    g.fillRect(x - 0.008 * s, y - 1.85 * s, 0.016 * s, 0.3 * s)
  },
  // Colosseum
  (g, x, y, s) => {
    g.beginPath(); g.moveTo(x - 0.6 * s, y); g.lineTo(x - 0.6 * s, y - 0.32 * s); g.quadraticCurveTo(x, y - 0.46 * s, x + 0.6 * s, y - 0.4 * s); g.lineTo(x + 0.6 * s, y); g.fill()
  },
]

/** The MG airliner, side view, facing right, centred on its belly. `gear` 0..1 lowers the wheels. */
/** The MG logo, white (for the navy tail and the billboard) and a navy copy (for the white fuselage). */
type Art = { white: HTMLImageElement; navy: HTMLCanvasElement }
/** Where the round MG emblem sits inside the logo image: x, y, width, height. */
const EMBLEM = [58, 0, 232, 246] as const

function drawPlane(g: Ctx, t: number, gear: number, strobe: boolean, art: Art | null) {
  // Fuselage: white with a soft underside shadow.
  const body = g.createLinearGradient(0, -14, 0, 14)
  body.addColorStop(0, '#ffffff'); body.addColorStop(0.55, '#eef2f6'); body.addColorStop(1, '#aab6c4')
  // Far wing, behind the body.
  g.fillStyle = '#8c99a8'
  g.beginPath(); g.moveTo(8, -2); g.lineTo(-22, -2); g.lineTo(-40, -16); g.lineTo(-30, -16); g.closePath(); g.fill()
  // Tail fin (navy) with a gold leading edge and the MG emblem.
  g.fillStyle = '#0C2B59'
  g.beginPath(); g.moveTo(-66, -10); g.lineTo(-96, -50); g.lineTo(-82, -50); g.lineTo(-46, -10); g.closePath(); g.fill()
  g.fillStyle = '#C9A86A'
  g.beginPath(); g.moveTo(-50, -10); g.lineTo(-84, -50); g.lineTo(-82, -50); g.lineTo(-46, -10); g.closePath(); g.fill()
  if (art) {
    g.save()
    g.beginPath(); g.moveTo(-66, -10); g.lineTo(-96, -50); g.lineTo(-82, -50); g.lineTo(-46, -10); g.closePath(); g.clip()
    g.drawImage(art.white, EMBLEM[0], EMBLEM[1], EMBLEM[2], EMBLEM[3], -81, -38, 17, 18)
    g.restore()
  }
  // Body.
  g.fillStyle = body
  g.beginPath()
  g.moveTo(-96, -6); g.quadraticCurveTo(-88, -12, -70, -12); g.lineTo(70, -12)
  g.bezierCurveTo(90, -12, 104, -4, 106, 2); g.bezierCurveTo(102, 10, 88, 12, 70, 12)
  g.lineTo(-62, 12); g.quadraticCurveTo(-86, 8, -100, -2); g.closePath(); g.fill()
  // Cheat line and windows.
  g.fillStyle = '#C9A86A'; g.fillRect(-70, 1, 150, 1.6)
  g.fillStyle = '#0C2B59'; g.fillRect(-70, 3.2, 150, 1)
  g.fillStyle = '#2D3845'
  // Windows start after the MG name on the rear fuselage.
  for (let x = art ? -16 : -60; x < 72; x += 6.5) { g.beginPath(); g.roundRect(x, -5.5, 3, 4, 1.4); g.fill() }
  if (art) g.drawImage(art.navy, -57, -10, 34, 10.4)
  g.beginPath(); g.moveTo(88, -6.5); g.lineTo(97, -6.5); g.lineTo(101, -2); g.lineTo(90, -2.5); g.closePath(); g.fill()
  // Horizontal stabiliser.
  g.fillStyle = '#c3ccd6'
  g.beginPath(); g.moveTo(-70, -2); g.lineTo(-98, -6); g.lineTo(-92, 1); g.closePath(); g.fill()
  // Gear, under the near wing and the nose.
  if (gear > 0) {
    g.strokeStyle = '#4a5562'; g.lineWidth = 2; g.fillStyle = '#17202A'
    for (const gx of [-6, 74]) {
      const len = 13 * gear
      g.beginPath(); g.moveTo(gx, 10); g.lineTo(gx, 10 + len); g.stroke()
      g.beginPath(); g.arc(gx, 12 + len, 3.4 * gear, 0, Math.PI * 2); g.fill()
    }
  }
  // Near wing and engine.
  g.fillStyle = '#d4dbe3'
  g.beginPath(); g.moveTo(16, 4); g.lineTo(-18, 4); g.lineTo(-50, 24); g.lineTo(-38, 24); g.closePath(); g.fill()
  const eng = g.createLinearGradient(0, 8, 0, 22)
  eng.addColorStop(0, '#f4f6f9'); eng.addColorStop(1, '#8e9aa8')
  g.fillStyle = eng
  g.beginPath(); g.roundRect(-14, 9, 34, 12, 6); g.fill()
  g.fillStyle = '#2D3845'; g.beginPath(); g.ellipse(20, 15, 2.2, 5.2, 0, 0, Math.PI * 2); g.fill()
  // Lights: red beacon on the belly, white strobe on the tail.
  if (Math.sin(t * 5) > 0.6) { g.fillStyle = 'rgba(255,60,60,0.95)'; g.beginPath(); g.arc(10, 12.5, 1.8, 0, Math.PI * 2); g.fill() }
  if (strobe) {
    const glow = g.createRadialGradient(-96, -50, 0, -96, -50, 10)
    glow.addColorStop(0, 'rgba(255,255,255,1)'); glow.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = glow; g.beginPath(); g.arc(-96, -50, 10, 0, Math.PI * 2); g.fill()
  }
}

/** The arrival billboard: navy panel, gold frame, the MG logo and the slogan, lit up as the plane stops. */
function drawBillboard(g: Ctx, cx: number, ground: number, w: number, lit: number, art: Art | null) {
  const h = w * 0.5, top = ground - w * 0.95
  // Posts and catwalk.
  g.fillStyle = '#3a4350'
  g.fillRect(cx - w * 0.3, top + h, w * 0.035, ground - top - h); g.fillRect(cx + w * 0.265, top + h, w * 0.035, ground - top - h)
  g.fillRect(cx - w * 0.52, top + h + 2, w * 1.04, 2.5)
  // Light cones from the catwalk, growing as the plane arrives.
  if (lit > 0) {
    for (const lx of [-0.3, 0, 0.3]) {
      const sx = cx + lx * w, cone = g.createLinearGradient(0, top + h, 0, top)
      cone.addColorStop(0, `rgba(255,236,190,${0.5 * lit})`); cone.addColorStop(1, 'rgba(255,236,190,0)')
      g.fillStyle = cone
      g.beginPath(); g.moveTo(sx - 3, top + h + 2); g.lineTo(sx + w * 0.22, top - 4); g.lineTo(sx - w * 0.22, top - 4); g.closePath(); g.fill()
    }
  }
  // Frame and panel.
  g.fillStyle = '#C9A86A'; g.beginPath(); g.roundRect(cx - w / 2 - 3, top - 3, w + 6, h + 6, 5); g.fill()
  const panel = g.createLinearGradient(0, top, 0, top + h)
  panel.addColorStop(0, '#173866'); panel.addColorStop(1, '#0C2B59')
  g.fillStyle = panel; g.beginPath(); g.roundRect(cx - w / 2, top, w, h, 3); g.fill()
  // Logo, then the slogan sized to fit the panel.
  if (art) {
    const lw = w * 0.74, lh = lw * (246 / 800)
    g.drawImage(art.white, cx - lw / 2, top + h * 0.12, lw, lh)
  }
  const size = Math.max(8, Math.round(w * 0.085))
  g.font = `600 ${size}px Changa, system-ui, sans-serif`
  g.textAlign = 'center'; g.fillStyle = '#C9A86A'
  g.fillText('Hold fast to dream', cx, top + h * 0.86, w * 0.9)
  g.textAlign = 'start'
  // A soft sheen while it is lit.
  if (lit > 0) {
    const sheen = g.createRadialGradient(cx, top + h, 0, cx, top + h, w * 0.8)
    sheen.addColorStop(0, `rgba(255,236,190,${0.18 * lit})`); sheen.addColorStop(1, 'rgba(255,236,190,0)')
    g.fillStyle = sheen; g.fillRect(cx - w / 2, top, w, h)
  }
}

type Cloud = { img: HTMLCanvasElement; x: number; y: number; w: number; h: number }
type Puff = { x: number; y: number; r: number; age: number }

/**
 * The waiting-room film. It follows the countdown: cruising while there is time, landing in the last
 * 90 seconds and coming to a stop at the opening time. Still frame for people who prefer less motion.
 */
export function FlightScene({ opensAt, now, className = '' }: { opensAt: number; now: () => number; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const clock = useRef(now)
  useEffect(() => { clock.current = now }, [now])

  useEffect(() => {
    const el = canvas.current
    // Needs a real browser canvas (tests run without one).
    if (!el || typeof ResizeObserver === 'undefined') return
    const g = el.getContext('2d')
    if (!g) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    let art: Art | null = null
    const white = new Image()
    white.onload = () => {
      const navy = document.createElement('canvas')
      navy.width = white.naturalWidth; navy.height = white.naturalHeight
      const n = navy.getContext('2d')!
      n.drawImage(white, 0, 0); n.globalCompositeOperation = 'source-in'; n.fillStyle = '#0C2B59'; n.fillRect(0, 0, navy.width, navy.height)
      art = { white, navy }
      // The still frame (reduced motion) was drawn before the logo arrived: draw it again.
      if (still) frame = requestAnimationFrame(draw)
    }
    white.src = logoUrl

    let W = 0, H = 0, dpr = 1
    let far: Cloud[] = [], mid: Cloud[] = [], near: Cloud[] = []
    const build = () => {
      const box = el.getBoundingClientRect()
      dpr = Math.min(2, window.devicePixelRatio || 1)
      W = Math.max(1, box.width); H = Math.max(1, box.height)
      el.width = Math.round(W * dpr); el.height = Math.round(H * dpr)
      const r = rng(7)
      const make = (n: number, scale: number, y0: number, y1: number): Cloud[] => Array.from({ length: n }, (_, i) => {
        const w = W * scale * (0.7 + r() * 0.6), h = w * 0.42
        return { img: paintCloud(w, h, 100 + i * 13 + Math.round(scale * 100), dpr), x: r() * (W + w * 2), y: H * mix(y0, y1, r()), w, h }
      })
      far = make(6, 0.16, 0.04, 0.3); mid = make(4, 0.28, 0.12, 0.42); near = make(2, 0.62, 0.42, 0.66)
    }
    build()
    const resize = new ResizeObserver(build)
    resize.observe(el)

    let scroll = 0, last = performance.now(), frame = 0, touched = false
    const puffs: Puff[] = []

    const draw = (ms: number) => {
      const dt = Math.min(0.05, (ms - last) / 1000); last = ms
      const t = ms / 1000
      const left = opensAt - clock.current()
      const L = clamp(1 - left / LAND_MS)
      // Cruise scrolls fast; on approach the ground slows to the pace that brings the runway in on time.
      const base = W * 0.13, approach = (W * 3.2) / (LAND_S * 0.92)
      const v = mix(base, approach, smooth(0, 0.08, L)) * speedAt(L)
      scroll += v * dt

      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      const horizon = H * 0.7
      const descent = smooth(0.2, TOUCH, L)

      // Sky: deep navy overhead to warm gold at the horizon, warming as the flight comes in.
      const sky = g.createLinearGradient(0, 0, 0, horizon)
      sky.addColorStop(0, '#1b4479')
      sky.addColorStop(0.55, '#6f9fd0'); sky.addColorStop(1, '#f2d9a6')
      g.fillStyle = sky; g.fillRect(0, 0, W, horizon + 1)
      const sun = g.createRadialGradient(W * 0.8, horizon - H * 0.08, 0, W * 0.8, horizon - H * 0.08, H * 0.7)
      sun.addColorStop(0, 'rgba(255,236,190,0.95)'); sun.addColorStop(0.12, 'rgba(255,220,160,0.55)'); sun.addColorStop(1, 'rgba(255,220,160,0)')
      g.fillStyle = sun; g.fillRect(0, 0, W, horizon + 1)

      const drift = (list: Cloud[], par: number, alpha: number) => {
        g.globalAlpha = alpha
        for (const c of list) {
          const span = W + c.w * 2
          const x = ((c.x - scroll * par - t * 4 * par) % span + span) % span - c.w
          g.drawImage(c.img, x, c.y, c.w, c.h)
        }
        g.globalAlpha = 1
      }
      drift(far, 0.12, 0.75)
      drift(mid, 0.4, 0.9)

      // Far hills in the haze.
      g.fillStyle = 'rgba(120,140,170,0.55)'
      g.beginPath(); g.moveTo(0, horizon)
      for (let x = 0; x <= W; x += 8) { const wx = x + scroll * 0.06; g.lineTo(x, horizon - H * (0.03 + 0.025 * Math.sin(wx / 90) + 0.015 * Math.sin(wx / 37))) }
      g.lineTo(W, horizon); g.closePath(); g.fill()

      // Landmarks on the horizon, fading as the airport comes into view.
      const lmAlpha = 1 - smooth(0.15, 0.5, L)
      if (lmAlpha > 0) {
        g.globalAlpha = lmAlpha; g.fillStyle = 'rgba(52,70,98,0.62)'
        const gap = Math.max(170, W * 0.3), loop = gap * LANDMARKS.length, s = H * 0.13
        for (let i = 0; i < LANDMARKS.length; i++) {
          const x = ((i * gap - scroll * 0.28) % loop + loop) % loop - gap * 0.5
          if (x > -gap && x < W + gap) LANDMARKS[i](g, x, horizon + 1, s)
        }
        g.globalAlpha = 1
      }

      // Fields: rows of patches, nearer rows passing faster.
      const ground = g.createLinearGradient(0, horizon, 0, H)
      ground.addColorStop(0, '#b7c4a6'); ground.addColorStop(1, '#6d8761')
      g.fillStyle = ground; g.fillRect(0, horizon, W, H - horizon)
      const tones = ['rgba(201,168,106,0.16)', 'rgba(70,110,70,0.13)', 'rgba(255,255,255,0.06)', 'rgba(110,83,32,0.1)']
      for (let row = 0; row < 5; row++) {
        const y0 = horizon + (H - horizon) * Math.pow(row / 5, 1.5), y1 = horizon + (H - horizon) * Math.pow((row + 1) / 5, 1.5)
        const par = 0.25 + row * 0.22, cell = 60 + row * 40
        const off = (scroll * par) % cell
        for (let k = -1; k < W / cell + 2; k++) {
          g.fillStyle = tones[(k + row * 3 + Math.floor((scroll * par) / cell)) & 3]
          // Slanted patches read as fields seen at an angle rather than tiles.
          const x0 = k * cell - off, lean = (y1 - y0) * 0.6
          g.beginPath(); g.moveTo(x0 + lean, y0); g.lineTo(x0 + cell * 0.92 + lean, y0); g.lineTo(x0 + cell * 0.92, y1); g.lineTo(x0, y1); g.closePath(); g.fill()
        }
      }
      // Haze where the ground meets the sky.
      const haze = g.createLinearGradient(0, horizon - H * 0.06, 0, horizon + (H - horizon) * 0.55)
      haze.addColorStop(0, 'rgba(242,217,166,0)'); haze.addColorStop(0.25, 'rgba(236,224,200,0.55)'); haze.addColorStop(1, 'rgba(236,224,200,0)')
      g.fillStyle = haze; g.fillRect(0, horizon - H * 0.06, W, H)

      // The airport: placed so that the plane touches down past the threshold and stops by the tower.
      const planeX = W * 0.36
      const threshold = planeX - W * 1.5 + W * 3.2 * ahead(L)
      const runwayY = H * 0.86
      if (threshold < W * 1.2 && L > 0) {
        // Terminal and tower behind the runway.
        const tower = threshold + W * 1.2, term0 = threshold + W * 1.33
        g.fillStyle = '#5c6b7c'
        g.fillRect(term0, runwayY - H * 0.16, W * 0.38, H * 0.1)
        g.fillStyle = '#9fc0de'
        for (let x = term0 + 6; x < term0 + W * 0.38 - 6; x += 10) g.fillRect(x, runwayY - H * 0.145, 6, H * 0.05)
        g.fillStyle = '#4b5868'; g.beginPath(); g.ellipse(term0 + W * 0.19, runwayY - H * 0.16, W * 0.2, H * 0.03, 0, Math.PI, 0); g.fill()
        g.fillStyle = '#5c6b7c'; g.fillRect(tower - 6, runwayY - H * 0.42, 12, H * 0.36)
        g.fillStyle = '#2D3845'; g.beginPath(); g.moveTo(tower - 16, runwayY - H * 0.46); g.lineTo(tower + 16, runwayY - H * 0.46); g.lineTo(tower + 12, runwayY - H * 0.4); g.lineTo(tower - 12, runwayY - H * 0.4); g.fill()
        g.fillStyle = '#9fd0ff'; g.fillRect(tower - 13, runwayY - H * 0.455, 26, H * 0.04)
        if (Math.sin(t * 3) > 0) { g.fillStyle = '#ff5050'; g.beginPath(); g.arc(tower, runwayY - H * 0.475, 2.4, 0, Math.PI * 2); g.fill() }
        // The destination billboard, right of the terminal, lighting up as the plane comes to a stop.
        drawBillboard(g, threshold + W * 1.95, runwayY - 6, Math.min(W * 0.3, 190), smooth(TOUCH, 1, L), art)
        // Runway with a moving centre line and edge lights.
        g.fillStyle = '#3a4350'; g.fillRect(threshold, runwayY - 5, W * 8, 16)
        g.fillStyle = '#e9edf2'; g.fillRect(threshold, runwayY - 5, W * 8, 1.4)
        for (let i = 0; i < 8; i++) g.fillRect(threshold + 4 + i * 5, runwayY - 2, 3, 10)
        for (let x = threshold + 70; x < Math.min(W + 40, threshold + W * 8); x += 46) g.fillRect(x, runwayY + 2.5, 22, 1.6)
        for (let x = threshold; x < Math.min(W + 40, threshold + W * 8); x += 34) {
          const glow = g.createRadialGradient(x, runwayY + 11, 0, x, runwayY + 11, 6)
          glow.addColorStop(0, 'rgba(255,230,160,0.95)'); glow.addColorStop(1, 'rgba(255,230,160,0)')
          g.fillStyle = glow; g.fillRect(x - 6, runwayY + 5, 12, 12)
        }
        // Approach strobes running toward the threshold.
        const k = Math.floor(t * 8) % 6
        for (let i = 0; i < 6; i++) if (i === 5 - k) {
          const x = threshold - 18 - i * 20, glow = g.createRadialGradient(x, runwayY + 3, 0, x, runwayY + 3, 9)
          glow.addColorStop(0, 'rgba(255,255,255,1)'); glow.addColorStop(1, 'rgba(255,255,255,0)')
          g.fillStyle = glow; g.fillRect(x - 9, runwayY - 6, 18, 18)
        }
      }

      // The plane: cruise with a gentle bob, then the approach, flare and rollout.
      const scale = clamp(W / 640, 0.6, 1.2)
      const wheels = 25 * scale
      const cruiseY = H * 0.32 + Math.sin(t * 0.9) * 3 * (1 - descent)
      const planeY = mix(cruiseY, runwayY - 5 - wheels, descent)
      const pitch = -0.05 * smooth(0.15, 0.3, L) * (1 - smooth(0.7, 0.78, L)) + 0.08 * smooth(0.72, 0.82, L) * (1 - smooth(0.86, 0.94, L)) + Math.sin(t * 0.7) * 0.012 * (1 - descent)
      const gear = smooth(0.3, 0.45, L)

      // Contrails while cruising.
      const trail = 0.5 * (1 - smooth(0.05, 0.3, L))
      if (trail > 0) {
        for (const dy of [14, 20]) {
          const y = planeY - 8 * scale + dy * scale
          const grad = g.createLinearGradient(planeX - 20 * scale, 0, 0, 0)
          grad.addColorStop(0, `rgba(255,255,255,${trail})`); grad.addColorStop(1, 'rgba(255,255,255,0)')
          g.strokeStyle = grad; g.lineWidth = 2.2 * scale
          g.beginPath(); g.moveTo(planeX - 20 * scale, y); g.lineTo(0, y + Math.sin(t) * 2); g.stroke()
        }
      }

      // Tyre smoke at touchdown.
      if (L >= TOUCH && !touched) {
        touched = true
        for (let i = 0; i < 7; i++) puffs.push({ x: planeX - 6 * scale + (i - 3) * 3, y: runwayY - 2, r: 3 + i, age: -i * 0.04 })
      }
      if (L < TOUCH) touched = false
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i]
        p.age += dt; p.x -= v * dt * 0.6; p.r += dt * 14
        const a = clamp(0.55 - p.age * 0.35)
        if (a <= 0) { puffs.splice(i, 1); continue }
        if (p.age < 0) continue
        g.fillStyle = `rgba(235,235,240,${a})`
        g.beginPath(); g.arc(p.x, p.y - p.age * 6, p.r, 0, Math.PI * 2); g.fill()
      }

      g.save()
      g.translate(planeX, planeY); g.rotate(-pitch); g.scale(scale, scale)
      drawPlane(g, t, gear, Math.sin(t * 2.4) > 0.94, art)
      g.restore()

      // Near clouds pass in front of the plane while it is still high.
      drift(near, 1.5, 0.82 * (1 - smooth(0.1, 0.35, L)))

      // Flight data, like a cockpit display.
      const alt = Math.round(mix(35000, 0, descent) / 100) * 100
      const kt = Math.round(L < TOUCH ? mix(480, 145, smooth(0.1, 0.7, L)) : 145 * speedAt(L))
      const label = `ALT ${alt.toLocaleString('en-US')} FT   ·   ${kt} KT   ·   ${L === 0 ? 'CRUISE' : L < TOUCH ? 'APPROACH' : L < 1 ? 'LANDED' : 'AT GATE'}`
      g.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace'
      const tw = g.measureText(label).width
      g.fillStyle = 'rgba(23,32,42,0.45)'; g.beginPath(); g.roundRect(12, 12, tw + 20, 24, 12); g.fill()
      g.fillStyle = '#F4ECDD'; g.fillText(label, 22, 28)

      if (!still) frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(frame); resize.disconnect() }
  }, [opensAt])

  return <canvas ref={canvas} aria-hidden className={`block size-full ${className}`} />
}
