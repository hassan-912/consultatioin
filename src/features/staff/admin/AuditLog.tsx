import { useStaffAudit } from '../../../data/hooks'
import { useT } from '../../../i18n'
import { formatInZone } from '../../../domain/time'
import type { Actor } from '../../../domain/types'
import { ScreenTitle } from '../StaffApp'
import { Empty } from '../common'

const statusKeys = new Set(['reserved', 'on-hold', 'confirmed', 'checked-in', 'completed', 'no-show', 'expired', 'rejected', 'wrong-amount', 'duplicate', 'late-transfer', 'cancelled'])

export function AuditLog() {
  const { t, lang } = useT()
  const audit = useStaffAudit()
  const actor = (a: Actor) => (a === 'customer' || a === 'system' ? a : t(`staff.roles.${a}`))
  const label = (v?: string) => (v && statusKeys.has(v) ? t(`status.${v as 'confirmed'}`) : v)
  const actionKey = (a: string) => (['created', 'submitted', 'transition', 'edited', 'sent', 'checkin', 'signin'].includes(a) ? t(`audit.${a as 'created'}`) : a)
  return (
    <>
      <ScreenTitle title={t('staff.screens.audit')} />
      {audit.length ? (
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-line">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-paper text-start text-xs text-muted">
              <tr>
                <th className="px-4 py-3 text-start font-semibold">{t('common.time')}</th>
                <th className="px-4 py-3 text-start font-semibold">{t('staff.admin.actor')}</th>
                <th className="px-4 py-3 text-start font-semibold">{t('staff.admin.action')}</th>
                <th className="px-4 py-3 text-start font-semibold">{t('common.reference')}</th>
                <th className="px-4 py-3 text-start font-semibold">{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((e, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted">{formatInZone(e.at, 'Africa/Cairo', lang, 'full')}</td>
                  <td className="px-4 py-2.5 font-semibold">{actor(e.actor)}</td>
                  <td className="px-4 py-2.5">{actionKey(e.action)}</td>
                  <td className="px-4 py-2.5"><bdi dir="ltr">{e.bookingRef ?? '—'}</bdi></td>
                  <td className="px-4 py-2.5 text-muted">{[label(e.from), label(e.to)].filter(Boolean).join(' → ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>{t('staff.admin.auditEmpty')}</Empty>
      )}
    </>
  )
}
