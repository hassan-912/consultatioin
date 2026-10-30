import type { PaymentConfig } from '../domain/types'

// One shared configuration for every branch. Real values are pending decisions.
export const paymentConfig: PaymentConfig = {
  methods: [
    {
      id: 'instapay',
      label: { en: 'InstaPay', ar: 'إنستاباي' },
      recipient: '[Recipient name – pending]',
      detail: '[InstaPay link – pending]',
      detailLabel: { en: 'Payment link', ar: 'رابط الدفع' },
      placeholder: true,
    },
    {
      id: 'vodafone-cash',
      label: { en: 'Vodafone Cash', ar: 'فودافون كاش' },
      recipient: '[Recipient name – pending]',
      detail: '[Wallet number – pending]',
      detailLabel: { en: 'Wallet number', ar: 'رقم المحفظة' },
      placeholder: true,
    },
  ],
  instructions: [
    { en: 'Transfer the exact amount shown — no more, no less.', ar: 'حوّل المبلغ المطلوب بالضبط — لا أكثر ولا أقل.' },
    { en: 'Write your booking reference in the transfer note if your app allows it.', ar: 'اكتب رقم الحجز في ملاحظة التحويل إن أمكن.' },
    { en: 'Copy the transaction reference from your app and paste it below.', ar: 'انسخ رقم العملية من التطبيق والصقه بالأسفل.' },
    { en: 'Finance will verify the transfer. A screenshot alone does not confirm a booking.', ar: 'سيراجع قسم المالية التحويل. صورة الإيصال وحدها لا تؤكد الحجز.' },
  ],
}
