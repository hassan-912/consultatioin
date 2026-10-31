import { useStaffBookings, useStaffSchedules } from '../../../data/hooks'
import { useEffect, useMemo, useState } from 'react'
import { repo } from '../../../data'
import { isLive } from '../../../data/mode'
import { DataStatus } from '../../../data/feedback'
import { useT } from '../../../i18n'
import { useAppStore, todayIn } from '../../../store/useAppStore'
import { getConsultants, getRules } from '../../../store/actions'
import { isBlocking, type ScheduleRules } from '../../../domain/availability'
import { addDays, dateInZone, formatDate, weekday } from '../../../domain/time'
import { branchById } from '../../../config/branches'
import type { Consultant } from '../../../domain/types'
import { Avatar } from '../../../components/widgets'
import { DemoBadge } from '../../../components/ui'
import { slotsFor } from '../../shared/availability'

type DayState = { kind: 'off' | 'holiday' | 'leave' | 'unavailable' } | { kind: 'open'; booked: number; free: number }

const DAYS = 14

function dayState(c: Consultant, rules: ScheduleRules, date: string, booked: number, serverFree?: number): DayState {
  if (rules.holidays.includes(date)) return { kind: 'holiday' }
  if (rules.leave.some(l => date >= l.from && date <= l.to)) return { kind: 'leave' }
  if (rules.unavailable.includes(date)) return { kind: 'unavailable' }
  if (rules.weekly[weekday(date)].length === 0) return { kind: 'off' }
  const free = isLive ? serverFree ?? 0 : slotsFor(c.id, date, rules.formats[0]).length
  return { kind: 'open', booked, free }
}

/** Merges consecutive dates into ranges for the short summary ("2–4 Nov"). */
function ranges(dates: string[]): [string, string][] {
  const out: [string, string][] = []
  for (const d of [...dates].sort()) {
    const last = out[out.length - 1]
    if (last && addDays(last[1], 1) === d) last[1] = d
    else out.push([d, d])
  }
  return out
}

const tone: Record<DayState['kind'], string> = {
  off: 'bg-paper text-muted',
  holiday: 'bg-warn-soft text-warn',
  leave: 'bg-bad-soft text-bad',
  unavailable: 'bg-bad-soft text-bad',
  open: 'bg-ok-soft text-ok',
}

