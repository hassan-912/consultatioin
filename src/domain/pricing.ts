import { bookingConfig } from '../config/booking'
import { consultants } from '../config/consultants'
import type { Format, Lang } from './types'

/** The price shown before booking; the server sets the booked price the same way (per consultant). */
export function priceFor(format: Format, durationMin: number, consultantId?: string): { amount: number; currency: 'EGP' } {
  const own = consultantId ? consultants.find(c => c.id === consultantId)?.price : undefined
  const amount = own ?? bookingConfig.prices[format][durationMin]
  if (amount === undefined) throw new Error(`No price for ${format} ${durationMin} min`)
  return { amount, currency: bookingConfig.currency }
}

export function formatMoney(p: { amount: number; currency: string }, lang: Lang): string {
  const n = new Intl.NumberFormat('en-US').format(p.amount)
  return lang === 'ar' ? `${n} ج.م` : `${n} ${p.currency}`
}
