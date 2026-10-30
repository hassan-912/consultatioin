import { bookingConfig } from '../config/booking'
import type { Format, Lang } from './types'

export function priceFor(format: Format, durationMin: number): { amount: number; currency: 'EGP' } {
  const amount = bookingConfig.prices[format][durationMin]
  if (amount === undefined) throw new Error(`No price for ${format} ${durationMin} min`)
  return { amount, currency: bookingConfig.currency }
}

export function formatMoney(p: { amount: number; currency: string }, lang: Lang): string {
  const n = new Intl.NumberFormat('en-US').format(p.amount)
  return lang === 'ar' ? `${n} ج.م` : `${n} ${p.currency}`
}