export function AvailabilityBoard({ consultantIds }: { consultantIds?: string[] }) {
  const { t, l, lang } = useT()
  const bookings = useStaffBookings()
  const overrides = useAppStore(s => s.scheduleOverrides)
  const consultantOverrides = useAppStore(s => s.consultantOverrides)
  const now = useAppStore(s => s.now)
  const today = todayIn('Africa/Cairo')
  const dates = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(today, i)), [today])
  const schedules = useStaffSchedules()
  const [server, setServer] = useState<{ free: Record<string, number>; loading: boolean; error: unknown }>({ free: {}, loading: isLive, error: null })
  const idsKey = consultantIds?.join(',') ?? ''
  useEffect(() => {
    if (!isLive) return
    let active = true
    setServer({ free: {}, loading: true, error: null })
    const selected = getConsultants().filter(c => !idsKey || idsKey.split(',').includes(c.id))
    Promise.all(selected.flatMap(c => dates.map(async d => {
      const formats = schedules[c.id]?.formats ?? []
      const slots = (await Promise.all(formats.map(f => repo.availableSlots(c.id, d, f)))).flat()
      return [`${c.id}:${d}`, new Set(slots.map(s => s.startIso)).size] as const
    }))).then(entries => { if (active) setServer({ free: Object.fromEntries(entries), loading: false, error: null }) }).catch(error => { if (active) setServer({ free: {}, loading: false, error }) })
    return () => { active = false }
  }, [dates, schedules, idsKey, bookings])

  const rows = useMemo(
    () =>
      getConsultants(consultantOverrides)
        .filter(c => !consultantIds || consultantIds.includes(c.id))
        .filter(c => !isLive || schedules[c.id])
        .map(c => {
          const rules = isLive ? schedules[c.id] : getRules(c.id, overrides)
          const tz = branchById(c.branchId).timeZone
          const mine = Object.values(bookings).filter(b => b.consultantId === c.id && isBlocking(b, now()))
          const cells = dates.map(d => dayState(c, rules, d, mine.filter(b => dateInZone(b.startIso, tz) === d).length, server.free[`${c.id}:${d}`]))
          const weeklyOff = ([0, 1, 2, 3, 4, 5, 6] as const).filter(w => rules.weekly[w].length === 0)
          const inWindow = (d: string) => d >= dates[0] && d <= dates[dates.length - 1]
          const leaveDates = dates.filter(d => rules.leave.some(lv => d >= lv.from && d <= lv.to))
          return {
            c,
            cells,
            weeklyOff,
            holidays: rules.holidays.filter(inWindow),
            leave: ranges(leaveDates),
            unavailable: rules.unavailable.filter(inWindow),
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, overrides, consultantOverrides, dates, consultantIds, schedules, server.free],
  )

  const cellLabel = (s: DayState) =>
    s.kind === 'open'
      ? s.free === 0 ? t('staff.calendar.full') : t('staff.calendar.free', { n: s.free })
      : t(`staff.calendar.${s.kind}`)
  const sep = lang === 'ar' ? '، ' : ', '
  const range = ([a, b]: [string, string]) => (a === b ? formatDate(a, lang, 'short') : `${formatDate(a, lang, 'short')} – ${formatDate(b, lang, 'short')}`)
  if (isLive && (server.loading || server.error)) return <DataStatus loading={server.loading} error={server.error} />

  return (
    <div className="grid gap-6">
      <section aria-labelledby="unavail-title" className="rounded-3xl bg-white p-4 ring-1 ring-line sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="unavail-title" className="text-lg font-semibold text-ink">{t('staff.calendar.unavailableTitle')}</h2>
            <p className="text-sm text-muted">{t('staff.calendar.intro', { n: DAYS })}</p>
          </div>
          <DemoBadge />
        </div>

        <div className="mb-3 flex flex-wrap gap-2 text-xs font-semibold" aria-label={t('staff.calendar.legend')}>
          {(['open', 'off', 'holiday', 'leave', 'unavailable'] as const).map(k => (
            <span key={k} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${tone[k]}`}>
              <span className="size-2 rounded-full bg-current" aria-hidden />
              {k === 'open' ? t('staff.calendar.available') : t(`staff.calendar.${k}`)}
            </span>
          ))}
        </div>

        <div className="overflow-x-auto rounded-2xl ring-1 ring-line">
          <table className="w-full min-w-[920px] border-collapse text-xs">
            <thead>
              <tr className="bg-paper">
                <th scope="col" className="sticky start-0 z-10 min-w-48 bg-paper px-3 py-2.5 text-start text-sm font-semibold text-ink">{t('common.consultant')}</th>
                {dates.map(d => (
                  <th key={d} scope="col" className={`px-1 py-2 text-center font-semibold ${d === today ? 'text-ink' : 'text-muted'}`}>
                    <span className="block">{formatDate(d, lang, 'weekday')}</span>
                    <span dir="ltr" className={`mt-0.5 inline-flex size-7 items-center justify-center rounded-full font-display text-sm ${d === today ? 'bg-slate text-white' : 'text-ink'}`}>
                      {Number(d.slice(8))}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.c.id} className="border-t border-line">
                  <th scope="row" className="sticky start-0 z-10 bg-white px-3 py-2 text-start font-normal">
                    <div className="flex items-center gap-2.5">
                      <Avatar consultant={r.c} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{l(r.c.name)}</p>
                        <p className="truncate text-xs text-muted">{l(branchById(r.c.branchId).name)}</p>
                      </div>
                    </div>
                  </th>
                  {r.cells.map((s, i) => (
                    <td key={dates[i]} className="p-1">
                      <div
                        className={`flex min-h-12 flex-col items-center justify-center rounded-lg px-1 text-center leading-tight ${tone[s.kind]}`}
                        title={`${formatDate(dates[i], lang)}: ${cellLabel(s)}`}
                      >
                        <span className="font-semibold">{cellLabel(s)}</span>
                        {s.kind === 'open' && s.booked > 0 && <span className="text-[11px] opacity-80">{t('staff.calendar.booked', { n: s.booked })}</span>}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label={t('staff.calendar.summaryTitle')} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(r => {
          const items = [
            { label: t('staff.calendar.daysOff'), value: r.weeklyOff.map(w => t(`staff.admin.days.${w}`)).join(sep) || t('common.none') },
            { label: t('staff.calendar.leave'), value: r.leave.map(range).join(sep) || t('common.none'), warn: r.leave.length > 0 },
            { label: t('staff.calendar.holiday'), value: r.holidays.map(h => formatDate(h, lang, 'short')).join(sep) || t('common.none'), warn: r.holidays.length > 0 },
            { label: t('staff.calendar.unavailable'), value: r.unavailable.map(h => formatDate(h, lang, 'short')).join(sep) || t('common.none'), warn: r.unavailable.length > 0 },
          ]
          return (
            <article key={r.c.id} aria-label={l(r.c.name)} className="rounded-2xl bg-white p-4 ring-1 ring-line">
              <div className="mb-3 flex items-center gap-3">
                <Avatar consultant={r.c} size="sm" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{l(r.c.name)}</p>
                  <p className="truncate text-xs text-muted">{r.c.title ? l(r.c.title) : ''}</p>
                </div>
              </div>
              <dl className="grid gap-2 text-sm">
                {items.map(it => (
                  <div key={it.label} className="flex items-start justify-between gap-3">
                    <dt className="text-muted">{it.label}</dt>
                    <dd className={`text-end font-semibold ${it.warn ? 'text-bad' : 'text-slate'}`}>{it.value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          )
        })}
      </section>
    </div>
  )
}
