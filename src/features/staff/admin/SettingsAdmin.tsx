import { useT } from '../../../i18n'
import { useAppStore } from '../../../store/useAppStore'
import { getConsultants } from '../../../store/actions'
import { paymentConfig } from '../../../config/payments'
import { kpiConfig } from '../../../config/kpi'
import { bookingConfig } from '../../../config/booking'
import { demoStats } from '../../../demo/seed'
import { CopyField } from '../../../components/CopyField'
import { DemoBadge, Notice } from '../../../components/ui'
import { TextField } from '../../../components/fields'
import { ScreenTitle } from '../StaffApp'

export function PaymentsAdmin() {
  const { t, l } = useT()
  return (
    <>
      <ScreenTitle title={t('staff.screens.paymentSettings')} />
      <Notice tone="info" className="mb-4">{t('staff.admin.sharedConfig')}</Notice>
      <div className="grid gap-4 md:grid-cols-2">
        {paymentConfig.methods.map(m => (
          <section key={m.id} className="grid gap-2 rounded-2xl bg-white p-5 ring-1 ring-line">
            <h2 className="font-semibold text-ink">{l(m.label)}</h2>
            <CopyField label={l(m.detailLabel)} value={m.detail} />
            <CopyField label={t('payment.recipient')} value={m.recipient} mono={false} />
          </section>
        ))}
      </div>
      <section className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-white p-5 ring-1 ring-line">
        <div>
          <h2 className="font-semibold text-ink">{t('staff.admin.autoConfirm')}</h2>
          <p className="text-sm text-muted">{t('staff.admin.autoConfirmOff')}</p>
        </div>
        <span role="switch" aria-checked={bookingConfig.autoConfirm} aria-disabled="true" aria-label={t('staff.admin.autoConfirm')} className="relative inline-flex h-7 w-12 shrink-0 cursor-not-allowed rounded-full bg-line">
          <span className="absolute start-1 top-1 size-5 rounded-full bg-white shadow" />
        </span>
      </section>
      <Notice tone="warn" className="mt-4">{t('payment.pendingConfig')}</Notice>
    </>
  )
}

export function KpiAdmin() {
  const { t, l } = useT()
  const overrides = useAppStore(s => s.kpiOverrides)
  const minSample = useAppStore(s => s.approvalMinSample) ?? kpiConfig.approvalMinSample
  const addAudit = useAppStore(s => s.addAudit)
  return (
    <>
      <ScreenTitle title={t('staff.screens.kpi')}><DemoBadge /></ScreenTitle>
      <Notice tone="warn" className="mb-4">{t('staff.admin.kpiDefinitionsPending')}</Notice>
      <section className="rounded-2xl bg-white p-5 ring-1 ring-line">
        <div className="max-w-xs">
          <TextField
            label={t('staff.admin.minSample')}
            type="number"
            min={1}
            dir="ltr"
            value={minSample}
            onChange={e => {
              const n = Math.max(1, Number(e.target.value) || 1)
              useAppStore.setState({ approvalMinSample: n })
              addAudit({ actor: 'admin', action: 'edited', from: 'approvalMinSample', to: String(n) })
            }}
          />
        </div>
        <h2 className="mt-6 mb-3 font-semibold text-ink">{t('staff.admin.kpiScores')}</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {getConsultants().map(c => (
            <label key={c.id} className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2">
              <span className="text-sm font-semibold">{l(c.name)}</span>
              <input
                type="number"
                min={0}
                max={10}
                step={0.1}
                dir="ltr"
                className="min-h-11 w-24 rounded-lg border border-line bg-white px-2 text-center"
                value={overrides[c.id] ?? demoStats[c.id].kpi}
                onChange={e => {
                  const v = Math.min(10, Math.max(0, Number(e.target.value)))
                  useAppStore.setState(s => ({ kpiOverrides: { ...s.kpiOverrides, [c.id]: v } }))
                  addAudit({ actor: 'admin', action: 'edited', from: c.id, to: `KPI ${v}` })
                }}
              />
            </label>
          ))}
        </div>
      </section>
    </>
  )
}
