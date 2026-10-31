// Pure builder for the customer ticket email. No I/O; every user-supplied value is HTML-escaped.
export type TicketEmailInput = {
  lang: 'ar' | 'en'
  name: string
  reference: string
  startsAt: string // ISO instant
  tz: string
  format: 'in-person' | 'online'
  manageUrl: string
}
export type BuiltEmail = { subject: string; html: string; text: string }

const HOTLINE = '17621'
const SUPPORT_EMAIL = 'Info@mg-visa.com'

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Fixed origin from SITE_URL + hash-router ticket path. Returns null for an unusable site URL or token. */
export function manageLink(siteUrl: string, token: string): string | null {
  let url: URL
  try { url = new URL(siteUrl) } catch { return null }
  const localhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localhost)) return null
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(token)) return null
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}/#/ticket/${token}`
}

const copy = {
  en: {
    subject: (ref: string) => `Your MG consultation is confirmed (${ref})`,
    greeting: (n: string) => `Hello ${n},`,
    confirmed: 'Your payment was verified and your consultation with MG International is confirmed.',
    reference: 'Reference', date: 'Date', time: 'Time', format: 'Format',
    formats: { 'in-person': 'In person at an MG branch', online: 'Online (Zoom or Google Meet; MG will share the details)' },
    ticket: 'Open your booking ticket (QR code, reschedule and cancel):',
    manage: 'Open my ticket',
    pdf: 'On the ticket page choose "Download PDF" to save a copy.',
    help: `Questions? Call ${HOTLINE} or email ${SUPPORT_EMAIL}.`,
    thanks: 'Thank you for choosing MG International.',
  },
  ar: {
    subject: (ref: string) => `تم تأكيد استشارتك مع إم جي (${ref})`,
    greeting: (n: string) => `مرحبًا ${n}،`,
    confirmed: 'تم التحقق من الدفع وتأكيد استشارتك مع إم جي إنترناشيونال.',
    reference: 'رقم الحجز', date: 'التاريخ', time: 'الوقت', format: 'نوع الاستشارة',
    formats: { 'in-person': 'حضوريًا في أحد فروع إم جي', online: 'عبر الإنترنت (زووم أو جوجل ميت، وسيشاركك الفريق التفاصيل)' },
    ticket: 'افتح تذكرة الحجز (رمز QR وإعادة الجدولة والإلغاء):',
    manage: 'افتح تذكرتي',
    pdf: 'من صفحة التذكرة اختر «تنزيل PDF» لحفظ نسخة.',
    help: `للاستفسار اتصل على ${HOTLINE} أو راسلنا على ${SUPPORT_EMAIL}.`,
    thanks: 'شكرًا لاختيارك إم جي إنترناشيونال.',
  },
} as const

function when(iso: string, tz: string, lang: 'ar' | 'en') {
  const d = new Date(iso)
  const locale = lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB'
  const zone = Intl.DateTimeFormat.supportedLocalesOf([locale]).length && isZone(tz) ? tz : 'UTC'
  return {
    date: new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: zone }).format(d),
    time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: zone, timeZoneName: 'short' }).format(d),
  }
}
function isZone(tz: string) { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false } }

export function buildTicketEmail(input: TicketEmailInput): BuiltEmail {
  const lang = input.lang === 'ar' ? 'ar' : 'en'
  const c = copy[lang]
  const { date, time } = when(input.startsAt, input.tz, lang)
  const format = c.formats[input.format === 'online' ? 'online' : 'in-person']
  const rows: [string, string][] = [[c.reference, input.reference], [c.date, date], [c.time, time], [c.format, format]]
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  const align = lang === 'ar' ? 'right' : 'left'
  const e = escapeHtml
  const html = `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(c.subject(input.reference))}</title></head>
<body style="margin:0;background:#f5f4f0;font-family:Arial,Helvetica,sans-serif;color:#1a2330">
<div dir="${dir}" style="max-width:560px;margin:0 auto;padding:24px;text-align:${align}">
<div style="background:#ffffff;border-radius:12px;padding:24px">
<p style="margin:0 0 12px;font-size:16px">${e(c.greeting(input.name))}</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${e(c.confirmed)}</p>
<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">
${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#5b6573;width:34%;vertical-align:top">${e(k)}</td><td style="padding:6px 0;font-weight:bold"><span dir="auto">${e(v)}</span></td></tr>`).join('\n')}
</table>
<p style="margin:20px 0 10px;font-size:14px">${e(c.ticket)}</p>
<p style="margin:0 0 12px"><a href="${e(input.manageUrl)}" style="display:inline-block;background:#0e2a47;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">${e(c.manage)}</a></p>
<p style="margin:0 0 16px;font-size:12px;color:#5b6573;word-break:break-all"><span dir="ltr">${e(input.manageUrl)}</span></p>
<p style="margin:0 0 16px;font-size:13px">${e(c.pdf)}</p>
<p style="margin:0 0 4px;font-size:13px">${e(c.help)}</p>
<p style="margin:0;font-size:13px">${e(c.thanks)}</p>
</div></div></body></html>`
  const text = [
    c.greeting(input.name), '', c.confirmed, '',
    ...rows.map(([k, v]) => `${k}: ${v}`), '',
    c.ticket, input.manageUrl, '', c.pdf, '', c.help, c.thanks,
  ].join('\n')
  return { subject: c.subject(input.reference), html, text }
}
