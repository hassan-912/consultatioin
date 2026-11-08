import type { L10n, Lang } from '../domain/types'
import { translate } from '../i18n'

function financeDefault(lang: Lang): string {
  const t = (k: Parameters<typeof translate>[1], v?: Record<string, string>) => translate(lang, k, v)
  return [
    t('staff.finance.wa.greeting', { name: '{name}' }),
    t('staff.finance.wa.from', { sender: '{sender}' }),
    t('staff.finance.wa.confirmed'),
    '',
    `${t('common.reference')}: {reference}`,
    `${t('common.consultant')}: {consultant}`,
    `${t('common.date')}: {date}`,
    `${t('common.time')}: {time}`,
    `${t('common.duration')}: {duration}`,
    `${t('common.format')}: {format}`,
    '{place}',
    '',
    '{ticketHowTo}',
    `${t('staff.finance.wa.manage')}: {ticketLink}`,
    '',
    t('ticket.lateNote'),
    '',
    t('staff.finance.wa.help', { hotline: '{hotline}' }),
    t('staff.finance.wa.thanks'),
  ].join('\n')
}

/**
 * WhatsApp messages staff send to clients. The admin can rewrite each one (per language) in
 * Settings → Messages; a blank text falls back to the default below. Words in {braces} are filled in.
 */
export type MessageTemplateKey = 'follow_up' | 'finance_confirmation'
export type MessageTemplates = Partial<Record<MessageTemplateKey, Partial<Record<Lang, string>>>>

export interface TemplateSpec {
  key: MessageTemplateKey
  title: L10n
  description: L10n
  placeholders: { name: string; label: L10n }[]
  /** Computed on demand (the finance one reads the site's translations). */
  defaults: (lang: Lang) => string
}

export const templateSpecs: TemplateSpec[] = [
  {
    key: 'follow_up',
    title: { en: 'Consultant follow-up', ar: 'متابعة الاستشاري' },
    description: {
      en: 'Sent by the consultant on WhatsApp to a client who said they would think about it.',
      ar: 'يرسلها الاستشاري عبر واتساب للعميل الذي قال إنه سيفكر.',
    },
    placeholders: [
      { name: 'client', label: { en: 'Client name', ar: 'اسم العميل' } },
      { name: 'consultant', label: { en: 'Consultant name', ar: 'اسم الاستشاري' } },
      { name: 'program', label: { en: 'Recommended program', ar: 'البرنامج المقترح' } },
    ],
    defaults: lang => ({
      ar: 'أخبار حضرتك إيه؟ معاك {consultant} من شركة MG. كنت حابب أعرف: خدنا قرار ولا لأ؟',
      en: 'How are you? This is {consultant} from MG. I wanted to ask: have you made a decision?',
    })[lang],
  },
  {
    key: 'finance_confirmation',
    title: { en: 'Finance booking confirmation', ar: 'تأكيد الحجز من الحسابات' },
    description: {
      en: 'Sent by finance on WhatsApp once a booking is confirmed, with the ticket link.',
      ar: 'يرسلها قسم الحسابات عبر واتساب بعد تأكيد الحجز، ومعها رابط التذكرة.',
    },
    placeholders: [
      { name: 'name', label: { en: 'Client name', ar: 'اسم العميل' } },
      { name: 'sender', label: { en: 'Finance team member', ar: 'اسم موظف الحسابات' } },
      { name: 'reference', label: { en: 'Booking reference', ar: 'رقم الحجز' } },
      { name: 'consultant', label: { en: 'Consultant', ar: 'الاستشاري' } },
      { name: 'date', label: { en: 'Date', ar: 'التاريخ' } },
      { name: 'time', label: { en: 'Time (with time zone)', ar: 'الوقت (مع المنطقة الزمنية)' } },
      { name: 'duration', label: { en: 'Duration', ar: 'المدة' } },
      { name: 'format', label: { en: 'Online / in person', ar: 'أونلاين / في الفرع' } },
      { name: 'place', label: { en: 'Branch address or online note', ar: 'عنوان الفرع أو ملاحظة الأونلاين' } },
      { name: 'ticketHowTo', label: { en: 'How to use the ticket', ar: 'طريقة استخدام التذكرة' } },
      { name: 'ticketLink', label: { en: 'Ticket link', ar: 'رابط التذكرة' } },
      { name: 'hotline', label: { en: 'Hotline', ar: 'الخط الساخن' } },
    ],
    // Built from the site's own wording, so the default is exactly the message finance has always sent.
    defaults: financeDefault,
  },
]

export const templateSpec = (key: MessageTemplateKey) => templateSpecs.find(s => s.key === key)!

/** The admin's text for this language, or the default. */
export function templateText(templates: MessageTemplates | undefined, key: MessageTemplateKey, lang: Lang): string {
  const own = templates?.[key]?.[lang]
  return own && own.trim() ? own : templateSpec(key).defaults(lang)
}

/** Replaces {name}-style words; unknown words are left as written so a typo is visible in the preview. */
export function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (Object.hasOwn(vars, name) ? vars[name] : whole))
}

export const MAX_TEMPLATE_LENGTH = 2000
