import { useEffect, useState } from 'react'
import { useT } from '../../../i18n'
import { repo } from '../../../data'
import { isLive } from '../../../data/mode'
import { errorKey } from '../../../data/feedback'
import { refreshPublicMetadata, useStaffSchedules } from '../../../data/hooks'
import { getConsultants } from '../../../store/actions'
import { consultationMinutes } from '../../../config/booking'
import type { ScheduleRules } from '../../../domain/availability'
import { Button, Notice } from '../../../components/ui'
import { SelectField } from '../../../components/fields'
import { Icon } from '../../../components/Icon'
import { ScreenTitle } from '../StaffApp'
import { branchById } from '../../../config/branches'
import { BlockTimesEditor, DaysOffEditor, FormatsEditor } from './AvailabilityExtras'

type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6
const DAYS: Day[] = [6, 0, 1, 2, 3, 4, 5] // Saturday first, as the work week runs in Egypt
const HOURS = Array.from({ length: 18 }, (_, i) => (i + 6) * 60) // 06:00 … 23:00
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

interface Draft {
  days: Record<Day, { open: boolean; start: number; end: number }>
  breakOn: boolean
  breakStart: number
  breakEnd: number
  limit: string
}

function toDraft(r: ScheduleRules): Draft {
  const days = Object.fromEntries(DAYS.map(d => {
    const w = r.weekly[d] ?? []
    return [d, w.length ? { open: true, start: w[0].start, end: w[w.length - 1].end } : { open: false, start: 12 * 60, end: 18 * 60 }]
  })) as Draft['days']
  const br = r.breaks[0]
  return { days, breakOn: !!br, breakStart: br?.start ?? 13 * 60, breakEnd: br?.end ?? 14 * 60, limit: r.maxPerDay ? String(r.maxPerDay) : '' }
}

/** The hourly start times customers would see on a day with these hours (45-minute consultations, one per hour). */
export function bookableTimes(start: number, end: number, brk?: { start: number; end: number }): number[] {
  const out: number[] = []
  for (let m = start; m + consultationMinutes <= end; m += 60) {
    if (brk && m < brk.end && m + consultationMinutes > brk.start) continue
    out.push(m)
  }
  return out
}

