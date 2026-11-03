import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { isLive } from '../../../data/mode'
import { errorKey } from '../../../data/feedback'
import { useT } from '../../../i18n'
import { consultants } from '../../../config/consultants'
import { staffAccounts } from '../../../config/staffAccounts'
import { inviteStaff, listStaff, saveStaff, type StaffProfile } from '../../../store/staffAdmin'
import { validateInvite, staffRoles, type InviteField } from '../../../../supabase/functions/invite-staff/validate'
import type { StaffRole } from '../../../domain/types'
import { Button, Notice } from '../../../components/ui'
import { CopyField } from '../../../components/CopyField'
import { Icon } from '../../../components/Icon'
import { SelectField, TextField } from '../../../components/fields'
import { ScreenTitle } from '../StaffApp'

const fieldKeys = { email: 'staff.accounts.errEmail', displayName: 'staff.accounts.errName', role: 'staff.accounts.errName', consultantId: 'staff.accounts.errConsultant' } as const

function RoleFields({ role, consultantId, onRole, onConsultant, error }: {
  role: StaffRole; consultantId: string; onRole: (r: StaffRole) => void; onConsultant: (id: string) => void; error?: string
}) {
  const { t, l } = useT()
  return (
    <>
      <SelectField label={t('staff.accounts.role')} value={role} onChange={e => onRole(e.target.value as StaffRole)}>
        {staffRoles.map(r => <option key={r} value={r}>{t(`staff.roles.${r}`)}</option>)}
      </SelectField>
      {role === 'consultant' && (
        <SelectField label={t('staff.accounts.consultant')} value={consultantId} error={error} onChange={e => onConsultant(e.target.value)}>
          <option value="">{t('staff.accounts.chooseConsultant')}</option>
          {consultants.map(c => <option key={c.id} value={c.id}>{l(c.name)}</option>)}
        </SelectField>
      )}
    </>
  )
}

