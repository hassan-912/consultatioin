import { useMemo, useState } from 'react'
import { useT } from '../../../i18n'
import { repo } from '../../../data'
import { isLive } from '../../../data/mode'
import { errorKey } from '../../../data/feedback'
import { refreshPublicMetadata, useStaffBookings } from '../../../data/hooks'
import { todayIn } from '../../../store/useAppStore'
import { isBlocking, type DayOff, type ScheduleRules } from '../../../domain/availability'
import { addDays, formatDate, weekday, zonedDateTimeToIso } from '../../../domain/time'
import type { Format } from '../../../domain/types'
import { Button, Notice } from '../../../components/ui'
import { TextField } from '../../../components/fields'
import { Icon } from '../../../components/Icon'
import { bookableTimes } from './FreeSlotsAdmin'

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** Days off as a list with ids: live data carries them; the prototype derives them from its lists. */
export function daysOff(r: ScheduleRules): DayOff[] {
  if (r.exceptions) return r.exceptions
  return [
    ...r.holidays.map(d => ({ id: `holiday:${d}`, kind: 'holiday' as const, from: d, to: d })),
    ...r.unavailable.map(d => ({ id: `unavailable:${d}`, kind: 'unavailable' as const, from: d, to: d })),
    ...r.leave.map(l => ({ id: `leave:${l.from}:${l.to}`, kind: 'leave' as const, from: l.from, to: l.to })),
  ]
}

const isDayOff = (r: ScheduleRules, date: string) => daysOff(r).some(d => date >= d.from && date <= d.to)

function useAction() {
  const { t } = useT()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setNote(null)
    try { await fn(); if (isLive) await refreshPublicMetadata().catch(() => undefined); if (ok) setNote({ tone: 'ok', text: ok }) }
    catch (e) { setNote({ tone: 'bad', text: t(errorKey(e)) }) } finally { setBusy(false) }
  }
  return { busy, note, run }
}

/** Online / in person for this consultant. */
export function FormatsEditor({ id, rules }: { id: string; rules: ScheduleRules }) {
  const { t } = useT()
  const { busy, note, run } = useAction()
  const toggle = (f: Format) => {
    const next = rules.formats.includes(f) ? rules.formats.filter(x => x !== f) : [...rules.formats, f]
    if (next.length) void run(() => repo.saveSchedule(id, { formats: next }))
  }
  return (
    <section aria-label={t('staff.admin.formats')} className="rounded-2xl bg-white p-5 ring-1 ring-line">
      <h2 className="mb-3 font-semibold text-ink">{t('staff.admin.formats')}</h2>
      <div className="flex flex-wrap gap-2">
        {(['online', 'in-person'] as Format[]).map(f => (
          <label key={f} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold">
            <input type="checkbox" className="size-4 accent-slate" disabled={busy} checked={rules.formats.includes(f)} onChange={() => toggle(f)} />
            <Icon name={f === 'online' ? 'video' : 'building'} size={15} />{t(`format.${f}`)}
          </label>
        ))}
      </div>
      {note && <Notice tone={note.tone} className="mt-3">{note.text}</Notice>}
    </section>
  )
}

/** Give a day off (or several) and take it back. */
export function DaysOffEditor({ id, rules, tz }: { id: string; rules: ScheduleRules; tz: string }) {
  const { t, lang } = useT()
  const today = todayIn(tz)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const { busy, note, run } = useAction()
  const list = daysOff(rules).filter(d => d.to >= today).sort((a, b) => a.from.localeCompare(b.from))
  const add = () => run(async () => { await repo.addDayOff(id, from, to || from); setFrom(''); setTo('') }, t('staff.hours.dayOffAdded'))
  return (
    <section aria-label={t('staff.hours.daysOff')} className="rounded-2xl bg-white p-5 ring-1 ring-line">
      <h2 className="font-semibold text-ink">{t('staff.hours.daysOff')}</h2>
      <p className="mb-3 text-sm text-muted">{t('staff.hours.daysOffHint')}</p>
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <TextField label={t('staff.hours.dayOffFrom')} type="date" min={today} value={from} onChange={e => setFrom(e.target.value)} />
        <TextField label={t('staff.hours.dayOffTo')} hint={t('staff.hours.dayOffToHint')} type="date" min={from || today} value={to} onChange={e => setTo(e.target.value)} />
        <Button disabled={busy || !from || (!!to && to < from)} onClick={() => void add()}><Icon name="plus" size={16} />{t('staff.hours.addDayOff')}</Button>
      </div>
      {note && <Notice tone={note.tone} className="mt-3">{note.text}</Notice>}
      <ul className="mt-4 grid gap-2">
        {list.length ? list.map(d => (
          <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl bg-warn-soft px-3 py-2 text-sm">
            <span className="font-semibold text-warn">{formatDate(d.from, lang)}{d.to !== d.from && <> → {formatDate(d.to, lang)}</>}</span>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => repo.removeDayOff(id, d.id), t('staff.hours.dayOffRemoved'))}>
              <Icon name="x" size={14} />{t('staff.hours.remove')}
            </Button>
          </li>
        )) : <li className="text-sm text-muted">{t('staff.hours.noDaysOff')}</li>}
      </ul>
    </section>
  )
}

