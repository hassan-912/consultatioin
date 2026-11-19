import { Link, useParams } from 'react-router-dom'
import { useT } from '../../i18n'
import { repo } from '../../data'
import { useStaffBookings } from '../../data/hooks'
import type { Booking } from '../../domain/types'
import { formatInZone } from '../../domain/time'
import { Icon } from '../../components/Icon'
import { ScreenTitle } from '../staff/StaffApp'
import { RoomPass, VideoRoomView } from './VideoRoom'
import { ConsultantRoomPanel } from './ConsultantRoomPanel'

/** Online bookings that are paid and not finished: the consultant can open their room. */
export const hasRoom = (b: Booking) => b.format === 'online' && (b.status === 'confirmed' || b.status === 'checked-in')

/** The consultant's (or admin's) "Start video call" button for one online booking. */
export function StartCallLink({ b, className = '' }: { b: Booking; className?: string }) {
  const { t } = useT()
  if (!hasRoom(b)) return null
  return (
    <Link to={`/staff/room/${b.id}`} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-ok px-4 text-sm font-semibold text-white hover:brightness-110 ${className}`}>
      <Icon name="video" size={16} />{t('room.staffJoin')}
    </Link>
  )
}

/** Staff side of the room: the consultant joins as host. The server checks it is their booking. */
export function StaffRoom() {
  const { id = '' } = useParams()
  const { t, lang } = useT()
  const b = useStaffBookings()[id] as Booking | undefined
  return (
    <>
      <ScreenTitle title={t('room.title')}>
        {b && (
          <Link to={`/staff/client/${b.id}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-navy hover:bg-white">
            <Icon name="user" size={15} />{b.customer.name} · {formatInZone(b.startIso, b.tz, lang, 'full')}
          </Link>
        )}
      </ScreenTitle>
      <VideoRoomView
        key={id}
        load={() => repo.videoRoom({ bookingId: id })}
        tz={b?.tz}
        roomKey={id}
        side={b ? ctx => <ConsultantRoomPanel booking={b} ctx={ctx} /> : undefined}
        after={b ? <StaffAfterCall b={b} /> : undefined}
        pass={b && (
          <RoomPass eyebrow={t('room.client')} name={b.customer.name} startIso={b.startIso} tz={b.tz} reference={b.reference}
            face={<span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate to-navy text-white"><Icon name="user" size={22} /></span>} />
        )}
      />
    </>
  )
}

/** The call is over: the consultant writes and publishes the summary (the recording stays available to download). */
function StaffAfterCall({ b }: { b: Booking }) {
  const { t } = useT()
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
      <section className="grid justify-items-center gap-4 rounded-[1.75rem] bg-white px-6 py-14 text-center shadow-card ring-1 ring-line">
        <span className="flex size-16 items-center justify-center rounded-full bg-ok-soft text-ok"><Icon name="check" size={28} /></span>
        <h2 className="font-display text-2xl font-semibold text-ink">{t('room.staffDoneTitle')}</h2>
        <p className="max-w-md text-base text-slate">{t('room.staffDoneBody')}</p>
      </section>
      <ConsultantRoomPanel booking={b} ctx={null} startOn="summary" />
    </div>
  )
}
