import { useCallback, useEffect, useState } from 'react'
import { useT } from '../../../i18n'
import { repo } from '../../../data'
import { DataStatus, errorKey, reportActionError } from '../../../data/feedback'
import type { ReadinessRequest, ReadinessStatus, SalesPerson } from '../../../data/types'
import { defaultReadinessRules, ruleLimits, type ReadinessRules } from '../../../assessment/readiness'
import { useAppStore } from '../../../store/useAppStore'
import { getConsultant } from '../../../store/actions'
import { consultants } from '../../../config/consultants'
import { programName } from '../../../config/programs'
import { formatInZone } from '../../../domain/time'
import type { L10n } from '../../../domain/types'
import { Button, Ltr, Notice } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { whatsappLink } from '../finance/whatsappMessage'
import { ScreenTitle } from '../StaffApp'
import { Empty, Tabs } from '../common'

const destinations: Record<string, L10n> = {
  canada: { en: 'Canada', ar: 'كندا' }, australia: { en: 'Australia', ar: 'أستراليا' }, germany: { en: 'Germany', ar: 'ألمانيا' },
  austria: { en: 'Austria', ar: 'النمسا' }, sweden: { en: 'Sweden', ar: 'السويد' }, training: { en: 'Germany – vocational training', ar: 'ألمانيا – تدريب مهني' },
}