/** Pick a date, then tap an hour to block it (nobody can book it) or unblock it. */
export function BlockTimesEditor({ id, rules, tz }: { id: string; rules: ScheduleRules; tz: string }) {
  const { t, lang } = useT()
  const today = todayIn(tz)
  const [date, setDate] = useState(addDays(today, 1))
  const { busy, note, run } = useAction()
  const bookings = useStaffBookings()
  const blocked = new Set(rules.blocked ?? [])
  const dayWindows = rules.weekly[weekday(date)] ?? []
  const brk = rules.breaks[0]
  const times = useMemo(() => dayWindows.flatMap(w => bookableTimes(w.start, w.end, brk)).map(m => ({ m, iso: zonedDateTimeToIso(date, m, tz) })),
    [JSON.stringify(dayWindows), JSON.stringify(brk), date, tz]) // eslint-disable-line react-hooks/exhaustive-deps
  const booked = new Set(Object.values(bookings)
    .filter(b => b.consultantId === id && isBlocking(b, Date.now()))
    .map(b => new Date(b.startIso).toISOString()))

  let body
  if (isDayOff(rules, date)) body = <p className="text-sm font-semibold text-warn">{t('staff.hours.isDayOff')}</p>
  else if (!times.length) body = <p className="text-sm text-muted">{t('staff.hours.closed')}</p>
  else body = (
    <div className="flex flex-wrap gap-2">
      {times.map(({ m, iso }) => {
        const isBooked = booked.has(iso)
        const isBlocked = blocked.has(iso)
        const past = Date.parse(iso) < Date.now()
        return (
          <button key={iso} type="button" disabled={busy || isBooked || past} aria-pressed={isBlocked}
            aria-label={`${hhmm(m)} — ${t(isBooked ? 'staff.hours.booked' : isBlocked ? 'staff.hours.blocked' : 'staff.hours.open')}`}
            onClick={() => void run(() => repo.setSlotBlocked(id, iso, !isBlocked))}
            className={`inline-flex min-h-11 flex-col items-center justify-center rounded-xl px-3 text-sm font-semibold ring-1 disabled:cursor-not-allowed ${
              isBooked ? 'bg-paper text-muted ring-line' : isBlocked ? 'bg-bad-soft text-bad ring-bad/40 line-through' : past ? 'bg-paper text-mist ring-line' : 'bg-ok-soft text-ok ring-ok/30 hover:brightness-95'}`}>
            <span dir="ltr">{hhmm(m)}</span>
            <span className="text-[10px] font-semibold no-underline">{t(isBooked ? 'staff.hours.booked' : isBlocked ? 'staff.hours.blocked' : 'staff.hours.open')}</span>
          </button>
        )
      })}
    </div>
  )

  return (
    <section aria-label={t('staff.hours.blockTitle')} className="rounded-2xl bg-white p-5 ring-1 ring-line">
      <h2 className="font-semibold text-ink">{t('staff.hours.blockTitle')}</h2>
      <p className="mb-3 text-sm text-muted">{t('staff.hours.blockHint')}</p>
      <div className="mb-3 max-w-xs">
        <TextField label={t('common.date')} type="date" min={today} value={date} onChange={e => e.target.value && setDate(e.target.value)}
          hint={formatDate(date, lang)} />
      </div>
      {body}
      {note && <Notice tone={note.tone} className="mt-3">{note.text}</Notice>}
    </section>
  )
}
