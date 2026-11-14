import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useT } from '../../i18n'
import { repo } from '../../data'
import { useBookingLookup } from '../../data/useBookings'
import { DataStatus } from '../../data/feedback'
import { Header } from '../../components/Header'
import { Button, Notice } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { evaluate } from '../../assessment/evaluate'
import { useEgpRates } from '../../assessment/useEgpRates'
import { ClientReport, printReport } from '../../assessment/report/ClientReport'
import { buildAssessmentReport } from '../../assessment/report/assessmentReport'
import type { StoredAssessment } from '../../assessment/questions'

/** The client's own assessment through their manage link: undefined while loading, null when there is none. */
export function useMyAssessment(token: string) {
  const [stored, setStored] = useState<StoredAssessment | null | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)
  useEffect(() => {
    let live = true
    repo.myAssessment(token).then(a => live && setStored(a)).catch(e => live && (setStored(null), setError(e)))
    return () => { live = false }
  }, [token])
  return { stored, error }
}

/** /booking/:token/assessment — the client's assessment report, as their consultant filled it in. */
export function AssessmentPage() {
  const { t } = useT()
  const { token = '' } = useParams()
  const { booking, loading, error } = useBookingLookup(token)
  const { stored, error: aError } = useMyAssessment(token)
  const { rates } = useEgpRates(stored?.program === 'job-seeking')
  const report = useMemo(() => (booking && stored ? buildAssessmentReport(booking, evaluate(stored, rates)) : null), [booking, stored, rates])

  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-4xl px-4 py-8">
        <Link to={`/booking/${token}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-navy">
          <Icon name="arrow" size={14} className="rotate-180 rtl:rotate-0" />{t('clientAssessment.back')}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-ink">{t('clientAssessment.title')}</h1>
        {(!booking && (loading || error)) || stored === undefined ? <DataStatus loading={loading || stored === undefined} error={error ?? aError} />
          : aError != null ? <DataStatus error={aError} />
          : !report ? <Notice tone="info" className="mt-4">{t('clientAssessment.none')}</Notice>
          : (
            <>
              <Button variant="ghost" className="mt-4" onClick={() => printReport('assessment', `MG-Assessment-${booking!.reference}`)}>
                <Icon name="download" size={16} />{t('clientAssessment.pdf')}
              </Button>
              <ClientReport {...report} />
            </>
          )}
      </main>
    </>
  )
}

/** On the booking (ticket) page: a link to the client's assessment once the consultant has filled it in. */
export function AssessmentLinkCard({ token }: { token: string }) {
  const { t } = useT()
  const { stored } = useMyAssessment(token)
  if (!stored) return null
  return (
    <section aria-labelledby="your-assessment" className="rounded-2xl bg-white p-4 ring-1 ring-line">
      <h2 id="your-assessment" className="font-semibold text-ink">{t('clientAssessment.title')}</h2>
      <p className="mt-1 text-sm text-muted">{t('clientAssessment.ready')}</p>
      <Link to={`/booking/${token}/assessment`} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate px-4 font-semibold text-white">
        {t('clientAssessment.open')}
      </Link>
    </section>
  )
}