function InviteForm({ onInvited }: { onInvited: () => void }) {
  const { t } = useT()
  const [f, setF] = useState({ email: '', displayName: '', role: 'finance' as StaffRole, consultantId: '' })
  const [errors, setErrors] = useState<Partial<Record<InviteField, string>>>({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  const [link, setLink] = useState<{ email: string; name: string; url: string } | null>(null)
  const [failure, setFailure] = useState<unknown>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setDone(''); setFailure(null); setLink(null)
    const parsed = validateInvite({ ...f, consultantId: f.consultantId || null })
    if (!parsed.ok) { setErrors({ [parsed.field]: t(fieldKeys[parsed.field]) }); return }
    setErrors({})
    setBusy(true)
    try {
      const sent = await inviteStaff(parsed.value)
      if (sent.link) setLink({ email: parsed.value.email, name: parsed.value.displayName, url: sent.link })
      else setDone(parsed.value.email)
      setF({ email: '', displayName: '', role: f.role, consultantId: '' })
      onInvited()
    } catch (error) { setFailure(error) } finally { setBusy(false) }
  }
  const failureText = failure ? ((failure as { code?: string }).code === 'ALREADY_EXISTS' ? t('staff.accounts.errExists') : t(errorKey(failure))) : ''
  return (
    <form onSubmit={submit} noValidate className="mb-6 grid gap-4 rounded-2xl bg-white p-4 ring-1 ring-line sm:grid-cols-2 sm:p-5" aria-label={t('staff.accounts.inviteTitle')}>
      <h2 className="text-base font-semibold text-ink sm:col-span-2">{t('staff.accounts.inviteTitle')}</h2>
      {done && <Notice tone="ok" className="sm:col-span-2">{t('staff.accounts.invited', { email: done })}</Notice>}
      {failureText && <Notice tone="bad" className="sm:col-span-2">{failureText}</Notice>}
      {link && (
        <div className="grid gap-3 rounded-xl bg-warn-soft p-3.5 sm:col-span-2">
          <p className="text-sm font-semibold text-ink">{t('staff.accounts.linkInstead', { email: link.email })}</p>
          <CopyField label={t('staff.accounts.inviteLink')} value={link.url} />
          <a href={`https://wa.me/?text=${encodeURIComponent(t('staff.accounts.linkMessage', { name: link.name, link: link.url }))}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl bg-slate px-4 text-sm font-semibold text-white hover:brightness-110">
            <Icon name="phone" size={16} />{t('staff.accounts.shareWhatsapp')}
          </a>
          <p className="text-xs text-muted">{t('staff.accounts.linkHint')}</p>
        </div>
      )}
      <TextField label={t('staff.accounts.email')} dir="ltr" type="email" autoComplete="off" autoCapitalize="none" value={f.email} error={errors.email}
        onChange={e => setF(v => ({ ...v, email: e.target.value }))} />
      <TextField label={t('staff.accounts.displayName')} value={f.displayName} error={errors.displayName}
        onChange={e => setF(v => ({ ...v, displayName: e.target.value }))} />
      <RoleFields role={f.role} consultantId={f.consultantId} error={errors.consultantId}
        onRole={role => setF(v => ({ ...v, role }))} onConsultant={consultantId => setF(v => ({ ...v, consultantId }))} />
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy}>{busy ? t('staff.accounts.sending') : t('staff.accounts.invite')}</Button>
      </div>
    </form>
  )
}

function Row({ p, onChanged }: { p: StaffProfile; onChanged: () => void }) {
  const { t, l } = useT()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(p)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const consultant = consultants.find(c => c.id === p.consultantId)
  const run = async (next: StaffProfile) => {
    setBusy(true); setFailure(null)
    try { await saveStaff(next); setEditing(false); onChanged() } catch (error) { setFailure(error) } finally { setBusy(false) }
  }
  return (
    <li className="rounded-2xl bg-white p-4 ring-1 ring-line">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{p.displayName}</p>
          <p className="text-sm text-muted">
            {t(`staff.roles.${p.role}`)}{consultant ? ` · ${l(consultant.name)}` : ''}
            {' · '}<span className={p.active ? 'text-ok' : 'text-bad'}>{t(p.active ? 'staff.accounts.active' : 'staff.accounts.inactive')}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setDraft(p); setEditing(v => !v) }} aria-expanded={editing}>{t('staff.accounts.edit')}</Button>
          <Button variant={p.active ? 'danger' : 'ghost'} size="sm" disabled={busy} onClick={() => run({ ...p, active: !p.active })}>
            {t(p.active ? 'staff.accounts.deactivate' : 'staff.accounts.reactivate')}
          </Button>
        </div>
      </div>
      {failure != null && <Notice tone="bad" className="mt-3">{t(errorKey(failure))}</Notice>}
      {editing && (
        <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
          <TextField label={t('staff.accounts.displayName')} value={draft.displayName} onChange={e => setDraft(v => ({ ...v, displayName: e.target.value }))} />
          <RoleFields role={draft.role} consultantId={draft.consultantId ?? ''}
            onRole={role => setDraft(v => ({ ...v, role }))} onConsultant={id => setDraft(v => ({ ...v, consultantId: id || null }))} />
          <div className="sm:col-span-2">
            <Button disabled={busy || !draft.displayName.trim() || (draft.role === 'consultant' && !draft.consultantId)} onClick={() => run(draft)}>{t('staff.accounts.save')}</Button>
          </div>
        </div>
      )}
    </li>
  )
}

function LiveAccounts() {
  const { t } = useT()
  const [rows, setRows] = useState<StaffProfile[] | null>(null)
  const [failed, setFailed] = useState(false)
  const load = useCallback(() => {
    listStaff().then(r => { setRows(r); setFailed(false) }).catch(() => setFailed(true))
  }, [])
  useEffect(load, [load])
  return (
    <>
      <p className="mb-4 text-sm text-muted">{t('staff.accounts.intro')}</p>
      <InviteForm onInvited={load} />
      <h2 className="mb-3 text-base font-semibold text-ink">{t('staff.accounts.list')}</h2>
      {failed && <Notice tone="bad">{t('staff.accounts.loadError')}</Notice>}
      {rows && !rows.length && <p className="text-sm text-muted">{t('staff.accounts.empty')}</p>}
      <ul className="grid gap-3">{rows?.map(p => <Row key={p.userId} p={p} onChanged={load} />)}</ul>
    </>
  )
}

function DemoAccounts() {
  const { t, l } = useT()
  return (
    <>
      <Notice className="mb-4">{t('staff.accounts.protoNote')}</Notice>
      <ul className="grid gap-3">
        {staffAccounts.map(a => (
          <li key={a.username} className="rounded-2xl bg-white p-4 ring-1 ring-line">
            <p dir="ltr" className="text-start font-semibold text-ink rtl:text-end">{a.username}</p>
            <p className="text-sm text-muted">
              {t(`staff.roles.${a.role}`)}
              {a.consultantId ? ` · ${l(consultants.find(c => c.id === a.consultantId)?.name ?? { en: a.consultantId, ar: a.consultantId })}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </>
  )
}

export function StaffAccounts() {
  const { t } = useT()
  return (
    <>
      <ScreenTitle title={t('staff.screens.staffAccounts')} />
      {isLive ? <LiveAccounts /> : <DemoAccounts />}
    </>
  )
}
