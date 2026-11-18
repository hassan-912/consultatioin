import { useT } from '../../../i18n'
import { easykashOptions, payCurrencies, paymentMethodLabels } from '../../../config/payments'
import { Notice } from '../../../components/ui'
import { ScreenTitle } from '../StaffApp'
import { isLive } from '../../../data/mode'

export function PaymentsAdmin() {
  const { t, l } = useT()
  return (
    <>
      <ScreenTitle title={t('staff.screens.paymentSettings')} />
      <Notice tone="info" className="mb-4">{t(isLive ? 'data.sourceManaged' : 'staff.admin.sharedConfig')}</Notice>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="grid content-start gap-2 rounded-2xl bg-white p-5 ring-1 ring-line">
          <h2 className="font-semibold text-ink">{l(paymentMethodLabels.easykash)}</h2>
          <ul className="flex flex-wrap gap-1.5">
            {easykashOptions.map(o => <li key={o.en} className="rounded-full bg-paper px-2.5 py-1 text-xs font-semibold text-slate ring-1 ring-line">{l(o)}</li>)}
          </ul>
        </section>
        <section className="grid content-start gap-2 rounded-2xl bg-white p-5 ring-1 ring-line">
          <h2 className="font-semibold text-ink">{t('payment.currency')}</h2>
          <p dir="ltr" className="text-start font-mono font-semibold text-slate rtl:text-end">{payCurrencies.join(' · ')}</p>
          <p className="text-xs text-muted">{t('staff.admin.currencyNote')}</p>
        </section>
      </div>
      <section className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-white p-5 ring-1 ring-line">
        <div>
          <h2 className="font-semibold text-ink">{t('staff.admin.autoConfirm')}</h2>
          <p className="text-sm text-muted">{t('staff.admin.autoConfirmOn')}</p>
        </div>
        <span role="switch" aria-checked="true" aria-disabled="true" aria-label={t('staff.admin.autoConfirm')} className="relative inline-flex h-7 w-12 shrink-0 cursor-not-allowed rounded-full bg-ok">
          <span className="absolute end-1 top-1 size-5 rounded-full bg-white shadow" />
        </span>
      </section>
    </>
  )
}
