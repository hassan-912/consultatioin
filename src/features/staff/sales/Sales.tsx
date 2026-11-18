import { useEffect, useState } from 'react'
import { useT } from '../../../i18n'
import { repo } from '../../../data'
import { DataStatus } from '../../../data/feedback'
import { useStaffBookings } from '../../../data/hooks'
import { useAppStore } from '../../../store/useAppStore'
import { isLive } from '../../../data/mode'
import { localReferralCode, referralLink } from '../../../data/referral'
import { isPaid } from '../../../domain/bookingStatus'
import { CopyField } from '../../../components/CopyField'
import { Notice } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { ScreenTitle } from '../StaffApp'
import { BookingMeta, Empty } from '../common'

/** Sales: the personal link to send to clients. Bookings made through it carry this sales person's name. */
export function SalesLink() {
  const { t } = useT()
  const [code, setCode] = useState<string>()
  const [error, setError] = useState<unknown>(null)
  useEffect(() => { repo.myReferralCode().then(setCode).catch(setError) }, [])
  const link = code ? referralLink(code) : ''
  return (
    <>
      <ScreenTitle title={t('staff.screens.salesLink')} />
      <div className="grid max-w-2xl gap-4 rounded-2xl bg-white p-5 ring-1 ring-line">
        <p className="text-sm text-slate">{t('sales.linkIntro')}</p>
        {!code ? <DataStatus loading={!error} error={error} /> : (
          <>
            <CopyField label={t('sales.yourLink')} value={link} />
            <div className="flex flex-wrap gap-2">
              <a href={`https://wa.me/?text=${encodeURIComponent(link)}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ok px-5 text-[15px] font-semibold text-white hover:brightness-110">
                <Icon name="chat" size={16} />{t('sales.shareWhatsapp')}
              </a>
            </div>
            <Notice tone="info">{t('sales.howItWorks')}</Notice>
          </>
        )}
      </div>
    </>
  )
}

/**
 * Sales: paid clients (finance verified). A sales person sees the ones who used their link; the sales manager
 * sees every paid client in the company, with who sold each one.
 */
export function MyClients() {
  const { t } = useT()
  const bookings = useStaffBookings()
  const session = useAppStore(s => s.staffSession)
  const manager = !!session?.salesManager
  // Live: the database returns only what this account may read. Prototype: filter by the local code.
  const code = !isLive && session ? localReferralCode(session.username) : null
  const mine = Object.values(bookings)
    .filter(b => isPaid(b.status))
    .filter(b => manager || (isLive ? !!b.salesName : b.salesCode === code))
    .sort((a, b) => b.createdAt - a.createdAt)
  return (
    <>
      <ScreenTitle title={t('staff.screens.myClients')} />
      {manager && <p className="mb-4 text-sm text-slate">{t('sales.allPaidIntro')}</p>}
      {mine.length ? (
        <ul className="grid gap-3">
          {mine.map(b => <li key={b.id} className="rounded-2xl bg-white p-4 ring-1 ring-line"><BookingMeta b={b} /></li>)}
        </ul>
      ) : <Empty>{t(manager ? 'sales.noPaidClients' : 'sales.noClients')}</Empty>}
    </>
  )
}
