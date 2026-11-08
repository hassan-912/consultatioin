import { useCallback, useEffect, useState } from 'react'
import { useT } from '../../../i18n'
import { repo } from '../../../data'
import { DataStatus, reportActionError } from '../../../data/feedback'
import type { FinanceCase } from '../../../data/types'
import { getConsultant } from '../../../store/actions'
import { programName } from '../../../config/programs'
import { Button, Ltr } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { ScreenTitle } from '../StaffApp'
import { Empty, Tabs } from '../common'

const tone = { contract: 'bg-ok-soft text-ok', refund: 'bg-bad-soft text-bad' } as const

/** Finance: clients the consultant recorded as signing the contract or wanting a refund. No consultation notes. */
export function NextStepsFinance() {
  const { t, l, lang } = useT()
  const [cases, setCases] = useState<FinanceCase[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [tab, setTab] = useState<'open' | 'handled'>('open')
  const load = useCallback(() => repo.financeNextSteps().then(c => { setCases(c); setError(null) }).catch(setError), [])
  useEffect(() => {
    void load()
    const off = repo.subscribe(() => void load())
    const timer = setInterval(() => void load(), 30000)
    return () => { off(); clearInterval(timer) }
  }, [load])

  const open = cases?.filter(c => !c.handledAt) ?? []
  const handled = cases?.filter(c => c.handledAt) ?? []
  const list = tab === 'open' ? open : handled
  const date = (ms: number) => new Date(ms).toLocaleString(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' })
  const handle = async (id: string) => { try { await repo.markFinanceHandled(id); await load() } catch (e) { reportActionError(e) } }

  return (
    <>
      <ScreenTitle title={t('staff.screens.nextSteps')} />
      <p className="-mt-3 mb-5 text-sm text-muted">{t('staff.financeCases.intro')}</p>
      {!cases ? <DataStatus loading={!error} error={error} /> : (
        <>
          <Tabs value={tab} onChange={setTab} tabs={[
            { id: 'open', label: t('staff.financeCases.open'), count: open.length },
            { id: 'handled', label: t('staff.financeCases.handled'), count: handled.length },
          ]} />
          {list.length ? (
            <ul className="grid gap-3">
              {list.map(c => (
                <li key={c.bookingId} aria-label={c.reference} className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-line sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${tone[c.nextStep]}`}>{t(`staff.nextStep.${c.nextStep}`)}</span>
                      <Ltr className="font-display text-sm font-semibold tracking-wider text-muted">{c.reference}</Ltr>
                    </div>
                    <p dir="auto" className="mt-1.5 font-semibold text-ink">{c.name}</p>
                    <p className="text-sm text-slate"><Ltr>{c.phone}</Ltr></p>
                    <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                      <span>{t('common.consultant')}: <span className="font-semibold text-slate">{l(getConsultant(c.consultantId).name)}</span></span>
                      {c.program && <span>{t('staff.history.cols.program')}: <span className="font-semibold text-slate">{l(programName(c.program))}</span></span>}
                      <span>{t('staff.financeCases.decided', { date: date(c.at) })}</span>
                    </p>
                  </div>
                  {c.handledAt
                    ? <span className="text-sm font-semibold text-ok"><Icon name="check" size={15} className="inline" /> {t('staff.financeCases.handledOn', { date: date(c.handledAt) })}</span>
                    : <Button size="sm" onClick={() => void handle(c.bookingId)}><Icon name="check" size={15} />{t('staff.financeCases.handle')}</Button>}
                </li>
              ))}
            </ul>
          ) : <Empty>{t('staff.financeCases.empty')}</Empty>}
        </>
      )}
    </>
  )
}
