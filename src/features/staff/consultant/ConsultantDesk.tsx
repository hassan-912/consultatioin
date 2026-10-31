import { useStaffBookings, useStaffRecords } from '../../../data/hooks'
import { useMemo, useRef, useState } from 'react'
import { reportActionError } from '../../../data/feedback'
import type { ConsultationRecord } from '../../../store/useAppStore'
import { useT } from '../../../i18n'
import { useAppStore, type Outcome } from '../../../store/useAppStore'
import { getConsultants } from '../../../store/actions'
import { canApply } from '../../../domain/bookingStatus'
import { repo } from '../../../data'
import { Button } from '../../../components/ui'
import { SelectField, TextArea } from '../../../components/fields'
import { ScreenTitle } from '../StaffApp'
import { BookingMeta, Empty, Tabs } from '../common'
import { AvailabilityBoard } from './AvailabilityBoard'

function ConsultantPicker() {
  const { t, l } = useT()
  const role = useAppStore(s => s.role)
  const id = useAppStore(s => s.staffConsultantId)
  const set = useAppStore(s => s.setStaffConsultantId)
  // A signed-in consultant only ever sees their own work.
  if (role === 'consultant') return null
  return (
    <div className="w-64">
      <SelectField label={t('staff.consultant.pickConsultant')} value={id} onChange={e => set(e.target.value)}>
        {getConsultants().map(c => <option key={c.id} value={c.id}>{l(c.name)}</option>)}
      </SelectField>
    </div>
  )
}

function useMine() {
  const id = useAppStore(s => s.staffConsultantId)
  const bookings = useStaffBookings()
  return useMemo(() => Object.values(bookings).filter(b => b.consultantId === id), [bookings, id])
}

export function MyCalendar() {
  const { t } = useT()
  const role = useAppStore(s => s.role)
  const own = useAppStore(s => s.staffSession?.consultantId ?? null)
  // Consultants see their own row; admins see the whole team.
  const ids = role === 'consultant' && own ? [own] : undefined
  return (
    <>
      <ScreenTitle title={role === 'consultant' ? t('staff.screens.myCalendar') : t('staff.calendar.title')} />
      <AvailabilityBoard consultantIds={ids} />
    </>
  )
}

export function MyBookings() {
  const { t } = useT()
  const mine = useMine()
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const list = mine
    .filter(b => !['expired', 'cancelled', 'reserved'].includes(b.status))
    .filter(b => (tab === 'upcoming' ? ['confirmed', 'on-hold', 'checked-in'].includes(b.status) : ['completed', 'no-show'].includes(b.status)))
    .sort((a, b) => a.startIso.localeCompare(b.startIso))
  return (
    <>
      <ScreenTitle title={t('staff.screens.myBookings')}><ConsultantPicker /></ScreenTitle>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'upcoming', label: t('staff.consultant.upcoming') }, { id: 'past', label: t('staff.consultant.past') }]} />
      <div className="grid gap-3">
        {list.length ? list.map(b => (
          <article key={b.id} aria-label={b.reference} className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-line sm:flex-row sm:items-center sm:justify-between">
            <BookingMeta b={b} />
            <div className="flex shrink-0 gap-2">
              {canApply(b, 'complete') && <Button size="sm" onClick={() => repo.staffTransition(b.id, { type: 'complete' }, 'consultant')}>{t('staff.consultant.markCompleted')}</Button>}
              {canApply(b, 'no-show') && (
                <Button size="sm" variant="ghost" onClick={() => repo.staffTransition(b.id, { type: 'no-show' }, 'consultant')}>{t('staff.consultant.markNoShow')}</Button>
              )}
            </div>
          </article>
        )) : <Empty>{t('common.none')}</Empty>}
      </div>
    </>
  )
}

export function Records() {
  const { t } = useT()
  const mine = useMine().filter(b => ['completed', 'checked-in'].includes(b.status))
  const records = useStaffRecords()
  const [saved, setSaved] = useState<string | null>(null)
  const pending = useRef<Record<string, ConsultationRecord>>({})
  const queue = useRef<Promise<void>>(Promise.resolve())
  const save = (id: string, _ref: string, patch: Partial<{ notes: string; outcome: Outcome }>) => {
    const record = { ...(pending.current[id] ?? records[id] ?? { notes: '', outcome: 'none' }), ...patch }
    pending.current[id] = record
    setSaved(null)
    queue.current = queue.current.then(() => repo.saveRecord(id, record)).then(() => { setSaved(id) }).catch(reportActionError)
  }
  const outcomes: Outcome[] = ['none', 'pending', 'approved', 'refused', 'withdrawn']
  return (
    <>
      <ScreenTitle title={t('staff.screens.records')}><ConsultantPicker /></ScreenTitle>
      <div className="grid gap-3">
        {mine.length ? mine.map(b => (
          <article key={b.id} aria-label={b.reference} className="rounded-2xl bg-white p-4 ring-1 ring-line">
            <BookingMeta b={b} />
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_220px]">
              <TextArea
                label={t('staff.consultant.notes')}
                placeholder={t('staff.consultant.notesPlaceholder')}
                defaultValue={records[b.id]?.notes ?? ''}
                onBlur={e => save(b.id, b.reference, { notes: e.target.value })}
              />
              <SelectField label={t('staff.consultant.outcome')} value={pending.current[b.id]?.outcome ?? records[b.id]?.outcome ?? 'none'} onChange={e => save(b.id, b.reference, { outcome: e.target.value as Outcome })}>
                {outcomes.map(o => <option key={o} value={o}>{t(`staff.consultant.outcomes.${o}`)}</option>)}
              </SelectField>
            </div>
            {saved === b.id && <p role="status" className="mt-2 text-xs font-semibold text-ok">{t('staff.consultant.saved')}</p>}
          </article>
        )) : <Empty>{t('common.none')}</Empty>}
      </div>
    </>
  )
}
