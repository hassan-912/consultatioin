import { useT } from '../../i18n'
import { approvalStats, type Outcomes } from '../../domain/stats'
import { DemoBadge } from '../../components/ui'
import { Icon } from '../../components/Icon'

export function ApprovalStats({ outcomes, minSample }: { outcomes: Outcomes | null; minSample: number }) {
  const { t } = useT()
  if (!outcomes) return <section className="rounded-3xl bg-white p-5 ring-1 ring-line"><h2 className="text-lg font-semibold text-ink">{t('profile.approvalTitle')}</h2><p className="mt-3 text-sm text-muted">{t('data.unavailable')}</p></section>
  const s = approvalStats(outcomes, minSample)
  const id = 'approval-title'
  return (
    <section role="region" aria-labelledby={id} className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 id={id} className="text-lg font-semibold text-ink">{t('profile.approvalTitle')}</h2>
        <DemoBadge />
      </div>

      {s.visible ? (
        <div className="flex items-end gap-4">
          <p dir="ltr" className="font-display text-5xl font-semibold leading-none text-ink">{Math.round(s.rate! * 100)}%</p>
          <p className="pb-1 text-sm text-muted">{t('profile.approvalRate')}</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-paper p-4">
          <p className="font-semibold text-slate">{t('profile.approvalHidden')}</p>
          <p className="mt-1 text-sm text-muted">{t('profile.approvalHiddenHint', { n: minSample })}</p>
        </div>
      )}

      <p className="mt-4 flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2.5 text-sm font-medium text-warn">
        <Icon name="info" size={16} className="mt-0.5" />
        {t('profile.approvalDisclaimer')}
      </p>
    </section>
  )
}
