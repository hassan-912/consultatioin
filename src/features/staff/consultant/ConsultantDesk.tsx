import { useStaffBookings, useStaffRecords } from '../../../data/hooks'
import { useMemo, useState } from 'react'
import type { ConsultationRecord } from '../../../store/useAppStore'
import { useT } from '../../../i18n'
import { useAppStore, type Outcome } from '../../../store/useAppStore'
import { getConsultants } from '../../../store/actions'
import { canApply } from '../../../domain/bookingStatus'
import { repo } from '../../../data'
import { Button } from '../../../components/ui'
import { SelectField, TextArea, TextField } from '../../../components/fields'
import { Icon } from '../../../components/Icon'
import { normalizeDigits } from '../../../domain/phone'
import type { Booking } from '../../../domain/types'
import { AssessmentRing } from '../../../assessment/StaffAssessment'
import { ClientReport } from '../../../assessment/report/ClientReport'
import { isSubmitted, useRecordDraft } from './recordDraft'
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

const digits = (s: string) => normalizeDigits(s).replace(/\D/g, '')

/**
 * Consultation records: write notes and the outcome, submit, and print the consultation
 * summary PDF (client details + file assessment + notes). Searchable by name or phone so nothing is forgotten.
 */
export function Records() {
  const { t } = useT()
  const records = useStaffRecords()
  const mine = useMine().filter(b => ['completed', 'checked-in'].includes(b.status))
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'todo' | 'all'>('todo')
  const q = query.trim().toLowerCase()
  const qDigits = digits(query)
  const matches = mine
    .filter(b => !q || b.customer.name.toLowerCase().includes(q) || (qDigits.length >= 3 && digits(b.customer.phone).includes(qDigits)) || b.reference.toLowerCase().includes(q))
    .sort((a, b) => b.startIso.localeCompare(a.startIso))
  const todo = matches.filter(b => !isSubmitted(records[b.id]))
  const list = tab === 'todo' ? todo : matches
  return (
    <>
      <ScreenTitle title={t('staff.screens.records')}><ConsultantPicker /></ScreenTitle>
      <div className="mb-4 max-w-md">
        <TextField label={t('staff.records.search')} hint={t('staff.records.searchHint')} type="search" value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'todo', label: t('staff.records.toSubmit'), count: todo.length },
        { id: 'all', label: t('staff.records.all'), count: matches.length },
      ]} />
      <div className="grid gap-3">
        {list.length ? list.map(b => <RecordCard key={b.id} b={b} record={records[b.id]} />)
          : <Empty>{q ? t('staff.records.noMatch') : tab === 'todo' ? t('staff.records.allDone') : t('common.none')}</Empty>}
      </div>
    </>
  )
}

const outcomes: Outcome[] = ['none', 'pending', 'approved', 'refused', 'withdrawn']

function RecordCard({ b, record }: { b: Booking; record?: ConsultationRecord }) {
  const draft = useRecordDraft(b, record)
  return (
    <article aria-label={b.reference} className="rounded-2xl bg-white p-4 ring-1 ring-line">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1"><BookingMeta b={b} /></div>
        <AssessmentRing bookingId={b.id} />
      </div>
      <div className="mt-4"><RecordFields draft={draft} /></div>
    </article>
  )
}

/** Notes, outcome, Submit and the PDF button for one consultation record. */
export function RecordFields({ draft }: { draft: ReturnType<typeof useRecordDraft> }) {
  const { t } = useT()
  const { notes, setNotes, outcome, setOutcome, busy, justSaved, submitted, dirty, report, save, pdf } = draft
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
        <TextArea label={t('staff.consultant.notes')} placeholder={t('staff.consultant.notesPlaceholder')} rows={5} dir="auto"
          value={notes} onChange={e => setNotes(e.target.value)} />
        <SelectField label={t('staff.consultant.outcome')} value={outcome} onChange={e => setOutcome(e.target.value as Outcome)}>
          {outcomes.map(o => <option key={o} value={o}>{t(`staff.consultant.outcomes.${o}`)}</option>)}
        </SelectField>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button disabled={busy || (!dirty && submitted)} onClick={() => void save()}>
          <Icon name="check" size={16} />{submitted && !dirty ? t('staff.records.submitted') : t('staff.records.submit')}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void pdf()}>
          <Icon name="download" size={16} />{t('staff.records.pdf')}
        </Button>
        <span role="status" className={`text-xs font-semibold ${dirty ? 'text-warn' : submitted ? 'text-ok' : 'text-muted'}`}>
          {dirty ? t('staff.records.unsaved') : justSaved ? t('staff.consultant.saved') : submitted ? '' : t('staff.records.notSubmitted')}
        </span>
      </div>
      {report && <ClientReport {...report} />}
    </>
  )
}
