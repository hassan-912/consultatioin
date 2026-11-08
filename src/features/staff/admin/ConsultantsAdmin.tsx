import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { repo } from '../../../data'
import { rememberAdminTestKey } from '../../../data/adminTest'
import { errorKey } from '../../../data/feedback'
import { isLive } from '../../../data/mode'
import { useT } from '../../../i18n'
import { useAppStore } from '../../../store/useAppStore'
import { editConsultant, getConsultants } from '../../../store/actions'
import type { Consultant } from '../../../domain/types'
import { branchById } from '../../../config/branches'
import { Avatar } from '../../../components/widgets'
import { Button, Notice } from '../../../components/ui'
import { TextArea, TextField } from '../../../components/fields'
import { Icon } from '../../../components/Icon'
import { ScreenTitle } from '../StaffApp'

function Editor({ c, onDone }: { c: Consultant; onDone: () => void }) {
  const { t } = useT()
  const [f, setF] = useState({
    nameEn: c.name.en, nameAr: c.name.ar,
    titleEn: c.title?.en ?? '', titleAr: c.title?.ar ?? '',
    bioEn: c.bio?.en ?? '', bioAr: c.bio?.ar ?? '',
    photo: c.photo ?? '', video: c.videoUrl ?? '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(v => ({ ...v, [k]: e.target.value }))
  const save = () => {
    editConsultant(c.id, {
      name: { en: f.nameEn.trim(), ar: f.nameAr.trim() },
      title: f.titleEn || f.titleAr ? { en: f.titleEn.trim(), ar: f.titleAr.trim() } : null,
      bio: f.bioEn || f.bioAr ? { en: f.bioEn.trim(), ar: f.bioAr.trim() } : null,
      photo: f.photo.trim() || null,
      videoUrl: f.video.trim() || null,
      ...(f.nameEn !== c.name.en ? { nameNeedsConfirmation: false } : {}),
    })
    onDone()
  }
  return (
    <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
      <TextField label={t('staff.admin.nameEn')} dir="ltr" value={f.nameEn} onChange={set('nameEn')} />
      <TextField label={t('staff.admin.nameAr')} dir="rtl" value={f.nameAr} onChange={set('nameAr')} />
      <TextField label={t('staff.admin.titleEn')} dir="ltr" value={f.titleEn} onChange={set('titleEn')} />
      <TextField label={t('staff.admin.titleAr')} dir="rtl" value={f.titleAr} onChange={set('titleAr')} />
      <TextArea label={t('staff.admin.bioEn')} dir="ltr" value={f.bioEn} onChange={set('bioEn')} />
      <TextArea label={t('staff.admin.bioAr')} dir="rtl" value={f.bioAr} onChange={set('bioAr')} />
      <TextField label={t('staff.admin.photoUrl')} dir="ltr" value={f.photo} onChange={set('photo')} />
      <TextField label={t('staff.admin.videoUrl')} dir="ltr" value={f.video} onChange={set('video')} />
      <div className="flex gap-2 sm:col-span-2">
        <Button onClick={save}>{t('common.save')}</Button>
        <Button variant="ghost" onClick={onDone}>{t('common.cancel')}</Button>
      </div>
    </div>
  )
}

/** Admin-only consultants (the 5 EGP payment test): fetch this device's booking key, then open the booking page. */
function TestBookingButton({ consultantId }: { consultantId: string }) {
  const { t } = useT()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const open = async () => {
    setBusy(true); setError(null)
    try {
      rememberAdminTestKey(await repo.adminTestKey())
      navigate(`/book/${consultantId}`)
    } catch (e) { setError(e); setBusy(false) }
  }
  return (
    <div className="grid justify-items-end gap-1">
      <Button variant="gold" size="sm" onClick={open} disabled={busy}>
        <Icon name="card" size={15} />{t('staff.admin.bookTest')}
      </Button>
      {error != null && <span role="alert" className="text-xs text-bad">{t(errorKey(error))}</span>}
    </div>
  )
}

export function ConsultantsAdmin() {
  const { t, l } = useT()
  const overrides = useAppStore(s => s.consultantOverrides)
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <>
      <ScreenTitle title={t('staff.screens.consultants')} />
      {isLive && <Notice className="mb-4">{t('data.sourceManaged')}</Notice>}
      <div className="grid gap-3">
        {getConsultants(overrides).map(c => (
          <div key={c.id} className="rounded-2xl bg-white p-4 ring-1 ring-line">
            <div className="flex items-center gap-4">
              <Avatar consultant={c} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                  {l(c.name)}
                  {c.hidden && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gold-soft px-2 py-0.5 text-xs font-semibold text-gold-deep">
                      <Icon name="shield" size={12} />
                      {t('staff.admin.adminTestBadge')}
                    </span>
                  )}
                  {c.nameNeedsConfirmation && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">
                      <Icon name="alert" size={12} />
                      {t('common.spellingToConfirm')}
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted">{c.title ? l(c.title) : t('placeholder.title')} — {l(branchById(c.branchId).name)}</p>
                <p className="mt-1 text-xs text-muted">
                  {[!c.bio && t('placeholder.bio'), !c.photo && t('placeholder.photo'), !c.videoUrl && t('placeholder.video')].filter(Boolean).join(' / ')}
                </p>
              </div>
              {c.hidden && <TestBookingButton consultantId={c.id} />}
              <Button variant="ghost" size="sm" disabled={isLive} title={isLive ? t('data.sourceManaged') : undefined} aria-label={`${t('staff.admin.editProfile')} ${c.name.en}`} onClick={() => setEditing(editing === c.id ? null : c.id)}>
                <Icon name="settings" size={15} />
                <span className="hidden sm:inline">{t('staff.admin.editProfile')}</span>
              </Button>
            </div>
            {editing === c.id && <Editor c={c} onDone={() => setEditing(null)} />}
          </div>
        ))}
      </div>
    </>
  )
}
