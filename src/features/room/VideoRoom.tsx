import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useT } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import type { VideoRoom } from '../../domain/types'
import { DataStatus } from '../../data/feedback'
import { Button, Notice } from '../../components/ui'
import { Icon, type IconName } from '../../components/Icon'
import { formatInZone, zoneLabel } from '../../domain/time'
import { FlightScene } from './FlightScene'

const pad = (n: number) => String(n).padStart(2, '0')

/** A pulsing dot: gold while waiting, red when the call is live. */
function Beacon({ tone }: { tone: 'gold' | 'live' }) {
  const color = tone === 'gold' ? 'bg-gold' : 'bg-bad'
  return (
    <span className="relative inline-flex size-2.5" aria-hidden>
      <span className={`mg-breathe absolute inset-0 rounded-full ${color}`} />
      <span className={`relative size-2.5 rounded-full ${color}`} />
    </span>
  )
}

/** One countdown tile. The number is keyed by its value, so each change drops in fresh. */
function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.06] px-2 py-4 text-center ring-1 ring-white/10 backdrop-blur-sm sm:py-5">
      <span key={value} className="mg-tick font-display text-4xl font-semibold tabular-nums sm:text-6xl">{value}</span>
      <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-mist">{label}</span>
    </div>
  )
}

/** Counts down to the opening time, then asks for the room again. */
function Countdown({ opensAt, tz, onOpen }: { opensAt: number; tz: string; onOpen: () => void }) {
  const { t, lang } = useT()
  const now = useAppStore(s => s.now)
  const [left, setLeft] = useState(() => opensAt - now())
  useEffect(() => {
    // If this device's clock runs ahead of the server, the room is still "early" at zero: ask again every
    // 15 seconds rather than every second until the server agrees.
    const askedAt = opensAt - now() <= 0 ? now() : 0
    const id = setInterval(() => {
      const ms = opensAt - now()
      setLeft(ms)
      if (ms <= 0 && now() - askedAt >= 15_000) { clearInterval(id); onOpen() }
    }, 1000)
    return () => clearInterval(id)
  }, [opensAt, now, onOpen])
  const s = Math.max(0, Math.ceil(left / 1000))
  const d = Math.floor(s / 86400)
  return (
    <div>
      <p className="text-sm text-mist">{t('room.opensIn')}</p>
      <div className="mt-3 grid auto-cols-fr grid-flow-col gap-2 sm:gap-3" dir="ltr" aria-live="off">
        {d > 0 && <Tile value={String(d)} label={t('room.days')} />}
        <Tile value={pad(Math.floor(s / 3600) % 24)} label={t('room.hours')} />
        <Tile value={pad(Math.floor(s / 60) % 60)} label={t('room.minutes')} />
        <Tile value={pad(s % 60)} label={t('room.seconds')} />
      </div>
      <p className="mt-4 text-sm text-mist">{t('room.opensAt', { time: formatInZone(new Date(opensAt).toISOString(), tz, lang, 'full') })}</p>
    </div>
  )
}