/** Admin: set each consultant's working days, hours, break and daily limit, with the resulting bookable times. */
export function AvailableTimesAdmin() {
  const { t, l } = useT()
  const schedules = useStaffSchedules()
  const consultants = getConsultants()
  const [id, setId] = useState(consultants[0].id)
  const rules = schedules[id]
  const tz = branchById(consultants.find(c => c.id === id)!.branchId).timeZone
  const [draft, setDraft] = useState<Draft | null>(rules ? toDraft(rules) : null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  // Reload the form when switching consultant or when the saved hours arrive/change.
  const key = JSON.stringify([id, rules?.weekly, rules?.breaks, rules?.maxPerDay])
  useEffect(() => { setDraft(rules ? toDraft(rules) : null); setNote(null) }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (p: Partial<Draft>) => { setDraft(d => d && { ...d, ...p }); setNote(null) }
  const setDay = (d: Day, p: Partial<Draft['days'][Day]>) => setDraft(x => x && { ...x, days: { ...x.days, [d]: { ...x.days[d], ...p } } })

  const invalidDay = draft ? DAYS.find(d => draft.days[d].open && draft.days[d].end <= draft.days[d].start) : undefined
  const invalidBreak = !!draft?.breakOn && draft.breakEnd <= draft.breakStart
  const limit = draft?.limit.trim() ? Number(draft.limit) : undefined
  const invalidLimit = limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)
  const invalid = invalidDay !== undefined || invalidBreak || invalidLimit

  const save = async () => {
    if (!draft || invalid) return
    setBusy(true); setNote(null)
    try {
      const weekly = Object.fromEntries(([0, 1, 2, 3, 4, 5, 6] as Day[]).map(d =>
        [d, draft.days[d].open ? [{ start: draft.days[d].start, end: draft.days[d].end }] : []])) as ScheduleRules['weekly']
      await repo.saveSchedule(id, { weekly, breaks: draft.breakOn ? [{ start: draft.breakStart, end: draft.breakEnd }] : [], maxPerDay: limit })
      if (isLive) await refreshPublicMetadata()
      setNote({ tone: 'ok', text: t('staff.hours.saved') })
    } catch (e) { setNote({ tone: 'bad', text: t(errorKey(e)) }) } finally { setBusy(false) }
  }

  const hourSelect = (label: string, value: number, onChange: (m: number) => void, disabled = false) => (
    <select aria-label={label} value={value} disabled={disabled} onChange={e => onChange(Number(e.target.value))}
      className="min-h-10 rounded-lg border border-line bg-white px-2 text-sm font-semibold text-ink disabled:opacity-40">
      {HOURS.map(m => <option key={m} value={m}>{hhmm(m)}</option>)}
    </select>
  )

  return (
    <>
      <ScreenTitle title={t('staff.screens.freeSlots')}>
        <div className="w-64">
          <SelectField label={t('common.consultant')} value={id} onChange={e => setId(e.target.value)}>
            {consultants.map(c => <option key={c.id} value={c.id}>{l(c.name)}</option>)}
          </SelectField>
        </div>
      </ScreenTitle>
      <p className="-mt-3 mb-5 text-sm text-muted">{t('staff.hours.intro')}</p>

      {!draft ? <Notice tone="info">{t('staff.hours.noSchedule')}</Notice> : (
        <div className="grid gap-4">
          <section aria-label={t('staff.hours.week')} className="rounded-2xl bg-white p-5 ring-1 ring-line">
            <h2 className="mb-3 font-semibold text-ink">{t('staff.hours.week')}</h2>
            <ul className="divide-y divide-line">
              {DAYS.map(d => {
                const day = draft.days[d]
                const times = day.open && day.end > day.start
                  ? bookableTimes(day.start, day.end, draft.breakOn ? { start: draft.breakStart, end: draft.breakEnd } : undefined) : []
                const dayName = t(`staff.admin.days.${d}`)
                return (
                  <li key={d} aria-label={dayName} className="grid gap-2 py-3 md:grid-cols-[110px_auto_minmax(0,1fr)] md:items-center">
                    <label className="inline-flex items-center gap-2 font-semibold text-ink">
                      <input type="checkbox" className="size-4 accent-slate" checked={day.open} onChange={e => setDay(d, { open: e.target.checked })} />
                      {dayName}
                    </label>
                    <div className="flex items-center gap-2 text-sm">
                      {hourSelect(`${dayName} ${t('staff.hours.from')}`, day.start, m => setDay(d, { start: m }), !day.open)}
                      <span className="text-muted">→</span>
                      {hourSelect(`${dayName} ${t('staff.hours.to')}`, day.end, m => setDay(d, { end: m }), !day.open)}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {!day.open ? <span className="text-sm text-muted">{t('staff.hours.closed')}</span>
                        : day.end <= day.start ? <span className="text-sm font-semibold text-bad">{t('staff.hours.endAfterStart')}</span>
                        : times.length ? times.map(m => <span key={m} dir="ltr" className="rounded-lg bg-ok-soft px-2 py-0.5 text-xs font-semibold text-ok">{hhmm(m)}</span>)
                        : <span className="text-sm text-warn">{t('staff.hours.noTimes')}</span>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="grid gap-4 rounded-2xl bg-white p-5 ring-1 ring-line md:grid-cols-2">
            <div>
              <label className="inline-flex items-center gap-2 font-semibold text-ink">
                <input type="checkbox" className="size-4 accent-slate" checked={draft.breakOn} onChange={e => set({ breakOn: e.target.checked })} />
                {t('staff.hours.break')}
              </label>
              <div className="mt-2 flex items-center gap-2 text-sm">
                {hourSelect(`${t('staff.hours.break')} ${t('staff.hours.from')}`, draft.breakStart, m => set({ breakStart: m }), !draft.breakOn)}
                <span className="text-muted">→</span>
                {hourSelect(`${t('staff.hours.break')} ${t('staff.hours.to')}`, draft.breakEnd, m => set({ breakEnd: m }), !draft.breakOn)}
              </div>
              {invalidBreak && <p className="mt-1 text-sm font-semibold text-bad">{t('staff.hours.endAfterStart')}</p>}
            </div>
            <div>
              <label htmlFor="daily-limit" className="font-semibold text-ink">{t('staff.admin.dailyLimit')}</label>
              <input id="daily-limit" type="number" min={1} max={100} inputMode="numeric" value={draft.limit} placeholder={t('staff.hours.noLimit')}
                onChange={e => set({ limit: e.target.value })}
                className="mt-2 block min-h-10 w-40 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink" />
              {invalidLimit && <p className="mt-1 text-sm font-semibold text-bad">{t('staff.hours.limitRange')}</p>}
            </div>
          </section>

          {note && <Notice tone={note.tone}>{note.text}</Notice>}
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={busy || invalid} onClick={() => void save()}><Icon name="check" size={16} />{t('staff.hours.save')}</Button>
            <p className="text-xs text-muted">{t('staff.hours.howItWorks', { n: consultationMinutes })}</p>
          </div>

          {rules && <>
            <DaysOffEditor id={id} rules={rules} tz={tz} />
            <BlockTimesEditor id={id} rules={rules} tz={tz} />
            <FormatsEditor id={id} rules={rules} />
          </>}
        </div>
      )}
    </>
  )
}
