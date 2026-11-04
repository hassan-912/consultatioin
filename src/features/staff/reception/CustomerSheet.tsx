import { useMemo, useState, type ReactNode } from 'react'
import { useStaffBookings } from '../../../data/hooks'
import { useT } from '../../../i18n'
import { todayIn } from '../../../store/useAppStore'
import { dateInZone } from '../../../domain/time'
import { normalizeDigits } from '../../../domain/phone'
import type { BookingStatus } from '../../../domain/types'
import { Button, Notice, StatusChip } from '../../../components/ui'
import { SelectField, TextField } from '../../../components/fields'
import { Icon } from '../../../components/Icon'
import { ScreenTitle } from '../StaffApp'
import { Empty } from '../common'
import { matches, NOT_CUSTOMERS, sortRows, toRow, type CustomerRow, type SortKey } from './customerRows'

const STATUSES: BookingStatus[] = ['on-hold', 'confirmed', 'checked-in', 'completed', 'no-show', 'rejected', 'wrong-amount', 'duplicate', 'late-transfer', 'cancelled']

/**
 * Reception and finance: every customer as a spreadsheet, today's or all of them, with contact details, consultant
 * and sales person. Searchable, sortable, and downloadable as an Excel file of exactly what is on screen.
 */
export function CustomerSheet() {
  const { t, l, lang } = useT()
  const bookings = useStaffBookings()
  const [view, setView] = useState<'today' | 'all'>('today')
  const [status, setStatus] = useState<BookingStatus | 'all'>('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportFailed, setExportFailed] = useState(false)

  const customers = useMemo(() => Object.values(bookings).filter(b => !NOT_CUSTOMERS.includes(b.status)), [bookings])
  const today = useMemo(() => customers.filter(b => dateInZone(b.startIso, b.tz) === todayIn(b.tz)), [customers])
  const source = view === 'today' ? today : customers
  const query = normalizeDigits(q).trim().toLocaleLowerCase()
  const statusLabel = (s: BookingStatus) => t(`status.${s}`)
  const rows = sortRows(
    source.filter(b => status === 'all' || b.status === status).map(b => toRow(b, l, lang, t('format.onlineShort'))).filter(r => matches(r, query)),
    sort?.key ?? 'when', sort?.dir ?? (view === 'today' ? 1 : -1), statusLabel,
  )
  const count = (list: typeof source, ...s: BookingStatus[]) => list.filter(b => s.includes(b.status)).length

  const toggle = (key: SortKey) => setSort(cur => cur?.key === key ? { key, dir: cur.dir === 1 ? -1 : 1 } : { key, dir: 1 })
  const download = async () => {
    setExporting(true); setExportFailed(false)
    try {
      const { downloadCustomerSheet } = await import('./customerSheetExport')
      await downloadCustomerSheet(rows, { lang, view, statusLabel, t })
    } catch { setExportFailed(true) } finally { setExporting(false) }
  }

  const stats = [
    { label: t('staff.customers.stats.customers'), value: source.length, tone: 'text-ink' },
    { label: t('status.confirmed'), value: count(source, 'confirmed'), tone: 'text-slate' },
    { label: t('status.checked-in'), value: count(source, 'checked-in', 'completed'), tone: 'text-ok' },
    { label: t('staff.customers.stats.awaiting'), value: count(source, 'on-hold'), tone: 'text-warn' },
  ]

  return (
    <>
      <ScreenTitle title={t('staff.screens.customers')}>
        <Button onClick={() => void download()} disabled={exporting || !rows.length}>
          <Icon name="download" size={18} />{exporting ? t('staff.customers.exporting') : t('staff.customers.download')}
        </Button>
      </ScreenTitle>

      <div role="tablist" aria-label={t('staff.screens.customers')} className="mb-4 inline-flex rounded-2xl bg-white p-1 ring-1 ring-line">
        {(['today', 'all'] as const).map(v => (
          <button key={v} role="tab" type="button" aria-selected={view === v} onClick={() => { setView(v); setSort(null) }}
            className={`min-h-11 rounded-xl px-4 text-sm font-semibold transition ${view === v ? 'bg-slate text-white shadow-sm' : 'text-slate hover:text-ink'}`}>
            {t(`staff.customers.${v}`)} <span className={`ms-1 rounded-full px-2 py-0.5 text-xs ${view === v ? 'bg-white/15' : 'bg-paper'}`}>{v === 'today' ? today.length : customers.length}</span>
          </button>
        ))}
      </div>

      <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(s => (
          <div key={s.label} className="rounded-2xl bg-white px-4 py-3 ring-1 ring-line">
            <dt className="text-xs font-semibold text-muted">{s.label}</dt>
            <dd className={`mt-1 font-display text-2xl font-semibold ${s.tone}`}>{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_240px]">
        <TextField label={t('common.search')} hint={t('staff.customers.searchHint')} value={q} onChange={e => setQ(e.target.value)} />
        <SelectField label={t('staff.admin.filterStatus')} value={status} onChange={e => setStatus(e.target.value as BookingStatus | 'all')}>
          <option value="all">{t('common.all')}</option>
          {STATUSES.map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </SelectField>
      </div>

      {exportFailed && <div className="mb-4"><Notice tone="bad">{t('staff.customers.exportFailed')}</Notice></div>}

      {rows.length ? (
        <Sheet rows={rows} sort={sort ?? { key: 'when', dir: view === 'today' ? 1 : -1 }} onSort={toggle} />
      ) : (
        <Empty>{view === 'today' && !query && status === 'all' ? t('staff.customers.emptyToday') : t('staff.customers.empty')}</Empty>
      )}
      {rows.length > 0 && <p className="mt-3 text-xs text-muted">{t('staff.customers.showing', { n: rows.length })}</p>}
    </>
  )
}

function Sheet({ rows, sort, onSort }: { rows: CustomerRow[]; sort: { key: SortKey; dir: 1 | -1 }; onSort: (k: SortKey) => void }) {
  const { t } = useT()
  const head = (label: ReactNode, key?: SortKey, className = '') => {
    const active = key && sort.key === key
    return (
      <th scope="col" aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
        className={`border-b border-e border-line bg-paper px-3 py-2.5 text-start text-xs font-semibold whitespace-nowrap text-slate ${className}`}>
        {key ? (
          <button type="button" onClick={() => onSort(key)} className="inline-flex min-h-8 items-center gap-1 hover:text-ink">
            {label}<span aria-hidden className={active ? 'text-gold-deep' : 'text-mist'}>{active ? (sort.dir === 1 ? '▲' : '▼') : '↕'}</span>
          </button>
        ) : label}
      </th>
    )
  }
  const cell = 'border-b border-e border-line px-3 py-2 whitespace-nowrap'
  return (
    <div className="max-h-[70vh] overflow-auto rounded-2xl bg-white ring-1 ring-line">
      <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-20">
          <tr>
            {head(<span className="inline-block w-6">#</span>, undefined, 'sticky start-0 z-30 text-center')}
            {head(t('staff.customers.cols.name'), 'name', 'sticky start-12 z-30')}
            {head(t('staff.customers.cols.phone'))}
            {head(t('staff.customers.cols.email'))}
            {head(t('staff.customers.cols.when'), 'when')}
            {head(t('staff.customers.cols.place'))}
            {head(t('staff.customers.cols.consultant'), 'consultant')}
            {head(t('staff.customers.cols.sales'), 'sales')}
            {head(t('staff.customers.cols.status'), 'status')}
            {head(t('staff.customers.cols.payment'))}
            {head(t('staff.customers.cols.reference'))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="group">
              <td className={`${cell} sticky start-0 z-10 bg-paper text-center text-xs font-semibold text-muted tabular-nums`}><span className="inline-block w-6">{i + 1}</span></td>
              <th scope="row" dir="auto" className={`${cell} sticky start-12 z-10 bg-white text-start font-semibold text-ink group-odd:bg-white group-even:bg-[#fafaf7] group-hover:bg-gold-soft`}>{r.name}</th>
              <td className={`${cell} group-even:bg-[#fafaf7] group-hover:bg-gold-soft`}><a href={`tel:${r.phone}`} dir="ltr" className="text-slate tabular-nums hover:text-ink hover:underline">{r.phone}</a></td>
              <td className={`${cell} group-even:bg-[#fafaf7] group-hover:bg-gold-soft`}>{r.email ? <a href={`mailto:${r.email}`} dir="ltr" className="text-slate hover:text-ink hover:underline">{r.email}</a> : <span className="text-mist">—</span>}</td>
              <td className={`${cell} group-even:bg-[#fafaf7] group-hover:bg-gold-soft`}><span className="font-semibold text-ink tabular-nums">{r.time}</span> <span className="text-muted">· {r.date}</span></td>
              <td className={`${cell} text-slate group-even:bg-[#fafaf7] group-hover:bg-gold-soft`}>{r.place}</td>
              <td className={`${cell} text-ink group-even:bg-[#fafaf7] group-hover:bg-gold-soft`}>{r.consultant}</td>
              <td dir="auto" className={`${cell} group-even:bg-[#fafaf7] group-hover:bg-gold-soft`}>{r.sales ? <span className="inline-flex items-center gap-1.5 text-ink"><Icon name="user" size={14} className="text-gold-deep" />{r.sales}</span> : <span className="text-mist">—</span>}</td>
              <td className={`${cell} group-even:bg-[#fafaf7] group-hover:bg-gold-soft`}><StatusChip status={r.status} /></td>
              <td className={`${cell} text-slate group-even:bg-[#fafaf7] group-hover:bg-gold-soft`}>{r.payment || <span className="text-mist">—</span>}</td>
              <td className={`${cell} group-even:bg-[#fafaf7] group-hover:bg-gold-soft`}><bdi dir="ltr" className="font-display text-xs font-semibold tracking-wider text-slate">{r.reference}</bdi></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
