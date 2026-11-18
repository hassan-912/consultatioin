import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useT } from '../../i18n'
import { repo } from '../../data'
import type { Booking } from '../../domain/types'
import { getConsultant } from '../../store/actions'
import { formatInZone } from '../../domain/time'
import { Header } from '../../components/Header'
import { Avatar } from '../../components/widgets'
import { Icon } from '../../components/Icon'
import { RoomPass, VideoRoomView } from './VideoRoom'

/** The client's online consultation, opened from their booking page (manage link). */
export function ClientRoomPage() {
  const { token = '' } = useParams()
  const { t, l, lang } = useT()
  const [b, setB] = useState<Booking | null>()
  useEffect(() => { void repo.getByManageToken(token).then(setB).catch(() => setB(null)) }, [token])
  const c = b ? getConsultant(b.consultantId) : null
  return (
    <>
      <Header />
      <main id="main" className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link to={`/booking/${token}`} className="-ms-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-navy hover:bg-white">
              <Icon name="chevron" size={15} className="rotate-180 rtl:rotate-0" />{t('room.back')}
            </Link>
            <h1 className="mt-1 font-display text-2xl font-semibold text-ink sm:text-3xl">{t('room.title')}</h1>
            {b && c && <p className="mt-1 text-sm text-slate">{t('room.withName', { name: l(c.name) })} · {formatInZone(b.startIso, b.tz, lang, 'full')}</p>}
          </div>
        </div>
        <VideoRoomView
          key={token}
          load={() => repo.videoRoom({ manageToken: token })}
          tz={b?.tz}
          pass={b && c && (
            <RoomPass eyebrow={t('room.consultant')} name={l(c.name)} face={<Avatar consultant={c} size="sm" />}
              startIso={b.startIso} tz={b.tz} reference={b.reference} />
          )}
        />
      </main>
    </>
  )
}
