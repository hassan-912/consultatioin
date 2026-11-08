import type { Booking, Lang } from '../../../domain/types'
import { translate } from '../../../i18n'
import { getConsultant } from '../../../store/actions'
import { branchById } from '../../../config/branches'
import { contact } from '../../../config/contact'
import { formatInZone, zoneLabel } from '../../../domain/time'
import { fillTemplate, templateText, type MessageTemplates } from '../../../config/messageTemplates'

/** The booking-confirmed WhatsApp message finance sends, in the customer's chosen language (admin-editable). */
export function buildConfirmationMessage(b: Booking, lang: Lang, sender: string, manageLink: string, templates?: MessageTemplates): string {
  const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate(lang, k, v)
  const consultant = getConsultant(b.consultantId)
  const branch = branchById(b.branchId)
  return fillTemplate(templateText(templates, 'finance_confirmation', lang), {
    name: b.customer.name,
    sender: sender.trim(),
    reference: b.reference,
    consultant: consultant.name[lang],
    date: formatInZone(b.startIso, b.tz, lang, 'date'),
    time: `${formatInZone(b.startIso, b.tz, lang, 'time')} (${zoneLabel(b.tz, lang, Date.parse(b.startIso))})`,
    duration: t('common.minutes', { n: b.durationMin }),
    format: t(`format.${b.format}`),
    place: b.format === 'in-person'
      ? t('staff.finance.wa.address', { branch: branch.name[lang], address: branch.address[lang] })
      : t('staff.finance.wa.online'),
    ticketHowTo: t(b.format === 'in-person' ? 'staff.finance.wa.ticketInPerson' : 'staff.finance.wa.ticketOnline'),
    ticketLink: manageLink,
    hotline: contact.hotline,
  })
}

export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(text)}`
}
