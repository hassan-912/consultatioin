import { useMemo, useState, type ReactNode } from 'react'
import { useStaffBookings } from '../../../data/hooks'
import { useT } from '../../../i18n'
import { todayIn } from '../../../store/useAppStore'
import { dateInZone } from '../../../domain/time'
import { normalizeDigits } from '../../../domain/phone'
import type { BookingStatus } from '../../../domain/types'
import { Button, Notice, StatusChip } from '../../../components/ui'
import { TextField } from '../../../components/fields'
import { Icon } from '../../../components/Icon'
import { ScreenTitle } from '../StaffApp'
import { Empty } from '../common'
import { applyFilters, FILTER_KEYS, filterValue, matches, NOT_CUSTOMERS, sortRows, toRow, type CustomerRow, type FilterKey, type Filters, type SortKey } from './customerRows'
import { ColumnFilter, type FilterOption } from './ColumnFilter'

const COLUMN: Record<FilterKey, 'when' | 'place' | 'consultant' | 'sales' | 'status' | 'payment' | 'reference'> = {
  day: 'when', place: 'place', consultant: 'consultant', sales: 'sales', status: 'status', payment: 'payment', reference: 'reference',
}

/**
 * Reception and finance: every customer as a spreadsheet, today's or all of them, with contact details, consultant
 * and sales person. Search finds any cell; every column except the customer's own details has an Excel-style filter.
 * Sortable, and downloadable as an Excel file of exactly what is on screen.
 */
export function CustomerSheet() {
  const { t, l, lang } = useT()
  const bookings = useStaffBookings()
  const [view, setView] = useState<'today' | 'all'>('today')
  const [filters, setFilters] = useState<Filters>({})
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportFailed, setExportFailed] = useState(false)

  const customers = useMemo(() => Object.values(bookings).filter(b => !NOT_CUSTOMERS.includes(b.status)), [bookings])
  const today = useMemo(() => customers.filter(b => dateInZone(b.startIso, b.tz) === todayIn(b.tz)), [customers])
  const source = view === 'today' ? today : customers
  const query = normalizeDigits(q).trim().toLocaleLowerCase()
  const statusLabel = (s: BookingStatus) => t(`status.${s}`)
  const searched = source.map(b => toRow(b, l, lang, t('format.onlineShort'))).filter(r => matches(r, query, statusLabel))
  const rows = sortRows(applyFilters(searched, filters), sort?.key ?? 'when', sort?.dir ?? (view === 'today' ? 1 : -1), statusLabel)
  const activeFilters = FILTER_KEYS.filter(k => filters[k])
  // Like Excel: each column offers the values left after the search and the other columns' filters.
  const optionsFor = (key: FilterKey): FilterOption[] => {
    const counts = new Map<string, { label: string; count: number; sortBy: string }>()
    for (const r of applyFilters(searched, filters, key)) {
      const value = filterValue(r, key)
      const label = key === 'status' ? statusLabel(r.status) : key === 'day' ? r.date
        : value || t(key === 'sales' ? 'staff.customers.filter.noSales' : 'staff.customers.filter.noPayment')
      const entry = counts.get(value) ?? { label, count: 0, sortBy: key === 'day' ? value : (value ? '0' : '1') + label.toLocaleLowerCase() }
      entry.count++
      counts.set(value, entry)
    }
    // Ticked values that no longer appear stay listed, so they can still be unticked.
    for (const v of filters[key] ?? []) if (!counts.has(v)) counts.set(v, { label: key === 'status' ? statusLabel(v as BookingStatus) : v || '—', count: 0, sortBy: v })
    return [...counts.entries()].sort((a, b) => a[1].sortBy.localeCompare(b[1].sortBy)).map(([value, e]) => ({ value, label: e.label, count: e.count }))
  }
  const setFilter = (key: FilterKey, next: string[] | undefined) => setFilters(f => ({ ...f, [key]: next }))
  const columnName = (key: FilterKey) => t(`staff.customers.cols.${COLUMN[key]}`)
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

      <div className="mb-4">
        <TextField label={t('common.search')} hint={t('staff.customers.searchHint')} value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {activeFilters.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-muted">{t('staff.customers.filter.activeList')}:</span>
          {activeFilters.map(k => (
            <button key={k} type="button" onClick={() => setFilter(k, undefined)}
              aria-label={t('staff.customers.filter.remove', { column: columnName(k) })}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-slate px-3 text-sm font-semibold text-white hover:bg-ink">
              <Icon name="filter" size={13} />{columnName(k)} <span className="rounded-full bg-white/15 px-1.5 text-xs tabular-nums">{filters[k]!.length}</span>
              <Icon name="x" size={13} />
            </button>
          ))}
          <button type="button" onClick={() => setFilters({})} className="min-h-9 px-2 text-sm font-semibold text-slate underline-offset-4 hover:underline">
            {t('staff.customers.filter.clearAll')}
          </button>
        </div>
      )}

      {exportFailed && <div className="mb-4"><Notice tone="bad">{t('staff.customers.exportFailed')}</Notice></div>}

      {source.length ? (
        // The header stays even when nothing matches, so the filters that hid everything can be changed back.
        <Sheet rows={rows} sort={sort ?? { key: 'when', dir: view === 'today' ? 1 : -1 }} onSort={toggle} empty={t('staff.customers.empty')}
          filter={key => <ColumnFilter column={columnName(key)} options={optionsFor(key)} selected={filters[key]} onChange={next => setFilter(key, next)} />} />
      ) : (
        <Empty>{view === 'today' ? t('staff.customers.emptyToday') : t('staff.customers.empty')}</Empty>
      )}
      {rows.length > 0 && <p className="mt-3 text-xs text-muted">{t('staff.customers.showing', { n: rows.length })}</p>}
    </>
  )
}

function Sheet({ rows, sort, onSort, filter, empty }: {
  rows: CustomerRow[]; sort: { key: SortKey; dir: 1 | -1 }; onSort: (k: SortKey) => void; filter: (key: FilterKey) => ReactNode; empty: string
}) {
  const { t } = useT()
  const head = (label: ReactNode, key?: SortKey, className = '', filterKey?: FilterKey) => {
    const active = key && sort.key === key
    return (
      <th scope="col" aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
        className={`border-b border-e border-line bg-paper px-3 py-2.5 text-start text-xs font-semibold whitespace-nowrap text-slate ${className}`}>
        <span className="flex items-center justify-between gap-1">
          {key ? (
            <button type="button" onClick={() => onSort(key)} className="inline-flex min-h-8 items-center gap-1 hover:text-ink">
              {label}<span aria-hidden className={active ? 'text-gold-deep' : 'text-mist'}>{active ? (sort.dir === 1 ? '▲' : '▼') : '↕'}</span>
            </button>
          ) : <span className="inline-flex min-h-8 items-center">{label}</span>}
          {filterKey && filter(filterKey)}
        </span>
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
            {head(t('staff.customers.cols.when'), 'when', '', 'day')}
            {head(t('staff.customers.cols.place'), undefined, '', 'place')}
            {head(t('staff.customers.cols.consultant'), 'consultant', '', 'consultant')}
            {head(t('staff.customers.cols.sales'), 'sales', '', 'sales')}
            {head(t('staff.customers.cols.status'), 'status', '', 'status')}
            {head(t('staff.customers.cols.payment'), undefined, '', 'payment')}
            {head(t('staff.customers.cols.reference'), undefined, '', 'reference')}
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
          {!rows.length && (
            <tr><td colSpan={11} className="px-4 py-10 text-start text-sm text-muted">{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
