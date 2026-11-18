import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { repo } from '../../../data'
import { rememberAdminTestKey } from '../../../data/adminTest'
import { errorKey } from '../../../data/feedback'
import { loadConsultantProfiles, refreshPublicMetadata, usePublicMetadata } from '../../../data/hooks'
import { useT } from '../../../i18n'
import { useAppStore } from '../../../store/useAppStore'
import { getConsultant, getConsultants } from '../../../store/actions'
import type { Consultant } from '../../../domain/types'
import { branchById } from '../../../config/branches'
import { Avatar } from '../../../components/widgets'
import { consultantPhoto } from '../../team/photos'
import { Button } from '../../../components/ui'
import { TextArea } from '../../../components/fields'
import { Icon } from '../../../components/Icon'
import { ScreenTitle } from '../StaffApp'

const MAX_MEDIA = 50 * 1024 * 1024

/** A photo or video as shown in the editor: its address, plus the picked file until Save uploads it. */
interface Media { url: string | null; file?: File }

/** Photo or video: a preview, a file picker (uploaded only on Save, so Cancel leaves nothing behind), and a way back. */
function MediaPicker({ kind, value, original, disabled, onChange }: {
  kind: 'photo' | 'video'; value: Media; original: string | null; disabled: boolean; onChange: (m: Media) => void
}) {
  const { t } = useT()
  const [error, setError] = useState<string | null>(null)
  const pick = (file?: File) => {
    if (!file) return
    if (file.size > MAX_MEDIA) { setError(t('staff.admin.fileTooBig')); return }
    setError(null)
    onChange({ url: URL.createObjectURL(file), file })
  }
  return (
    <div className="grid content-start gap-2">
      <p className="text-sm font-semibold text-ink">{t(kind === 'photo' ? 'staff.admin.photo' : 'staff.admin.video')}</p>
      <div className="grid aspect-video place-items-center overflow-hidden rounded-xl bg-paper ring-1 ring-line">
        {!value.url ? <span className="text-sm text-muted">{kind === 'photo' ? t('placeholder.photo') : t('staff.admin.noVideo')}</span>
          : kind === 'photo' ? <img src={value.url} alt="" className="size-full object-contain" />
          : <video src={value.url} controls playsInline preload="metadata" className="size-full object-contain" />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-navy px-4 text-sm font-semibold text-white hover:brightness-110 ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
          <Icon name={kind === 'photo' ? 'user' : 'video'} size={15} />
          {t(kind === 'photo' ? 'staff.admin.changePhoto' : 'staff.admin.changeVideo')}
          <input type="file" className="sr-only" disabled={disabled}
            accept={kind === 'photo' ? 'image/jpeg,image/png,image/webp' : 'video/mp4,video/webm,video/quicktime'}
            onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        {value.url !== original && (
          <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange({ url: original })}>{t('staff.admin.useOriginal')}</Button>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-bad">{error}</p>}
    </div>
  )
}

/** Admin: a consultant's bio, photo and intro video. Only values that differ from the built-in profile are stored. */
function Editor({ c, onDone }: { c: Consultant; onDone: () => void }) {
  const { t } = useT()
  const base = getConsultant(c.id, {})
  const [bioEn, setBioEn] = useState(c.bio?.en ?? '')
  const [bioAr, setBioAr] = useState(c.bio?.ar ?? '')
  // The built-in photo is the team picture when the config has none, as on the public profile.
  const basePhoto = base.photo ?? consultantPhoto(c.id)
  const [photoMedia, setPhoto] = useState<Media>({ url: c.photo ?? consultantPhoto(c.id) })
  const [videoMedia, setVideo] = useState<Media>({ url: c.videoUrl ?? null })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const upload = (m: Media) => m.file ? repo.uploadConsultantMedia(c.id, m.file) : Promise.resolve(m.url)
  const save = async () => {
    setBusy(true); setError(null)
    const bio = { en: bioEn.trim(), ar: bioAr.trim() }
    const sameBio = bio.en === (base.bio?.en ?? '') && bio.ar === (base.bio?.ar ?? '')
    try {
      // Files go up only now, so a cancelled edit never leaves files in storage.
      const [photo, video] = await Promise.all([upload(photoMedia), upload(videoMedia)])
      // Storing only the differences means "Use the original" really goes back to the built-in profile.
      await repo.saveConsultantProfile(c.id, {
        bio: sameBio || (!bio.en && !bio.ar) ? null : bio,
        photo: photo === basePhoto ? null : photo,
        videoUrl: video === (base.videoUrl ?? null) ? null : video,
        videoPoster: null,
      })
      await loadConsultantProfiles()
      onDone()
    } catch (e) { setError(e) } finally { setBusy(false) }
  }
  return (
    <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
      <TextArea label={t('staff.admin.bioEn')} dir="ltr" rows={6} value={bioEn} onChange={e => setBioEn(e.target.value)} />
      <TextArea label={t('staff.admin.bioAr')} dir="rtl" rows={6} value={bioAr} onChange={e => setBioAr(e.target.value)} />
      <MediaPicker kind="photo" value={photoMedia} original={basePhoto} disabled={busy} onChange={setPhoto} />
      <MediaPicker kind="video" value={videoMedia} original={base.videoUrl ?? null} disabled={busy} onChange={setVideo} />
      <p className="text-xs text-muted sm:col-span-2">{t('staff.admin.mediaHint')}</p>
      {error != null && <p role="alert" className="text-sm text-bad sm:col-span-2">{t(errorKey(error))}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button onClick={() => void save()} disabled={busy}>{busy ? t('staff.admin.uploading') : t('common.save')}</Button>
        <Button variant="ghost" onClick={onDone} disabled={busy}>{t('common.cancel')}</Button>
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

/** Show or hide this consultant on the home page; they can still be booked by direct link. */
function ListedSwitch({ c, listed }: { c: Consultant; listed: boolean }) {
  const { t, l } = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const toggle = async () => {
    setBusy(true); setError(null)
    try { await repo.setConsultantListed(c.id, !listed); await refreshPublicMetadata() } catch (e) { setError(e) } finally { setBusy(false) }
  }
  return (
    <div className="grid justify-items-end gap-1">
      <Button size="sm" variant={listed ? 'ghost' : 'primary'} disabled={busy} onClick={() => void toggle()}
        aria-label={`${t(listed ? 'staff.admin.hideHome' : 'staff.admin.showHome')} ${l(c.name)}`}>
        <Icon name={listed ? 'eyeOff' : 'eye'} size={15} />{t(listed ? 'staff.admin.hideHome' : 'staff.admin.showHome')}
      </Button>
      {error != null && <span role="alert" className="text-xs text-bad">{t(errorKey(error))}</span>}
    </div>
  )
}

export function ConsultantsAdmin() {
  const { t, l } = useT()
  const overrides = useAppStore(s => s.consultantOverrides)
  const metadata = usePublicMetadata()
  const isListed = (c: Consultant) => !c.hidden && metadata?.find(m => m.consultantId === c.id)?.listed !== false
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <>
      <ScreenTitle title={t('staff.screens.consultants')} />
      <div className="grid gap-3">
        {getConsultants(overrides).map(c => (
          <div key={c.id} className="rounded-2xl bg-white p-4 ring-1 ring-line">
            <div className="flex items-center gap-4">
              <Avatar consultant={c} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                  {l(c.name)}
                  {c.paymentTest && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gold-soft px-2 py-0.5 text-xs font-semibold text-gold-deep">
                      <Icon name="shield" size={12} />
                      {t('staff.admin.adminTestBadge')}
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${isListed(c) ? 'bg-ok-soft text-ok' : 'bg-paper text-muted ring-1 ring-line'}`}>
                    <Icon name={isListed(c) ? 'eye' : 'eyeOff'} size={12} />
                    {t(isListed(c) ? 'staff.admin.onHome' : 'staff.admin.offHome')}
                  </span>
                  {c.nameNeedsConfirmation && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">
                      <Icon name="alert" size={12} />
                      {t('common.spellingToConfirm')}
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted">{c.title ? l(c.title) : t('placeholder.title')} — {l(branchById(c.branchId).name)}</p>
                <p className="mt-1 text-xs text-muted">
                  {[!c.bio && t('placeholder.bio'), !(c.photo ?? consultantPhoto(c.id)) && t('placeholder.photo'), !c.videoUrl && t('placeholder.video')].filter(Boolean).join(' / ')}
                </p>
              </div>
              {c.paymentTest && <TestBookingButton consultantId={c.id} />}
              <ListedSwitch c={c} listed={isListed(c)} />
              <Button variant="ghost" size="sm" aria-label={`${t('staff.admin.editProfile')} ${c.name.en}`} onClick={() => setEditing(editing === c.id ? null : c.id)}>
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
