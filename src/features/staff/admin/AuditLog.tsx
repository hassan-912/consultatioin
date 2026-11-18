import { useState } from 'react'
import { useStaffAudit } from '../../../data/hooks'
import { useT } from '../../../i18n'
import { formatInZone } from '../../../domain/time'
import type { AuditEntry } from '../../../domain/types'
import { consultants } from '../../../config/consultants'
import { getConsultant } from '../../../store/actions'
import { Icon } from '../../../components/Icon'
import { ScreenTitle } from '../StaffApp'
import { Empty } from '../common'

const statusKeys = new Set(['reserved', 'on-hold', 'confirmed', 'checked-in', 'completed', 'no-show', 'expired', 'rejected', 'wrong-amount', 'duplicate', 'late-transfer', 'cancelled'])
const SHOWN = 6

/** One card per person: a staff member by name, each client by their booking, and the automatic system. */
export interface AuditGroup { key: string; entries: AuditEntry[] }
export function groupAudit(audit: AuditEntry[]): AuditGroup[] {
  const groups = new Map<string, AuditEntry[]>()
  for (const e of audit) {
    const key = e.actorName ? `staff:${e.actorName}` : e.actor === 'customer' ? `customer:${e.bookingRef ?? ''}` : `role:${e.actor}`
    groups.set(key, [...(groups.get(key) ?? []), e])
  }
  return [...groups].map(([key, entries]) => ({ key, entries: entries.sort((a, b) => b.at - a.at) }))
    .sort((a, b) => b.entries[0].at - a.entries[0].at)
}

function PersonCard({ group }: { group: AuditGroup }) {
  const { t, l, lang } = useT()
  const [all, setAll] = useState(false)
  const first = group.entries[0]
  const isClient = group.key.startsWith('customer:')
  const isSystem = first.actor === 'system' && !first.actorName
  const name = first.actorName ?? (isClient ? t('staff.admin.auditClient') : isSystem ? t('staff.admin.auditSystem') : t(`staff.roles.${first.actor as 'admin'}`))
  const role = isClient ? (first.bookingRef ?? '') : isSystem ? '' : t(`staff.roles.${first.actor as 'admin'}`)
  const status = (v?: string) => (v && statusKeys.has(v) ? t(`status.${v as 'confirmed'}`) : v)
  const action = (a: string) => {
    const key = `audit.${a}` as 'audit.created'
    const label = t(key)
    return label === key ? a.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()) : label
  }
  // What the action touched: a booking, a consultant, or what the note names.
  const affected = (e: AuditEntry) => {
    if (e.bookingRef) return e.bookingRef
    if (e.action === 'booking-deleted') return e.note
    if (e.to && consultants.some(c => c.id === e.to)) return l(getConsultant(e.to).name)
    return undefined
  }
  const change = (e: AuditEntry) => {
    if (e.action === 'signin') return undefined
    if (e.action === 'consultant-edited') return e.note
    if (e.action === 'booking-deleted') return status(e.from)
    if (e.to && consultants.some(c => c.id === e.to)) return undefined
    return [status(e.from), status(e.to)].filter(Boolean).join(' → ') || undefined
  }
  const entries = all ? group.entries : group.entries.slice(0, SHOWN)
  return (
    <article className="rounded-2xl bg-white ring-1 ring-line">
      <header className="flex items-center gap-3 border-b border-line p-4">
        <span aria-hidden className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${isClient ? 'bg-paper text-slate' : isSystem ? 'bg-mist-soft text-muted' : 'bg-navy text-white'}`}>
          {isSystem ? <Icon name="settings" size={17} /> : isClient ? <Icon name="user" size={17} /> : name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h2 dir="auto" className="truncate text-start text-base font-semibold text-ink">{name}</h2>
          <p className="text-xs text-muted">
            {role && <span className="me-2 rounded-full bg-gold-soft px-2 py-0.5 font-semibold text-gold-deep"><bdi>{role}</bdi></span>}
            {group.entries.length === 1 ? t('staff.admin.auditCountOne') : t('staff.admin.auditCount', { count: group.entries.length })} · {t('staff.admin.auditLast', { time: formatInZone(first.at, 'Africa/Cairo', lang, 'full') })}
          </p>
        </div>
      </header>
      <ol className="divide-y divide-line">
        {entries.map((e, i) => {
          const what = affected(e)
          const diff = change(e)
          return (
            <li key={i} className="grid gap-1 px-4 py-3 sm:grid-cols-[1fr_auto] sm:gap-4">
              <div className="min-w-0">
                <p className="font-semibold text-ink">{action(e.action)}</p>
                <dl className="mt-1 grid gap-0.5 text-sm">
                  {what && <div className="flex gap-1.5"><dt className="text-muted">{t('staff.admin.auditAffected')}:</dt><dd dir="auto" className="font-semibold text-slate">{what}</dd></div>}
                  {diff && <div className="flex gap-1.5"><dt className="text-muted">{t('staff.admin.auditChange')}:</dt><dd dir="auto" className="text-slate">{diff}</dd></div>}
                  {e.note && e.action !== 'consultant-edited' && e.action !== 'booking-deleted' && (
                    <div className="flex gap-1.5"><dt className="text-muted">{t('staff.admin.reason')}:</dt><dd dir="auto" className="text-slate">{e.note}</dd></div>
                  )}
                </dl>
              </div>
              <time className="text-xs text-muted sm:text-end" dateTime={new Date(e.at).toISOString()}>{formatInZone(e.at, 'Africa/Cairo', lang, 'full')}</time>
            </li>
          )
        })}
      </ol>
      {group.entries.length > SHOWN && (
        <button type="button" onClick={() => setAll(v => !v)} className="min-h-11 w-full border-t border-line text-sm font-semibold text-navy hover:bg-paper">
          {all ? t('staff.admin.auditLess') : t('staff.admin.auditMore', { count: group.entries.length })}
        </button>
      )}
    </article>
  )
}

/** Admin: who did what, one card per person, newest activity first. Each line says what was affected and how it changed. */
export function AuditLog() {
  const { t } = useT()
  const groups = groupAudit(useStaffAudit())
  return (
    <>
      <ScreenTitle title={t('staff.screens.audit')} />
      {groups.length ? <div className="grid gap-4 lg:grid-cols-2">{groups.map(g => <PersonCard key={g.key} group={g} />)}</div>
        : <Empty>{t('staff.admin.auditEmpty')}</Empty>}
    </>
  )
}
