import writeXlsxFile from 'write-excel-file/browser'
import type { BookingStatus, Lang } from '../../../domain/types'
import type { TKey } from '../../../i18n'
import type { HistoryRow } from './History'

type Options = { lang: Lang; t: (k: TKey) => string; statusLabel: (s: BookingStatus) => string; consultant: string; view: string }

const HEADER = { fontWeight: 'bold', backgroundColor: '#1F2A37', color: '#FFFFFF', height: 22 } as const

/** Exactly the consultations on screen, as a real .xlsx file (loaded only when someone downloads). */
export async function downloadHistory(rows: HistoryRow[], { lang, t, statusLabel, consultant, view }: Options) {
  const columns: { key: TKey; width: number; value: (r: HistoryRow) => string }[] = [
    { key: 'staff.history.cols.name', width: 26, value: r => r.name },
    { key: 'staff.history.cols.phone', width: 18, value: r => r.phone },
    { key: 'staff.history.cols.date', width: 14, value: r => r.date },
    { key: 'staff.history.cols.time', width: 10, value: r => r.time },
    { key: 'staff.history.cols.status', width: 18, value: r => statusLabel(r.status) },
    { key: 'staff.history.cols.nextStep', width: 22, value: r => r.nextStep },
    { key: 'staff.history.cols.program', width: 18, value: r => r.program },
    { key: 'staff.history.cols.reference', width: 16, value: r => r.reference },
  ]
  const data = [
    [{ value: '#', ...HEADER }, ...columns.map(c => ({ value: t(c.key), ...HEADER }))],
    // Everything as text, so Excel keeps phone numbers' leading + and zeros.
    ...rows.map((r, i) => [{ value: i + 1, type: Number }, ...columns.map(c => ({ value: c.value(r), type: String }))]),
  ]
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' })
  const safe = consultant.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
  await writeXlsxFile(data as never, {
    sheet: consultant.slice(0, 31),
    columns: [{ width: 6 }, ...columns.map(c => ({ width: c.width }))],
    stickyRowsCount: 1,
    rightToLeft: lang === 'ar',
  }).toFile(`consultations-${safe}-${view}-${day}.xlsx`)
}