/** The three steps from here to the call; the device test ticks off the first. */
function Steps({ devicesOk }: { devicesOk: boolean }) {
  const { t } = useT()
  const steps = [
    { label: t('room.stepCheck'), state: devicesOk ? 'done' : 'now' },
    { label: t('room.stepOpen'), state: devicesOk ? 'now' : 'next' },
    { label: t('room.stepMeet'), state: 'next' },
  ] as const
  return (
    <ol className="grid gap-3 sm:grid-cols-3">
      {steps.map((step, i) => (
        <li key={step.label} className="flex items-start gap-3 sm:flex-col sm:gap-2">
          <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
            step.state === 'done' ? 'bg-ok text-white' : step.state === 'now' ? 'bg-gold text-ink' : 'bg-white/10 text-mist'}`}>
            {step.state === 'done' ? <Icon name="check" size={15} /> : i + 1}
          </span>
          <span className={`text-sm leading-snug ${step.state === 'next' ? 'text-mist' : 'text-white'}`}>{step.label}</span>
        </li>
      ))}
    </ol>
  )
}

/** What to have ready, shown in the lounge while the client waits. */
function Prepare() {
  const { t } = useT()
  const tips: [IconName, string][] = [['volume', t('room.tipHeadphones')], ['eye', t('room.tipQuiet')], ['card', t('room.tipDocs')]]
  return (
    <ul className="grid gap-2.5 sm:grid-cols-3">
      {tips.map(([icon, text]) => (
        <li key={text} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3 py-2.5 text-sm sm:p-3 text-mist-soft ring-1 ring-white/10 sm:flex-col sm:items-start">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold"><Icon name={icon} size={16} /></span>
          {text}
        </li>
      ))}
    </ul>
  )
}

/** The dark "departure lounge" panel: the flight film on top, then the countdown and the steps. */
function Lounge({ scene, children }: { scene: ReactNode; children: ReactNode }) {
  const { t } = useT()
  return (
    <section className="relative flex flex-col overflow-hidden rounded-[1.75rem] bg-slate-deep text-white shadow-lift">
      <div className="relative h-56 sm:h-72">
        {scene}
        {/* Melts the bottom of the film into the panel. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-deep to-transparent" aria-hidden />
      </div>
      <div className="grain pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative flex flex-1 flex-col gap-7 p-6 pt-2 sm:p-8 sm:pt-3">
        <p className="inline-flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-gold">
          <Beacon tone="gold" />{t('room.waiting')}
        </p>
        {children}
      </div>
    </section>
  )
}

/** One booking as a boarding pass: who you meet, when, and the reference. */
export function RoomPass({ eyebrow, name, face, startIso, tz, reference }: {
  eyebrow: string; name: string; face: ReactNode; startIso: string; tz: string; reference: string
}) {
  const { t, lang } = useT()
  const rows: [string, ReactNode][] = [
    [t('room.date'), formatInZone(startIso, tz, lang, 'date')],
    [t('room.time'), <>{formatInZone(startIso, tz, lang, 'time')} <span className="text-muted">· {zoneLabel(tz, lang)}</span></>],
    [t('room.reference'), <span dir="ltr" className="font-mono tracking-wide">{reference}</span>],
  ]
  return (
    <section className="overflow-hidden rounded-[1.75rem] bg-white shadow-card ring-1 ring-line">
      <div className="flex items-center gap-4 p-5">
        {face}
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-deep">{eyebrow}</p>
          <p className="mt-0.5 truncate font-display text-lg font-semibold text-ink">{name}</p>
          <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted"><Icon name="shield" size={13} />{t('room.private')}</p>
        </div>
      </div>
      {/* Tear line with notches, like a ticket stub. */}
      <div className="relative h-4" aria-hidden>
        <span className="absolute top-1/2 h-px w-full -translate-y-1/2 border-t-2 border-dashed border-line" />
        <span className="absolute -left-2 top-0 size-4 rounded-full bg-paper ring-1 ring-line" />
        <span className="absolute -right-2 top-0 size-4 rounded-full bg-paper ring-1 ring-line" />
      </div>
      <dl className="grid gap-3 p-5 pt-3 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4">
            <dt className="text-muted">{k}</dt>
            <dd className="text-end font-semibold text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

const BARS = 24

/** Camera preview and a microphone meter, so problems show up before the call, not during it. */
function DeviceCheck({ onWorking }: { onWorking?: () => void }) {
  const { t } = useT()
  const [on, setOn] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [level, setLevel] = useState(0)
  const [camOk, setCamOk] = useState(false)
  const [micOk, setMicOk] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (!on) return
    let stream: MediaStream | undefined
    let audio: AudioContext | undefined
    let frame = 0
    let stopped = false
    navigator.mediaDevices?.getUserMedia({ video: true, audio: true }).then(s => {
      if (stopped) { s.getTracks().forEach(tr => tr.stop()); return }
      stream = s
      if (video.current) video.current.srcObject = s
      setCamOk(s.getVideoTracks().length > 0)
      audio = new AudioContext()
      const analyser = audio.createAnalyser()
      analyser.fftSize = 256
      audio.createMediaStreamSource(s).connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteFrequencyData(data)
        const next = Math.min(1, data.reduce((a, b) => a + b, 0) / data.length / 80)
        setLevel(next)
        if (next > 0.08) setMicOk(true)
        frame = requestAnimationFrame(tick)
      }
      tick()
    }).catch(() => { setBlocked(true); setOn(false) })
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach(tr => tr.stop())
      void audio?.close()
      setLevel(0)
    }
  }, [on])
  const working = camOk && micOk
  useEffect(() => { if (working) onWorking?.() }, [working, onWorking])

  const chip = (ok: boolean, icon: IconName, label: string) => (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${ok ? 'bg-ok-soft text-ok' : 'bg-paper text-muted'}`}>
      <Icon name={ok ? 'check' : icon} size={13} />{label}
    </span>
  )
  return (
    <section aria-labelledby="device-check" className="rounded-[1.75rem] bg-white p-5 shadow-card ring-1 ring-line">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="device-check" className="font-semibold text-ink">{t('room.checkTitle')}</h2>
        <div className="flex gap-1.5">{chip(camOk, 'video', t('room.camera'))}{chip(micOk, 'volume', t('room.mic'))}</div>
      </div>

      <div className="relative mt-4 aspect-video overflow-hidden rounded-2xl bg-slate-deep">
        {on ? (
          <>
            <video ref={video} autoPlay muted playsInline className="size-full -scale-x-100 object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent px-4 pb-3 pt-8">
              <div className="flex h-7 items-end gap-[3px]" role="meter" aria-label={t('room.micLevel')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
                {Array.from({ length: BARS }, (_, i) => {
                  // Each bar gets its own share of the level, so the meter moves like a voice, not a block.
                  const h = Math.max(0.1, Math.min(1, level * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7)))))
                  return <span key={i} className={`flex-1 rounded-full transition-[height] duration-75 ${h > 0.12 ? 'bg-ok' : 'bg-white/30'}`} style={{ height: `${Math.round(h * 100)}%` }} />
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="grid size-full place-items-center p-4 text-center">
            <div className="grid justify-items-center gap-3">
              <span className="flex size-14 items-center justify-center rounded-full bg-white/10 text-white"><Icon name="video" size={24} /></span>
              <p className="text-sm text-mist">{t('room.previewOff')}</p>
            </div>
          </div>
        )}
      </div>

      {blocked && <Notice tone="bad" className="mt-3">{t('room.deviceBlocked')}</Notice>}
      <Button variant={on ? 'ghost' : 'primary'} size="sm" className="mt-4 w-full sm:w-auto" onClick={() => { setBlocked(false); setOn(v => !v) }}>
        <Icon name="video" size={16} />{t(on ? 'room.checkStop' : 'room.checkStart')}
      </Button>

    </section>
  )
}

/** The frame around the call (or the demo stand-in): a live bar on top, the room below. */
function Stage({ children }: { children: ReactNode }) {
  const { t } = useT()
  return (
    <section className="flex flex-col overflow-hidden rounded-[1.75rem] bg-slate-deep shadow-lift ring-1 ring-ink/20">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-white">
        <p className="inline-flex items-center gap-2.5 text-sm font-semibold"><Beacon tone="live" />{t('room.live')} · {t('room.title')}</p>
        <p className="inline-flex items-center gap-1.5 text-xs text-mist"><Icon name="shield" size={13} />{t('room.private')}</p>
      </div>
      {children}
    </section>
  )
}

/** A closed or not-applicable room: one calm card with an icon and the reason. */
function RoomMessage({ icon, tone, text }: { icon: IconName; tone: 'ok' | 'muted'; text: string }) {
  return (
    <section className="grid justify-items-center gap-4 rounded-[1.75rem] bg-white px-6 py-14 text-center shadow-card ring-1 ring-line">
      <span className={`flex size-16 items-center justify-center rounded-full ${tone === 'ok' ? 'bg-ok-soft text-ok' : 'bg-gold-soft text-gold-deep'}`}><Icon name={icon} size={28} /></span>
      <p className="max-w-md text-base text-slate">{text}</p>
    </section>
  )
}

/**
 * The room for one online booking: a waiting lounge with countdown and device check before it opens,
 * then the call itself. `pass` is the booking card the page wants beside the countdown.
 */
export function VideoRoomView({ load, tz = 'Africa/Cairo', pass }: { load: () => Promise<VideoRoom>; tz?: string; pass?: ReactNode }) {
  const { t } = useT()
  const [room, setRoom] = useState<VideoRoom | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)
  const [devicesOk, setDevicesOk] = useState(false)
  const now = useAppStore(s => s.now)
  const retry = useCallback(() => setAttempt(n => n + 1), [])
  const markDevices = useCallback(() => setDevicesOk(true), [])
  useEffect(() => {
    let active = true
    setError(null)
    load().then(r => { if (active) setRoom(r) }).catch(e => { if (active) setError(e) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  if (error) return <div className="grid gap-3"><DataStatus error={error} /><Button variant="ghost" onClick={retry}>{t('data.retry')}</Button></div>
  if (!room) return <DataStatus loading />
  if (room.state === 'ready') {
    return (
      <Stage>
        <iframe
          title={t('room.title')}
          src={`${room.url}?t=${encodeURIComponent(room.token)}`}
          allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
          className="block h-[78dvh] min-h-[480px] w-full bg-ink"
        />
      </Stage>
    )
  }
  const side = <div className="grid content-start gap-5">{pass}<DeviceCheck onWorking={markDevices} /></div>
  if (room.state === 'early') {
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Lounge scene={<FlightScene opensAt={room.opensAt} now={now} />}>
          <Countdown opensAt={room.opensAt} tz={tz} onOpen={retry} />
          <Prepare />
          <div className="mt-auto border-t border-white/10 pt-6"><Steps devicesOk={devicesOk} /></div>
        </Lounge>
        {side}
      </div>
    )
  }
  if (room.state === 'demo') {
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Stage>
          <div className="grid min-h-[320px] flex-1 place-items-center bg-ink p-6 text-center">
            <div className="grid max-w-sm justify-items-center gap-4">
              <span className="flex size-16 items-center justify-center rounded-full bg-ok/20 text-ok-soft"><Icon name="check" size={28} /></span>
              <p className="text-sm text-mist-soft">{t('room.demo')}</p>
            </div>
          </div>
        </Stage>
        {side}
      </div>
    )
  }
  const message = {
    ended: ['check', 'ok', 'room.ended'],
    unavailable: ['card', 'muted', 'room.unavailable'],
    'not-online': ['building', 'muted', 'room.notOnline'],
  } as const
  const [icon, tone, key] = message[room.state]
  return <RoomMessage icon={icon} tone={tone} text={t(key)} />
}
