import type { Booking, Lang } from '../../../domain/types'
import { translate } from '../../../i18n'
import { getConsultant } from '../../../store/actions'
import { branchById } from '../../../config/branches'
import { contact } from '../../../config/contact'
import { formatInZone, zoneLabel } from '../../../domain/time'

/** The booking-confirmed WhatsApp message finance sends, in the customer's chosen language. */
export function buildConfirmationMessage(b: Booking, lang: Lang, sender: string, manageLink: string): string {
  const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate(lang, k, v)
  const consultant = getConsultant(b.consultantId)
  const branch = branchById(b.branchId)
  const where =
    b.format === 'in-person'
      ? t('staff.finance.wa.address', { branch: branch.name[lang], address: branch.address[lang] })
      : t('staff.finance.wa.online')
  const lines = [
    t('staff.finance.wa.greeting', { name: b.customer.name }),
    t('staff.finance.wa.from', { sender: sender.trim() }),
    t('staff.finance.wa.confirmed'),
    '',
    `${t('common.reference')}: ${b.reference}`,
    `${t('common.consultant')}: ${consultant.name[lang]}`,
    `${t('common.date')}: ${formatInZone(b.startIso, b.tz, lang, 'date')}`,
    `${t('common.time')}: ${formatInZone(b.startIso, b.tz, lang, 'time')} (${zoneLabel(b.tz, lang, Date.parse(b.startIso))})`,
    `${t('common.duration')}: ${t('common.minutes', { n: b.durationMin })}`,
    `${t('common.format')}: ${t(`format.${b.format}`)}`,
    where,
    '',
    t(b.format === 'in-person' ? 'staff.finance.wa.ticketInPerson' : 'staff.finance.wa.ticketOnline'),
    `${t('staff.finance.wa.manage')}: ${manageLink}`,
    '',
    t('ticket.lateNote'),
    '',
    t('staff.finance.wa.help', { hotline: contact.hotline }),
    t('staff.finance.wa.thanks'),
  ]
  return lines.join('\n')
}

export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(text)}`
}
