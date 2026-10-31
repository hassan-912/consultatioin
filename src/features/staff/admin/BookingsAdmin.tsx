import { useStaffBookings } from '../../../data/hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../../../i18n'
import { useAppStore } from '../../../store/useAppStore'
import { repo } from '../../../data'
import { canApply } from '../../../domain/bookingStatus'
import type { BookingStatus } from '../../../domain/types'
import { normalizeDigits } from '../../../domain/phone'
import { ConfirmButton } from '../../../components/ui'
import { SelectField, TextField } from '../../../components/fields'
import { ScreenTitle } from '../StaffApp'
import { BookingMeta, Empty } from '../common'
import { isLive } from '../../../data/mode'

const STATUSES: BookingStatus[] = ['reserved', 'on-hold', 'confirmed', 'checked-in', 'completed', 'no-show', 'expired', 'rejected', 'wrong-amount', 'duplicate', 'late-transfer', 'cancelled']

export function BookingsAdmin() {
  const { t } = useT()
  const role = useAppStore(s => s.role)
  const all = Object.values(useStaffBookings())
  const [status, setStatus] = useState<BookingStatus | 'all'>('all')
  const [q, setQ] = useState('')
  const query = normalizeDigits(q).trim().toLowerCase()
  const list = all
    .filter(b => status === 'all' || b.status === status)
    .filter(b => !query || [b.reference, b.customer.name, b.customer.phone].some(v => v.toLowerCase().includes(query)))
    .sort((a, b) => b.startIso.localeCompare(a.startIso))
  return (
    <>
      <ScreenTitle title={t('staff.screens.bookings')} />
      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_240px]">
        <TextField label={t('common.search')} value={q} onChange={e => setQ(e.target.value)} placeholder="MG-… / +20…" />
        <SelectField label={t('staff.admin.filterStatus')} value={status} onChange={e => setStatus(e.target.value as BookingStatus | 'all')}>
          <option value="all">{t('common.all')}</option>
          {STATUSES.map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </SelectField>
      </div>
      <div className="grid gap-3">
        {list.length ? list.map(b => (
          <article key={b.id} aria-label={b.reference} className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-line sm:flex-row sm:items-center sm:justify-between">
            <BookingMeta b={b} />
            <div className="flex shrink-0 gap-2">
              {!isLive && <Link to={`/booking/${b.manageToken}`} className="inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-semibold text-navy hover:bg-paper">{t('ticket.manage')}</Link>}
              {role === 'admin' && canApply(b, 'cancel') && (
                <ConfirmButton size="sm" label={t('ticket.cancelBooking')} confirmText={t('ticket.cancelConfirm')} onConfirm={() => repo.staffTransition(b.id, { type: 'cancel' }, role)} />
              )}
            </div>
          </article>
        )) : <Empty>{t('common.none')}</Empty>}
      </div>
    </>
  )
}
