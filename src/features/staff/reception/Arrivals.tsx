import { useT } from '../../../i18n'
import { useAppStore, todayIn } from '../../../store/useAppStore'
import { repo } from '../../../data'
import { dateInZone } from '../../../domain/time'
import { Button } from '../../../components/ui'
import { ScreenTitle } from '../StaffApp'
import { BookingMeta, Empty } from '../common'

export function Arrivals() {
  const { t } = useT()
  const all = Object.values(useAppStore(s => s.bookings))
  const list = all
    .filter(b => b.format === 'in-person' && dateInZone(b.startIso, b.tz) === todayIn(b.tz) && ['confirmed', 'checked-in', 'completed', 'no-show', 'on-hold'].includes(b.status))
    .sort((a, b) => a.startIso.localeCompare(b.startIso))
  return (
    <>
      <ScreenTitle title={t('staff.screens.arrivals')} />
      <div className="grid gap-3">
        {list.length ? list.map(b => (
          <div key={b.id} className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-line sm:flex-row sm:items-center sm:justify-between">
            <BookingMeta b={b} />
            {b.status === 'confirmed' && (
              <div className="flex shrink-0 gap-2">
                <Button size="sm" onClick={() => repo.staffTransition(b.id, { type: 'check-in' }, 'reception')}>{t('staff.reception.record')}</Button>
                <Button size="sm" variant="ghost" onClick={() => repo.staffTransition(b.id, { type: 'no-show' }, 'reception')}>{t('staff.reception.markNoShow')}</Button>
              </div>
            )}
          </div>
        )) : <Empty>{t('staff.reception.arrivalsEmpty')}</Empty>}
      </div>
    </>
  )
}
