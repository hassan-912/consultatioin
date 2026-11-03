import type { PaymentConfig } from '../domain/types'

// One shared configuration for every branch. Inside Egypt: InstaPay / Vodafone Cash. Outside Egypt: bank transfer.
export const paymentConfig: PaymentConfig = {
  methods: [
    {
      id: 'instapay',
      region: 'egypt',
      label: { en: 'InstaPay', ar: 'إنستاباي' },
      currency: 'EGP',
      link: 'https://ipn.eg/S/mostafa.elsayed912358/instapay/5kt4Qy',
      fields: [{ label: { en: 'InstaPay payment link', ar: 'رابط الدفع عبر إنستاباي' }, value: 'https://ipn.eg/S/mostafa.elsayed912358/instapay/5kt4Qy' }],
      placeholder: false,
    },
    {
      id: 'vodafone-cash',
      region: 'egypt',
      label: { en: 'Vodafone Cash', ar: 'فودافون كاش' },
      currency: 'EGP',
      fields: [{ label: { en: 'Wallet number', ar: 'رقم المحفظة' }, value: '01032935257' }],
      placeholder: false,
    },
    {
      id: 'bank-aed',
      region: 'international',
      label: { en: 'Bank transfer · AED', ar: 'تحويل بنكي · درهم' },
      currency: 'AED',
      fields: [
        { label: { en: 'Bank', ar: 'البنك' }, value: 'Mashreq Bank Dubai', mono: false },
        { label: { en: 'Account name', ar: 'اسم الحساب' }, value: 'MG I Portal', mono: false },
        { label: { en: 'Account number', ar: 'رقم الحساب' }, value: '019101981645' },
        { label: { en: 'IBAN', ar: 'IBAN' }, value: 'AE850330000019101981645' },
        { label: { en: 'Currency', ar: 'العملة' }, value: 'AED – UAE dirham', mono: false },
      ],
      placeholder: false,
    },
    {
      id: 'bank-usd-eur',
      region: 'international',
      label: { en: 'Bank transfer · USD / EUR', ar: 'تحويل بنكي · دولار / يورو' },
      currency: 'USD/EUR',
      fields: [
        { label: { en: 'Bank', ar: 'البنك' }, value: 'Banque du Caire', mono: false },
        { label: { en: 'Account name', ar: 'اسم الحساب' }, value: 'MG IMMIGRATION', mono: false },
        { label: { en: 'Account number', ar: 'رقم الحساب' }, value: '01946010001238' },
        { label: { en: 'IBAN', ar: 'IBAN' }, value: 'EG560004119400001946010001238' },
        { label: { en: 'SWIFT', ar: 'SWIFT' }, value: 'BCAIEGCXXXX' },
        { label: { en: 'Currency', ar: 'العملة' }, value: 'USD or EUR', mono: false },
      ],
      placeholder: false,
    },
  ],
  instructions: [
    { en: 'Transfer the exact amount shown — no more, no less.', ar: 'حوّل المبلغ المطلوب بالضبط — لا أكثر ولا أقل.' },
    { en: 'Write your booking reference in the transfer note if your app or bank allows it.', ar: 'اكتب رقم الحجز في ملاحظة التحويل إن أمكن في التطبيق أو البنك.' },
    { en: 'Copy the transaction reference from your app or bank and paste it below.', ar: 'انسخ رقم العملية من التطبيق أو البنك والصقه بالأسفل.' },
    { en: 'Finance will verify the transfer. A screenshot alone does not confirm a booking.', ar: 'سيراجع قسم المالية التحويل. صورة الإيصال وحدها لا تؤكد الحجز.' },
  ],
}

/** Default method for a customer: Egyptian numbers start with InstaPay, UAE numbers with the AED account. */
export function defaultPaymentMethod(phone: string): PaymentConfig['methods'][number]['id'] {
  if (phone.startsWith('+20')) return 'instapay'
  if (phone.startsWith('+971')) return 'bank-aed'
  return 'bank-usd-eur'
}
