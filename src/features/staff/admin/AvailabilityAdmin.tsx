import { useState } from 'react'
import { useT } from '../../../i18n'
import { getConsultants } from '../../../store/actions'
import { useStaffSchedules, refreshPublicMetadata } from '../../../data/hooks'
import { repo } from '../../../data'
import { isLive } from '../../../data/mode'
import { DataStatus, reportActionError } from '../../../data/feedback'
import type { Format } from '../../../domain/types'
import { bookingConfig } from '../../../config/booking'
import { formatDate } from '../../../domain/time'
import { Button, DemoBadge, Notice } from '../../../components/ui'
import { SelectField, TextField } from '../../../components/fields'
import { ScreenTitle } from '../StaffApp'

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export function AvailabilityAdmin() {
  const { t, l, lang } = useT()
  const schedules = useStaffSchedules()
  const [id, setId] = useState('mohamed-gamal')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [saving, setSaving] = useState(false)
  const rules = schedules[id]
  const days = [0, 1, 2, 3, 4, 5, 6] as const

  if (!rules) return <DataStatus loading />
  const toggleFormat = async (f: Format) => {
    const next = rules.formats.includes(f) ? rules.formats.filter(x => x !== f) : [...rules.formats, f]
    if (!next.length) return
    setSaving(true)
    try { await repo.saveSchedule(id, { formats: next }); if (isLive) await refreshPublicMetadata() }
    finally { setSaving(false) }
  }

  return (
    <>
      <ScreenTitle title={t('staff.screens.availability')}><DemoBadge /></ScreenTitle>
      <div className="mb-5 max-w-xs">
        <SelectField label={t('common.consultant')} value={id} onChange={e => setId(e.target.value)}>
          {getConsultants().map(c => <option key={c.id} value={c.id}>{l(c.name)}</option>)}
        </SelectField>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-5 ring-1 ring-line">
          <h2 className="mb-3 font-semibold text-ink">{t('staff.admin.workingHours')}</h2>
          <ul className="grid gap-1.5 text-sm">
            {days.map(d => (
              <li key={d} className="flex justify-between border-b border-line/60 py-1.5 last:border-0">
                <span className="text-muted">{t(`staff.admin.days.${d}`)}</span>
                <span dir="ltr" className="font-semibold tabular">{rules.weekly[d].length ? rules.weekly[d].map(w => `${hhmm(w.start)}–${hhmm(w.end)}`).join(', ') : <span className="font-normal text-muted">{t('staff.admin.off')}</span>}</span>
              </li>
            ))}
          </ul>
          <h3 className="mt-4 mb-1 text-sm font-semibold text-ink">{t('staff.admin.breaks')}</h3>
          <p dir="ltr" className="text-start text-sm tabular rtl:text-end">{rules.breaks.map(b => `${hhmm(b.start)}–${hhmm(b.end)}`).join(', ')}</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted">{t('staff.admin.buffer')}</dt><dd className="font-semibold">{t('common.minutes', { n: bookingConfig.bufferMin })}</dd></div>
            <div><dt className="text-muted">{t('staff.admin.dailyLimit')}</dt><dd className="font-semibold">{rules.maxPerDay ?? '—'}</dd></div>
          </dl>
        </section>

        <section className="grid content-start gap-4 rounded-2xl bg-white p-5 ring-1 ring-line">
          <fieldset>
            <legend className="mb-2 font-semibold text-ink">{t('staff.admin.formats')}</legend>
            <div className="flex gap-2">
              {(['online', 'in-person'] as Format[]).map(f => (
                <label key={f} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold">
                  <input type="checkbox" className="size-4 accent-slate" disabled={saving} aria-busy={saving} checked={rules.formats.includes(f)} onChange={() => void toggleFormat(f).catch(reportActionError)} />
                  {t(`format.${f}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <h2 className="mb-2 font-semibold text-ink">{t('staff.admin.leave')}</h2>
            <ul className="mb-3 grid gap-1 text-sm">
              {rules.holidays.map(h => <li key={h} className="rounded-lg bg-paper px-3 py-1.5">{formatDate(h, lang)}</li>)}
              {rules.unavailable.map(h => <li key={h} className="rounded-lg bg-paper px-3 py-1.5">{formatDate(h, lang)}</li>)}
              {rules.leave.map((lv, i) => <li key={i} className="rounded-lg bg-warn-soft px-3 py-1.5 text-warn">{formatDate(lv.from, lang)} → {formatDate(lv.to, lang)}</li>)}
            </ul>
            <div className="grid grid-cols-2 gap-3">
              <TextField label={t('staff.admin.from')} type="date" value={from} onChange={e => setFrom(e.target.value)} />
              <TextField label={t('staff.admin.to')} type="date" value={to} min={from} onChange={e => setTo(e.target.value)} />
            </div>
            <Button
              className="mt-3"
              disabled={!from || !to || to < from}
              onClick={async () => {
                await repo.saveSchedule(id, { leave: [...rules.leave, { from, to }] })
                setFrom('')
                setTo('')
              }}
            >
              {t('staff.admin.addLeave')}
            </Button>
          </div>
          {!isLive && <Notice tone="info">{l({ en: 'Hours, breaks, buffers and limits are demo values pending company decisions.', ar: 'الساعات والراحات والفواصل والحدود قيم تجريبية بانتظار قرارات الشركة.' })}</Notice>}
        </section>
      </div>
    </>
  )
}