/** Admin: the numbers that decide who is "not ready". */
function RulesEditor() {
  const { t } = useT()
  const [rules, setRules] = useState<ReadinessRules | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  useEffect(() => { void repo.readinessRules().then(setRules) }, [])
  if (!rules) return null
  const set = (p: Partial<ReadinessRules>) => { setRules({ ...rules, ...p }); setNote(null) }
  const bad = (Object.keys(ruleLimits) as (keyof typeof ruleLimits)[]).some(k => !Number.isInteger(rules[k]) || rules[k] < ruleLimits[k][0] || rules[k] > ruleLimits[k][1])
  const save = async () => {
    setBusy(true); setNote(null)
    try { await repo.saveReadinessRules(rules); setNote({ tone: 'ok', text: t('staff.notReady.rulesSaved') }) }
    catch (e) { setNote({ tone: 'bad', text: t(errorKey(e)) }) } finally { setBusy(false) }
  }
  const num = (k: keyof typeof ruleLimits) => (
    <label className="grid gap-1 text-sm">
      <span className="font-semibold text-ink">{t(`staff.notReady.rule.${k}`)}</span>
      <input type="number" inputMode="numeric" min={ruleLimits[k][0]} max={ruleLimits[k][1]} value={Number.isFinite(rules[k]) ? rules[k] : ''}
        onChange={e => set({ [k]: e.target.value === '' ? NaN : Number(e.target.value) })}
        className="min-h-10 w-32 rounded-lg border border-line bg-white px-3 font-semibold text-ink" />
    </label>
  )
  const flag = (k: 'tourismNoBank' | 'tourismLowBank' | 'tourismOverstay' | 'jobSeekerFunds') => (
    <label className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
      <input type="checkbox" className="size-4 accent-slate" checked={rules[k]} onChange={e => set({ [k]: e.target.checked })} />
      {t(`staff.notReady.rule.${k}`)}
    </label>
  )
  return (
    <details className="mb-5 rounded-2xl bg-white p-4 ring-1 ring-line">
      <summary className="cursor-pointer font-semibold text-ink"><Icon name="settings" size={15} className="me-1 inline" />{t('staff.notReady.rulesTitle')}</summary>
      <p className="mt-2 text-sm text-muted">{t('staff.notReady.rulesHint')}</p>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <fieldset className="grid gap-3"><legend className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">{t('staff.notReady.tourism')}</legend>
          {num('tourismMinScore')}{flag('tourismNoBank')}{flag('tourismLowBank')}{flag('tourismOverstay')}
        </fieldset>
        <fieldset className="grid gap-3"><legend className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">{t('staff.notReady.immigration')}</legend>
          {num('australiaMinPoints')}{num('canadaMinCrs')}
        </fieldset>
        <fieldset className="grid gap-3"><legend className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">{t('staff.notReady.jobSeeking')}</legend>
          {flag('jobSeekerFunds')}{num('jobSeekerMaxIssues')}
        </fieldset>
      </div>
      {note && <Notice tone={note.tone} className="mt-4">{note.text}</Notice>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={busy || bad} onClick={() => void save()}><Icon name="check" size={16} />{t('staff.notReady.saveRules')}</Button>
        <Button variant="ghost" disabled={busy} onClick={() => set(defaultReadinessRules)}>{t('staff.notReady.resetRules')}</Button>
      </div>
    </details>
  )
}

/** Sales manager (and admin): clients who weren't ready, so they didn't pay. Call them, then mark it. */
export function NotReady() {
  const { t, l, lang } = useT()
  const isAdmin = useAppStore(s => s.staffSession?.role === 'admin')
  const [rows, setRows] = useState<ReadinessRequest[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [tab, setTab] = useState<ReadinessStatus>('open')
  const [busy, setBusy] = useState<string | null>(null)
  const [people, setPeople] = useState<SalesPerson[]>([])
  const load = useCallback(() => repo.readinessRequests().then(r => { setRows(r); setError(null) }).catch(setError), [])
  useEffect(() => { void repo.readinessSalesPeople().then(setPeople).catch(() => undefined) }, [])
  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 30000)
    return () => clearInterval(timer)
  }, [load])
  const mark = async (id: string, status: ReadinessStatus) => {
    setBusy(id)
    try { await repo.setReadinessStatus(id, status); await load() } catch (e) { reportActionError(e) } finally { setBusy(null) }
  }
  const assign = async (id: string, person: string) => {
    setBusy(id)
    try { await repo.assignReadinessRequest(id, person || null); await load() } catch (e) { reportActionError(e) } finally { setBusy(null) }
  }
  const when = (ms: number) => formatInZone(ms, 'Africa/Cairo', lang, 'full')
  const list = rows?.filter(r => r.status === tab) ?? []
  const count = (s: ReadinessStatus) => rows?.filter(r => r.status === s).length ?? 0

  return (
    <>
      <ScreenTitle title={t('staff.screens.notReady')} />
      <p className="-mt-3 mb-5 text-sm text-muted">{t('staff.notReady.intro')}</p>
      {isAdmin && <RulesEditor />}
      {!rows ? <DataStatus loading={!error} error={error} /> : (
        <>
          <Tabs value={tab} onChange={setTab} tabs={(['open', 'contacted', 'closed'] as const).map(s => ({ id: s, label: t(`staff.notReady.status.${s}`), count: count(s) }))} />
          {list.length ? (
            <ul className="grid gap-3">
              {list.map(r => {
                const consultant = consultants.some(c => c.id === r.consultantId) ? getConsultant(r.consultantId) : null
                return (
                  <li key={r.id} aria-label={r.name} className="rounded-2xl bg-white p-4 ring-1 ring-line">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p dir="auto" className="font-semibold text-ink">{r.name}</p>
                        <p className="text-sm text-slate">
                          <a href={whatsappLink(r.phone, '')} target="_blank" rel="noreferrer" className="font-semibold text-navy underline-offset-2 hover:underline"><Ltr>{r.phone}</Ltr></a>
                          {r.email && <> · <a href={`mailto:${r.email}`} className="underline-offset-2 hover:underline"><Ltr>{r.email}</Ltr></a></>}
                        </p>
                      </div>
                      {r.score !== null && (
                        <span className="rounded-full bg-bad-soft px-3 py-1 text-sm font-bold text-bad" aria-label={t('staff.notReady.score')}>
                          <Ltr>{r.score}{r.scoreMax ? ` / ${r.scoreMax}` : ''}</Ltr>
                        </span>
                      )}
                    </div>
                    <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                      <dt className="text-muted">{t('staff.notReady.program')}</dt>
                      <dd className="font-semibold text-slate">{l(programName(r.program))}{r.destination && ` · ${destinations[r.destination] ? l(destinations[r.destination]) : r.destination}`}</dd>
                      {consultant && <>
                        <dt className="text-muted">{t('staff.notReady.wanted')}</dt>
                        <dd className="font-semibold text-slate">
                          {l(consultant.name)} · {t(`format.${r.format}`)}{r.wantedIso && <> · <Ltr>{when(Date.parse(r.wantedIso))}</Ltr></>}
                        </dd>
                      </>}
                      <dt className="text-muted">{t('staff.notReady.asked')}</dt>
                      <dd className="text-slate"><Ltr>{when(r.createdAt)}</Ltr></dd>
                    </dl>
                    <div className="mt-3 rounded-xl bg-bad-soft/60 p-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-bad">{t('staff.notReady.why')}</p>
                      <ul className="mt-1 list-disc ps-5 text-sm text-ink">
                        {r.reasons.map((x, i) => <li key={i} dir="auto">{l(x)}</li>)}
                      </ul>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {r.status !== 'contacted' && <Button size="sm" disabled={busy === r.id} onClick={() => void mark(r.id, 'contacted')}><Icon name="phone" size={14} />{t('staff.notReady.markContacted')}</Button>}
                      {r.status !== 'closed' && <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => void mark(r.id, 'closed')}><Icon name="x" size={14} />{t('staff.notReady.markClosed')}</Button>}
                      {r.status !== 'open' && <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => void mark(r.id, 'open')}>{t('staff.notReady.reopen')}</Button>}
                      <label className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-paper px-3 text-sm font-semibold text-slate ring-1 ring-line">
                        <Icon name="user" size={14} />{t('staff.notReady.assignedTo')}
                        <select aria-label={`${t('staff.notReady.assignedTo')} ${r.name}`} disabled={busy === r.id} value={r.assignedTo ?? ''}
                          onChange={e => void assign(r.id, e.target.value)}
                          className="min-h-8 rounded-md border border-line bg-white px-2 text-sm font-semibold text-ink">
                          <option value="">{t('staff.notReady.nobody')}</option>
                          {/* Someone assigned earlier who is no longer an active salesperson stays visible. */}
                          {r.assignedTo && !people.some(p => p.id === r.assignedTo) && <option value={r.assignedTo}>{r.assignedName ?? '—'}</option>}
                          {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </label>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : <Empty>{t('staff.notReady.empty')}</Empty>}
        </>
      )}
    </>
  )
}
