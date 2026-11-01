// Fixed planning rates for the job seeker funds check. The public calculator fetches live rates; the staff
// view uses these so a booking's assessment never depends on a third-party service. Update when rates move.
export const assessmentConfig = {
  exchangeRates: {
    egpPerEur: 56,
    egpPerSek: 5.1,
    note: {
      en: 'Bank balance compared at fixed planning rates (1 EUR = 56 EGP, 1 SEK = 5.1 EGP). Confirm with current rates.',
      ar: 'تمت مقارنة الرصيد بأسعار صرف تقديرية ثابتة (1 يورو = 56 جنيه، 1 كرونة = 5.1 جنيه). تأكد بالأسعار الحالية.',
    },
  },
}
