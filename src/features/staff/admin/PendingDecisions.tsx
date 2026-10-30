import { useT } from '../../../i18n'
import { pendingDecisions } from '../../../config/pendingDecisions'
import { Notice } from '../../../components/ui'
import { ScreenTitle } from '../StaffApp'

export function PendingDecisions() {
  const { t, l } = useT()
  const groups = [...new Set(pendingDecisions.map(d => d.area.en))]
  return (
    <>
      <ScreenTitle title={t('staff.screens.decisions')} />
      <Notice tone="warn" className="mb-6">{t('staff.admin.decisionsIntro')}</Notice>
      <div className="grid gap-6">
        {groups.map(g => {
          const items = pendingDecisions.filter(d => d.area.en === g)
          return (
            <section key={g}>
              <h2 className="mb-2 text-base font-semibold text-ink">{l(items[0].area)}</h2>
              <ul className="grid gap-2">
                {items.map(d => (
                  <li key={d.id} className="flex flex-col gap-2 rounded-2xl bg-white p-4 ring-1 ring-line sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-semibold text-slate">{l(d.question)}</p>
                    <div className="flex shrink-0 items-center gap-2 text-xs">
                      <span className="text-muted">{t('staff.admin.owner')}: {d.owner ? l(d.owner) : t('staff.admin.ownerUnassigned')}</span>
                      <span className="rounded-full bg-warn-soft px-2.5 py-1 font-semibold text-warn">{t('common.unresolved')}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </>
  )
}
