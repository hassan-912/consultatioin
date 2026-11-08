import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT, type TKey } from '../../../i18n'
import { useStaffBookings, useStaffRecords } from '../../../data/hooks'
import { reportActionError } from '../../../data/feedback'
import { useAppStore, todayIn } from '../../../store/useAppStore'
import { getConsultant, getConsultants } from '../../../store/actions'
import { programName } from '../../../config/programs'
import { branchById } from '../../../config/branches'
import { dateInZone, formatInZone } from '../../../domain/time'
import { normalizeDigits } from '../../../domain/phone'
import type { Booking, Lang } from '../../../domain/types'
import type { ConsultationRecord } from '../../../store/useAppStore'
import { Button, Ltr, StatusChip } from '../../../components/ui'
import { SelectField, TextField } from '../../../components/fields'
import { Icon } from '../../../components/Icon'
import { ScreenTitle } from '../StaffApp'
import { Empty, Tabs } from '../common'

type View = 'today' | 'upcoming' | 'past' | 'all'
const HIDDEN = ['reserved', 'expired', 'cancelled']
const UPCOMING = ['confirmed', 'on-hold', 'checked-in']
const PAST = ['completed', 'no-show']
const digits = (s: string) => normalizeDigits(s).replace(/\D/g, '')

export interface HistoryRow { id: string; name: string; phone: string; date: string; time: string; status: Booking['status']; nextStep: string; program: string; reference: string }

function toRow(b: Booking, r: ConsultationRecord | undefined, lang: Lang, t: (k: TKey) => string): HistoryRow {
  const program = r?.recommendedProgram ?? (b.customer.program || undefined)
  return {
    id: b.id, name: b.customer.name, phone: b.customer.phone,
    date: dateInZone(b.startIso, b.tz), time: formatInZone(b.startIso, b.tz, lang, 'time'),
    status: b.status, nextStep: r?.nextStep ? t(`staff.nextStep.${r.nextStep}`) : '', program: program ? programName(program)[lang] : '',
    reference: b.reference,
  }
}

/** A consultant's consultations (an admin picks whose): today, upcoming, past or all, with an Excel download. */
export function History() {
  const { t, lang } = useT()
  const role = useAppStore(s => s.role)
  const id = useAppStore(s => s.staffConsultantId)
  const setId = useAppStore(s => s.setStaffConsultantId)
  const bookings = useStaffBookings()
  const records = useStaffRecords()
  const [view, setView] = useState<View>('today')
  const [query, setQuery] = useState('')
  const [exporting, setExporting] = useState(false)
  const tz = branchById(getConsultant(id).branchId).timeZone
  const today = todayIn(tz)

  const mine = useMemo(() => Object.values(bookings).filter(b => b.consultantId === id && !HIDDEN.includes(b.status)), [bookings, id])
  const byView: Record<View, Booking[]> = {
    today: mine.filter(b => dateInZone(b.startIso, b.tz) === today),
    upcoming: mine.filter(b => UPCOMING.includes(b.status) && dateInZone(b.startIso, b.tz) >= today),
    past: mine.filter(b => PAST.includes(b.status) || dateInZone(b.startIso, b.tz) < today),
    all: mine,
  }
  const q = query.trim().toLowerCase()
  const qDigits = digits(query)
  const list = byView[view]
    .filter(b => !q || b.customer.name.toLowerCase().includes(q) || b.reference.toLowerCase().includes(q) || (qDigits.length >= 3 && digits(b.customer.phone).includes(qDigits)))
    .sort((a, b) => view === 'past' || view === 'all' ? b.startIso.localeCompare(a.startIso) : a.startIso.localeCompare(b.startIso))
  const rows = list.map(b => toRow(b, records[b.id], lang, t))

  const download = async () => {
    setExporting(true)
    try {
      const { downloadHistory } = await import('./historyExport')
      await downloadHistory(rows, { lang, t, statusLabel: s => t(`status.${s}`), consultant: getConsultant(id).name[lang], view })
    } catch (e) { reportActionError(e) } finally { setExporting(false) }
  }

  return (
    <>
      <ScreenTitle title={t('staff.screens.history')}>
        {role !== 'consultant' && (
          <div className="w-64">
            <SelectField label={t('staff.consultant.pickConsultant')} value={id} onChange={e => setId(e.target.value)}>
              {getConsultants().map(c => <option key={c.id} value={c.id}>{c.name[lang]}</option>)}
            </SelectField>
          </div>
        )}
      </ScreenTitle>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-md"><TextField label={t('staff.history.search')} type="search" value={query} onChange={e => setQuery(e.target.value)} /></div>
        <Button variant="ghost" disabled={exporting || rows.length === 0} onClick={() => void download()}>
          <Icon name="download" size={16} />{exporting ? t('staff.history.exporting') : t('staff.history.download')}
        </Button>
      </div>
      <Tabs value={view} onChange={setView} tabs={(['today', 'upcoming', 'past', 'all'] as const).map(v => ({ id: v, label: t(`staff.history.${v}`), count: byView[v].length }))} />
      {rows.length ? (
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-line">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-paper text-start text-xs uppercase tracking-wide text-muted">
              <tr>
                {(['name', 'phone', 'date', 'time', 'status', 'nextStep', 'program'] as const).map(c => <th key={c} scope="col" className="px-4 py-3 text-start font-semibold">{t(`staff.history.cols.${c}`)}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-paper">
                  <td className="px-4 py-3"><Link to={`/staff/client/${r.id}`} dir="auto" className="font-semibold text-ink hover:underline">{r.name}</Link></td>
                  <td className="px-4 py-3"><Ltr>{r.phone}</Ltr></td>
                  <td className="px-4 py-3"><Ltr>{r.date}</Ltr></td>
                  <td className="px-4 py-3"><Ltr>{r.time}</Ltr></td>
                  <td className="px-4 py-3"><StatusChip status={r.status} /></td>
                  <td className="px-4 py-3 text-slate">{r.nextStep || '—'}</td>
                  <td className="px-4 py-3 text-slate">{r.program || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty>{q ? t('staff.records.noMatch') : t('staff.history.empty')}</Empty>}
    </>
  )
}
