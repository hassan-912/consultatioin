import type { L10n, PayCurrency, PaymentMethodId } from '../domain/types'

// Customers pay online through EasyKash (cards, mobile wallets, Meeza, Apple Pay) in any of these currencies.
// Prices are set in EGP; the server converts at the day's rate when the payment starts.
export const payCurrencies: PayCurrency[] = ['EGP', 'USD', 'EUR', 'AED']

/**
 * EasyKash's processing fee, paid by the customer on top of the price (the account passes it to the buyer):
 * 2.6% with a minimum of 6 EGP, matching EasyKash's charges (1,000 EGP -> 1,026; 5 EGP -> 11).
 */
export const easykashFeePercent = 2.6
export const easykashMinFeeEgp = 6

/** The fee on an amount in `currency`; `unitsPerEgp` converts the EGP minimum. Whole pounds for EGP, cents otherwise. */
export function easykashFee(amount: number, currency: PayCurrency, unitsPerEgp = 1): number {
  const fee = Math.max(amount * easykashFeePercent / 100, easykashMinFeeEgp * (currency === 'EGP' ? 1 : unitsPerEgp))
  return currency === 'EGP' ? Math.round(fee) : Math.round(fee * 100) / 100
}

/** What EasyKash offers at checkout (its payment option IDs 2, 4, 6, 31). */
export const easykashOptions: L10n[] = [
  { en: 'Credit & debit cards', ar: 'البطاقات الائتمانية والخصم' },
  { en: 'Mobile wallets', ar: 'المحافظ الإلكترونية' },
  { en: 'Meeza', ar: 'ميزة' },
  { en: 'Apple Pay', ar: 'Apple Pay' },
]

/** Labels for staff screens, including methods used before online payment. */
export const paymentMethodLabels: Record<PaymentMethodId, L10n> = {
  easykash: { en: 'Online (EasyKash)', ar: 'دفع إلكتروني (إيزي كاش)' },
  instapay: { en: 'InstaPay', ar: 'إنستاباي' },
  'vodafone-cash': { en: 'Vodafone Cash', ar: 'فودافون كاش' },
  'bank-aed': { en: 'Bank transfer · AED', ar: 'تحويل بنكي · درهم' },
  'bank-usd-eur': { en: 'Bank transfer · USD / EUR', ar: 'تحويل بنكي · دولار / يورو' },
}
export const methodLabel = (id?: string): L10n | undefined => paymentMethodLabels[id as PaymentMethodId]

/** Starting currency from the phone number: Egypt pays in EGP, the UAE in AED, everyone else in USD. */
export function defaultCurrency(phone: string): PayCurrency {
  if (phone.startsWith('+20')) return 'EGP'
  if (phone.startsWith('+971')) return 'AED'
  return 'USD'
}
