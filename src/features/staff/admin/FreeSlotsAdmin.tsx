import { useEffect, useMemo, useState } from 'react'
import { useT } from '../../../i18n'
import { repo } from '../../../data'
import { DataStatus } from '../../../data/feedback'
import type { FreeSlot } from '../../../data/types'
import { getConsultant, getConsultants } from '../../../store/actions'
import { todayIn } from '../../../store/useAppStore'
import { branchById } from '../../../config/branches'
import { dateInZone, formatDate, formatInZone } from '../../../domain/time'
import { Avatar } from '../../../components/widgets'
import { SelectField } from '../../../components/fields'
import { Icon } from '../../../components/Icon'
import { ScreenTitle } from '../StaffApp'
import { Empty } from '../common'

const DAYS = 14

/** Admin: every consultant's free times, date by date, for the next two weeks (online and in-person). */
export function FreeSlotsAdmin() {
  const { t, l, lang } = useT()
  const [who, setWho] = useState('all')
  const [slots, setSlots] = useState<FreeSlot[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  useEffect(() => {
    let active = true
    const load = () => repo.freeSlots(todayIn('Africa/Cairo'), DAYS).then(s => { if (active) { setSlots(s); setError(null) } }).catch(e => active && setError(e))
    void load()
    const timer = setInterval(() => void load(), 60000)
    return () => { active = false; clearInterval(timer) }
  }, [])

  // consultant → date → start → formats offered at that time
  const grouped = useMemo(() => {
    const out = new Map<string, Map<string, Map<string, Set<string>>>>()
    for (const s of slots ?? []) {
      const tz = branchById(getConsultant(s.consultantId).branchId).timeZone
      const day = dateInZone(s.startIso, tz)
      const byDay = out.get(s.consultantId) ?? new Map()
      const byStart = byDay.get(day) ?? new Map()
      byStart.set(s.startIso, (byStart.get(s.startIso) ?? new Set()).add(s.format))
      byDay.set(day, byStart); out.set(s.consultantId, byDay)
    }
    return out
  }, [slots])

  const consultants = getConsultants().filter(c => who === 'all' ? !c.hidden : c.id === who)

  return (
    <>
      <ScreenTitle title={t('staff.screens.freeSlots')}>
        <div className="w-64">
          <SelectField label={t('common.consultant')} value={who} onChange={e => setWho(e.target.value)}>
            <option value="all">{t('staff.freeSlots.all')}</option>
            {getConsultants().map(c => <option key={c.id} value={c.id}>{l(c.name)}</option>)}
          </SelectField>
        </div>
      </ScreenTitle>
      <p className="-mt-3 mb-5 text-sm text-muted">{t('staff.freeSlots.intro', { n: DAYS })}</p>
      {!slots ? <DataStatus loading={!error} error={error} /> : (
        <div className="grid gap-4">
          {consultants.map(c => {
            const days = grouped.get(c.id)
            const tz = branchById(c.branchId).timeZone
            const total = days ? [...days.values()].reduce((n, d) => n + d.size, 0) : 0
            return (
              <section key={c.id} aria-label={l(c.name)} className="rounded-2xl bg-white p-4 ring-1 ring-line">
                <div className="mb-3 flex items-center gap-3">
                  <Avatar consultant={c} size="sm" />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold text-ink">{l(c.name)}</h2>
                    <p className="text-xs text-muted">{l(branchById(c.branchId).name)}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${total ? 'bg-ok-soft text-ok' : 'bg-paper text-muted'}`}>{t('staff.freeSlots.count', { n: total })}</span>
                </div>
                {days && days.size ? (
                  <dl className="grid gap-2">
                    {[...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, starts]) => (
                      <div key={day} className="grid gap-1 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center">
                        <dt className="text-sm font-semibold text-slate">{formatDate(day, lang, 'short')}</dt>
                        <dd className="flex flex-wrap gap-1.5">
                          {[...starts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([start, formats]) => (
                            <span key={start} className="inline-flex items-center gap-1 rounded-lg bg-paper px-2 py-1 text-xs font-semibold text-slate ring-1 ring-line">
                              <span dir="ltr">{formatInZone(start, tz, lang, 'time')}</span>
                              {formats.has('online') && <Icon name="video" size={12} label={t('format.online')} />}
                              {formats.has('in-person') && <Icon name="building" size={12} label={t('format.in-person')} />}
                            </span>
                          ))}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : <Empty>{t('staff.freeSlots.none')}</Empty>}
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
