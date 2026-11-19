import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { DailyCall } from '@daily-co/daily-js'
import { useT } from '../../i18n'
import { Button } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { broadcastChannel, isRoomMessage, type RoomChannel, type RoomMessage } from './sharedAssessment'

/** What the panels beside the video can use: the data pipe to the other side, and the call itself (staff controls). */
export interface RoomContext {
  channel: RoomChannel
  /** Null in the prototype, where there is no video service. */
  call: DailyCall | null
}

/** The call fills the left; `side` (the assessment card) sits on the right on wide screens, below on phones. */
function Layout({ stage, side }: { stage: ReactNode; side: ReactNode }) {
  // One structure whatever the side holds: switching wrappers would remount the stage and drop the call.
  // The side column exists only while it has something in it (the client's card appears when shared).
  return (
    <div className="grid items-start gap-5 xl:has-[>aside>*]:grid-cols-[minmax(0,1fr)_440px]">
      {stage}
      <aside className="empty:hidden xl:sticky xl:top-4">{side}</aside>
    </div>
  )
}

/**
 * The live Daily call. Daily's own call screen is used, wrapped by daily-js so the page can pass app messages
 * (the shared assessment) and notice when this person leaves. Loaded on demand: most pages never need it.
 */
export function LiveCall({ url, token, frame, side, after }: {
  url: string; token: string
  frame: (body: ReactNode) => ReactNode
  side?: (ctx: RoomContext) => ReactNode
  after?: ReactNode
}) {
  const host = useRef<HTMLDivElement>(null)
  const [call, setCall] = useState<DailyCall | null>(null)
  const [left, setLeft] = useState(false)
  const [failed, setFailed] = useState(false)
  const listeners = useRef(new Set<(m: RoomMessage) => void>())

  useEffect(() => {
    let co: DailyCall | null = null
    let gone = false
    void import('@daily-co/daily-js').then(({ default: Daily }) => {
      if (gone || !host.current) return
      // Only one call object may exist per page: reuse a leftover one from a fast remount.
      co = Daily.getCallInstance() ?? Daily.createFrame(host.current, {
        showLeaveButton: true, showFullscreenButton: true,
        iframeStyle: { width: '100%', height: '100%', border: '0', display: 'block', background: '#0b1418' },
      })
      co.on('app-message', e => { if (e && isRoomMessage(e.data)) listeners.current.forEach(fn => fn(e.data)) })
      co.on('left-meeting', () => setLeft(true))
      setCall(co)
      co.join({ url, token }).catch(() => setFailed(true))
    }).catch(() => setFailed(true))
    return () => { gone = true; void co?.destroy() }
  }, [url, token])

  const channel = useMemo<RoomChannel>(() => ({
    send: m => { try { call?.sendAppMessage(m, '*') } catch { /* not joined yet: the other side asks again with "hello" */ } },
    listen: fn => { listeners.current.add(fn); return () => listeners.current.delete(fn) },
  }), [call])

  if (left && after) return <>{after}</>
  const stage = frame(failed
    ? <ServiceDown />
    : <div ref={host} className="h-[78dvh] min-h-[480px] w-full bg-ink" />)
  return <Layout stage={stage} side={side?.({ channel, call })} />
}

function ServiceDown() {
  const { t } = useT()
  return <p className="grid min-h-[320px] place-items-center bg-ink p-6 text-center text-sm text-mist-soft">{t('room.serviceDown')}</p>
}

/**
 * The prototype room: no video, but the shared card works between two tabs of this browser
 * (open the client's room in one and the consultant's in the other).
 */
export function DemoCall({ roomKey, frame, side, after }: {
  roomKey: string
  frame: (body: ReactNode) => ReactNode
  side?: (ctx: RoomContext) => ReactNode
  after?: ReactNode
}) {
  const { t } = useT()
  const [left, setLeft] = useState(false)
  // Opened in the effect, not during render, so a remount (React's dev double-mount) gets a fresh, open channel.
  const [channel, setChannel] = useState<RoomChannel | null>(null)
  useEffect(() => {
    const c = broadcastChannel(`mg-room-${roomKey}`)
    setChannel(c)
    return () => c.close()
  }, [roomKey])
  if (left && after) return <>{after}</>
  const stage = frame(
    <div className="grid min-h-[420px] flex-1 place-items-center bg-ink p-6 text-center">
      <div className="grid max-w-sm justify-items-center gap-4">
        <span className="flex size-16 items-center justify-center rounded-full bg-ok/20 text-ok-soft"><Icon name="check" size={28} /></span>
        <p className="text-sm text-mist-soft">{t('room.demo')}</p>
        {after && <Button variant="light" size="sm" onClick={() => setLeft(true)}><Icon name="x" size={15} />{t('room.leaveDemo')}</Button>}
      </div>
    </div>,
  )
  return <Layout stage={stage} side={channel && side?.({ channel, call: null })} />
}
