import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useT } from '../../../i18n'
import { useStaffBookings, useStaffRecords } from '../../../data/hooks'
import { useAppStore } from '../../../store/useAppStore'
import { getConsultant } from '../../../store/actions'
import { branchById } from '../../../config/branches'
import { programName } from '../../../config/programs'
import { formatInZone } from '../../../domain/time'
import { formatMoney } from '../../../domain/pricing'
import type { Booking } from '../../../domain/types'
import { Button, Ltr, StatusChip } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { AssessmentReport, AssessmentRing, useAssessmentResult } from '../../../assessment/StaffAssessment'
import { Empty, SwapNote } from '../common'
import { RecordFields } from './ConsultantDesk'
import { NextStepPanel } from './NextStepPanel'
import { useRecordDraft } from './recordDraft'

/** One client's full file for the consultant: details, appointment, assessment, notes, and the PDF. Staff only. */
export function ClientFile() {
  const { t } = useT()
  const { id = '' } = useParams()
  const role = useAppStore(s => s.role)
  const own = useAppStore(s => s.staffSession?.consultantId ?? null)
  const b = useStaffBookings()[id] as Booking | undefined
  const records = useStaffRecords()
  // A consultant only opens their own clients; admin can open anyone's.
  if (!b || (role === 'consultant' && b.consultantId !== own)) {
    return <><BackLink /><Empty>{t('staff.client.notFound')}</Empty></>
  }
  return <ClientFileBody key={b.id} b={b} record={records[b.id]} />
}

function BackLink() {
  const { t } = useT()
  return (
    <Link to="/staff" className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-navy hover:underline">
      <Icon name="arrow" size={15} className="rotate-180 rtl:rotate-0" />{t('staff.client.back')}
    </Link>
  )
}

function ClientFileBody({ b, record }: { b: Booking; record?: Parameters<typeof useRecordDraft>[1] }) {
  const { t, l, lang } = useT()
  const draft = useRecordDraft(b, record)
  const result = useAssessmentResult(b.id)
  const c = getConsultant(b.consultantId)
  const branch = branchById(b.branchId)

  return (
    <>
      <BackLink />
      <header className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl bg-white p-5 ring-1 ring-line">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={b.status} />
            <Ltr className="font-display text-sm font-semibold tracking-wider text-muted">{b.reference}</Ltr>
          </div>
          <h1 dir="auto" className="mt-2 text-2xl font-semibold text-ink">{b.customer.name}</h1>
          <p className="mt-1 text-sm text-muted">
            <Ltr>{formatInZone(b.startIso, b.tz, lang, 'full')}</Ltr> · {b.format === 'online' ? t('format.online') : l(branch.name)}
          </p>
        </div>
        <AssessmentRing bookingId={b.id} size={84} />
        <Button disabled={draft.busy} onClick={() => void draft.pdf()} className="w-full sm:w-auto">
          <Icon name="download" size={16} />{t('staff.client.download')}
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('staff.client.details')}>
          <Facts rows={[
            [t('staff.client.name'), <span dir="auto">{b.customer.name}</span>],
            [t('staff.client.phone'), <a href={`tel:${b.customer.phone}`} className="text-navy hover:underline"><Ltr>{b.customer.phone}</Ltr></a>],
            [t('staff.client.email'), b.customer.email ? <a href={`mailto:${b.customer.email}`} className="break-all text-navy hover:underline"><Ltr>{b.customer.email}</Ltr></a> : '—'],
            [t('booking.program'), b.customer.program ? l(programName(b.customer.program)) : '—'],
            [t('staff.booking.language'), b.customer.consultationLang === 'ar' ? 'العربية' : 'English'],
            [t('staff.client.contactBy'), t(b.customer.channel === 'email' ? 'booking.channelEmail' : 'booking.channelWhatsapp')],
            ...(b.salesName ? [[t('staff.client.sales'), b.salesName] as [string, ReactNode]] : []),
          ]} />
          <SwapNote b={b} className="mt-3" />
          {b.customer.note && (
            <p dir="auto" className="mt-3 rounded-lg bg-paper px-3 py-2 text-sm text-slate"><span className="text-muted">{t('staff.booking.customerNote')}:</span> {b.customer.note}</p>
          )}
        </Section>

        <Section title={t('staff.client.appointment')}>
          <Facts rows={[
            [t('common.reference'), <Ltr>{b.reference}</Ltr>],
            [t('staff.client.consultant'), l(c.name)],
            [t('staff.client.when'), <Ltr>{formatInZone(b.startIso, b.tz, lang, 'full')}</Ltr>],
            [t('staff.client.format'), b.format === 'online' ? t('format.online') : `${t('format.in-person')} · ${l(branch.name)}`],
            [t('staff.client.length'), t('common.minutes', { n: b.durationMin })],
            [t('staff.client.price'), <Ltr>{formatMoney(b.price, lang)}</Ltr>],
          ]} />
        </Section>
      </div>

      <Section title={t('assessment.staffTitle')} className="mt-4">
        {result ? <AssessmentReport r={result} /> : <p className="text-sm text-muted">{t('staff.client.noAssessment')}</p>}
      </Section>

      <Section title={t('staff.consultant.notes')} className="mt-4">
        <RecordFields draft={draft}><NextStepPanel b={b} record={record} /></RecordFields>
      </Section>
    </>
  )
}

function Section({ title, className = '', children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={`rounded-2xl bg-white p-5 ring-1 ring-line ${className}`}>
      <h2 className="mb-3 text-lg font-semibold text-ink">{title}</h2>
      {children}
    </section>
  )
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-2.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[minmax(0,9rem)_1fr] gap-3 border-b border-line/60 pb-2 last:border-0 last:pb-0">
          <dt className="text-muted">{label}</dt>
          <dd className="min-w-0 font-semibold text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
