import { useEffect, useState } from 'react'
import { useT } from '../../../i18n'
import { repo } from '../../../data'
import { DataStatus, reportActionError } from '../../../data/feedback'
import type { DecisionInput, L10n, PendingDecision } from '../../../domain/types'
import { Button, ConfirmButton, Notice } from '../../../components/ui'
import { TextField } from '../../../components/fields'
import { Icon } from '../../../components/Icon'
import { ScreenTitle } from '../StaffApp'
import { Empty } from '../common'

const blank: DecisionInput = { area: { en: '', ar: '' }, question: { en: '', ar: '' }, owner: '' }
const areaKey = (a: L10n) => (a.en.trim() || a.ar.trim()).toLowerCase()

/** Admin: the open decisions, editable. Resolving one deletes it; the audit log keeps its wording. */
export function PendingDecisions() {
  const { t } = useT()
  const [items, setItems] = useState<PendingDecision[]>()
  const [error, setError] = useState<unknown>(null)
  const [editing, setEditing] = useState<string | 'new' | null>(null)

  const load = () => repo.staffDecisions().then(d => { setItems(d); setError(null) }).catch(setError)
  useEffect(() => { void load() }, [])

  const save = async (d: DecisionInput) => {
    try { await repo.saveDecision(d); setEditing(null); await load() } catch (e) { reportActionError(e) }
  }
  const resolve = async (id: string) => {
    try { await repo.resolveDecision(id); await load() } catch (e) { reportActionError(e) }
  }

  const areas = [...new Map((items ?? []).filter(d => areaKey(d.area)).map(d => [areaKey(d.area), d.area])).values()]
  const groups = [...new Set((items ?? []).map(d => areaKey(d.area)))]

  return (
    <>
      <ScreenTitle title={t('staff.screens.decisions')}>
        {editing !== 'new' && <Button onClick={() => setEditing('new')}><Icon name="plus" size={16} />{t('staff.admin.decisionAdd')}</Button>}
      </ScreenTitle>
      <Notice tone="info" className="mb-6">{t('staff.admin.decisionsIntro')}</Notice>
      {editing === 'new' && (
        <div className="mb-6"><DecisionForm initial={blank} areas={areas} onSave={save} onCancel={() => setEditing(null)} /></div>
      )}
      {!items ? <DataStatus loading={!error} error={error} /> : !items.length ? <Empty>{t('staff.admin.decisionsNone')}</Empty> : (
        <div className="grid gap-6">
          {groups.map(g => {
            const list = items.filter(d => areaKey(d.area) === g)
            return (
              <section key={g || '-'}>
                <h2 className="mb-2 text-base font-semibold text-ink">{g ? <L text={list[0].area} /> : t('staff.admin.decisionsOther')}</h2>
                <ul className="grid gap-2">
                  {list.map(d => editing === d.id ? (
                    <li key={d.id}><DecisionForm initial={d} areas={areas} onSave={save} onCancel={() => setEditing(null)} /></li>
                  ) : (
                    <li key={d.id} aria-label={d.question.en || d.question.ar} className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-line sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate"><L text={d.question} /></p>
                        <p className="mt-1 text-xs text-muted">{t('staff.admin.owner')}: <span dir="auto" className="font-semibold text-slate">{d.owner || t('staff.admin.ownerUnassigned')}</span></p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(d.id)}>{t('staff.admin.decisionEdit')}</Button>
                        <ConfirmButton size="sm" variant="primary" label={t('staff.admin.decisionResolve')} confirmText={t('staff.admin.decisionResolveConfirm')} onConfirm={() => resolve(d.id)}>
                          <Icon name="check" size={15} />{t('staff.admin.decisionResolve')}
                        </ConfirmButton>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}

/** Shows the viewer's language, or the other one when it was left blank. */
function L({ text }: { text: L10n }) {
  const { lang } = useT()
  const other = lang === 'ar' ? 'en' : 'ar'
  const value = text[lang].trim() || text[other]
  return <span dir="auto">{value}</span>
}

function DecisionForm({ initial, areas, onSave, onCancel }: { initial: DecisionInput; areas: L10n[]; onSave: (d: DecisionInput) => Promise<void>; onCancel: () => void }) {
  const { t } = useT()
  const [d, setD] = useState<DecisionInput>(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()
  const set = (p: Partial<DecisionInput>) => { setD(x => ({ ...x, ...p })); setErr(undefined) }
  // Picking a known English area fills in its Arabic name, and the other way round.
  const setArea = (lang: 'en' | 'ar', value: string) => {
    const known = areas.find(a => a[lang].trim().toLowerCase() === value.trim().toLowerCase())
    set({ area: known ? { ...known } : { ...d.area, [lang]: value } })
  }
  const submit = async () => {
    if (!d.question.en.trim() && !d.question.ar.trim()) { setErr(t('staff.admin.decisionQuestionRequired')); return }
    setBusy(true)
    try { await onSave(d) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={e => { e.preventDefault(); void submit() }} className="grid gap-3 rounded-2xl bg-white p-4 ring-2 ring-gold">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={t('staff.admin.decisionQuestionEn')} dir="ltr" value={d.question.en} maxLength={500} hint={t('staff.admin.decisionQuestionHint')} error={err}
          onChange={e => set({ question: { ...d.question, en: e.target.value } })} />
        <TextField label={t('staff.admin.decisionQuestionAr')} dir="rtl" value={d.question.ar} maxLength={500}
          onChange={e => set({ question: { ...d.question, ar: e.target.value } })} />
        <TextField label={t('staff.admin.decisionAreaEn')} dir="ltr" value={d.area.en} maxLength={80} list="decision-areas-en"
          onChange={e => setArea('en', e.target.value)} />
        <TextField label={t('staff.admin.decisionAreaAr')} dir="rtl" value={d.area.ar} maxLength={80} list="decision-areas-ar"
          onChange={e => setArea('ar', e.target.value)} />
        <TextField label={t('staff.admin.owner')} dir="auto" value={d.owner} maxLength={80} hint={t('staff.admin.decisionOwnerHint')}
          onChange={e => set({ owner: e.target.value })} />
      </div>
      <datalist id="decision-areas-en">{areas.filter(a => a.en).map(a => <option key={a.en} value={a.en} />)}</datalist>
      <datalist id="decision-areas-ar">{areas.filter(a => a.ar).map(a => <option key={a.ar} value={a.ar} />)}</datalist>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}><Icon name="check" size={16} />{t('staff.admin.decisionSave')}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </form>
  )
}
