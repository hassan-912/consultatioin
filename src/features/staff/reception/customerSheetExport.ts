import writeXlsxFile from 'write-excel-file/browser'
import type { BookingStatus, Lang } from '../../../domain/types'
import type { TKey } from '../../../i18n'
import type { CustomerRow } from './customerRows'

type Options = { lang: Lang; view: 'today' | 'all'; statusLabel: (s: BookingStatus) => string; t: (k: TKey) => string }

const HEADER = { fontWeight: 'bold', backgroundColor: '#1F2A37', color: '#FFFFFF', height: 22 } as const

/** Writes exactly the rows on screen to a real .xlsx file (loaded only when someone downloads). */
export async function downloadCustomerSheet(rows: CustomerRow[], { lang, view, statusLabel, t }: Options) {
  const columns: { key: TKey; width: number; value: (r: CustomerRow) => string | number }[] = [
    { key: 'staff.customers.cols.name', width: 26, value: r => r.name },
    { key: 'staff.customers.cols.phone', width: 18, value: r => r.phone },
    { key: 'staff.customers.cols.email', width: 30, value: r => r.email },
    { key: 'staff.customers.cols.date', width: 14, value: r => r.date },
    { key: 'staff.customers.cols.time', width: 10, value: r => r.time },
    { key: 'staff.customers.cols.place', width: 16, value: r => r.place },
    { key: 'staff.customers.cols.consultant', width: 22, value: r => r.consultant },
    { key: 'staff.customers.cols.sales', width: 22, value: r => r.sales },
    { key: 'staff.customers.cols.status', width: 16, value: r => statusLabel(r.status) },
    { key: 'staff.customers.cols.payment', width: 16, value: r => r.payment },
    { key: 'staff.customers.cols.amount', width: 12, value: r => r.amount },
    { key: 'staff.customers.cols.reference', width: 16, value: r => r.reference },
  ]
  const data = [
    [{ value: '#', ...HEADER }, ...columns.map(c => ({ value: t(c.key), ...HEADER }))],
    ...rows.map((r, i) => [
      { value: i + 1, type: Number },
      // Phone numbers stay text so Excel keeps the leading + and zeros.
      ...columns.map(c => {
        const v = c.value(r)
        return typeof v === 'number' ? { value: v, type: Number, format: '#,##0' } : { value: v, type: String }
      }),
    ]),
  ]
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' })
  await writeXlsxFile(data as never, {
    sheet: t(view === 'today' ? 'staff.customers.today' : 'staff.customers.all').slice(0, 31),
    columns: [{ width: 6 }, ...columns.map(c => ({ width: c.width }))],
    stickyRowsCount: 1,
    rightToLeft: lang === 'ar',
  }).toFile(`customers-${view}-${day}.xlsx`)
}
