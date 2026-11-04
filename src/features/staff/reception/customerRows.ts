import type { Booking, BookingStatus, Lang } from '../../../domain/types'
import { getConsultant } from '../../../store/actions'
import { branchById } from '../../../config/branches'
import { paymentConfig } from '../../../config/payments'
import { formatInZone } from '../../../domain/time'

/** Holds that were never paid are not customers; everything else is. */
export const NOT_CUSTOMERS: BookingStatus[] = ['reserved', 'expired']

export type SortKey = 'name' | 'when' | 'consultant' | 'sales' | 'status'

export interface CustomerRow {
  id: string
  reference: string
  name: string
  phone: string
  email: string
  startIso: string
  date: string
  time: string
  place: string
  consultant: string
  sales: string
  status: BookingStatus
  payment: string
  amount: number
}

type Localize = (v: { en: string; ar: string }) => string

export function toRow(b: Booking, l: Localize, lang: Lang, onlineLabel: string): CustomerRow {
  const method = paymentConfig.methods.find(m => m.id === b.payment?.method)
  return {
    id: b.id,
    reference: b.reference,
    name: b.customer.name,
    phone: b.customer.phone,
    email: b.customer.email,
    startIso: b.startIso,
    date: formatInZone(b.startIso, b.tz, lang, 'short'),
    time: formatInZone(b.startIso, b.tz, lang, 'time'),
    place: b.format === 'online' ? onlineLabel : l(branchById(b.branchId).name),
    consultant: l(getConsultant(b.consultantId).name),
    sales: b.salesName ?? '',
    status: b.status,
    payment: method ? l(method.label) : '',
    amount: b.price.amount,
  }
}

const text = (s: string) => s.toLocaleLowerCase()

export function sortRows(rows: CustomerRow[], key: SortKey, dir: 1 | -1, statusLabel: (s: BookingStatus) => string): CustomerRow[] {
  const value = (r: CustomerRow) =>
    key === 'when' ? r.startIso : key === 'status' ? statusLabel(r.status) : text(key === 'name' ? r.name : key === 'consultant' ? r.consultant : r.sales)
  return [...rows].sort((a, b) => {
    const x = value(a), y = value(b)
    // Empty cells (no sales person) always sink to the bottom.
    if (!x !== !y) return x ? -1 : 1
    return (x < y ? -1 : x > y ? 1 : a.startIso.localeCompare(b.startIso)) * dir
  })
}

export function matches(r: CustomerRow, query: string): boolean {
  if (!query) return true
  const digits = query.replace(/\D/g, '')
  return [r.name, r.email, r.reference].some(v => text(v).includes(query))
    || (digits.length >= 3 && r.phone.replace(/\D/g, '').includes(digits))
}
