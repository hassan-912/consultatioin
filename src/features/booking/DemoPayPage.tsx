import { useNavigate, useSearchParams } from 'react-router-dom'
import { useT } from '../../i18n'
import { completeDemoPayment } from '../../data/local'
import { pendingPayment } from '../../data/pendingPayment'
import { Header } from '../../components/Header'
import { Button, Notice } from '../../components/ui'

/** Prototype only: stands in for EasyKash's hosted page so the whole flow can be tried without keys. */
export function DemoPayPage() {
  const { t } = useT()
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const pending = pendingPayment()
  const finish = (ok: boolean) => {
    if (ok && pending) completeDemoPayment(pending.token)
    navigate(`/pay/return?status=${ok ? 'success' : 'failed'}`, { replace: true })
  }
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-md px-4 py-12">
        <div className="rounded-3xl bg-white p-6 ring-1 ring-line">
          <h1 className="text-2xl font-semibold text-ink">{t('payDemo.title')}</h1>
          <p dir="ltr" className="mt-1 text-start font-mono text-sm text-muted rtl:text-end">{search.get('currency') ?? 'EGP'}</p>
          <Notice tone="info" className="mt-4">{t('payDemo.body')}</Notice>
          <div className="mt-6 grid gap-2">
            <Button variant="gold" size="lg" onClick={() => finish(true)} disabled={!pending}>{t('payDemo.pay')}</Button>
            <Button variant="ghost" onClick={() => finish(false)}>{t('payDemo.fail')}</Button>
          </div>
        </div>
      </main>
    </>
  )
}
