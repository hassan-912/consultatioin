import { useState } from 'react'
import { useT } from '../../../i18n'
import { repo } from '../../../data'
import { DataStatus, reportActionError } from '../../../data/feedback'
import { formatInZone } from '../../../domain/time'
import type { ConsultantReview, ReviewStatus } from '../../../domain/types'
import { Button, Notice } from '../../../components/ui'
import { Stars } from '../../reviews/Reviews'
import { ScreenTitle } from '../StaffApp'
import { Empty, Tabs } from '../common'
import { useMyReviews } from './reviewAlerts'

/** A consultant decides which reviews about them appear on their public profile. */
export function MyReviews() {
  const { t, lang } = useT()
  const { reviews, error, reload } = useMyReviews()
  const [tab, setTab] = useState<ReviewStatus>('pending')
  const [busy, setBusy] = useState<string | null>(null)

  const decide = async (r: ConsultantReview, status: ReviewStatus) => {
    setBusy(r.id)
    try { await repo.setReviewStatus(r.id, status); await reload() } catch (e) { reportActionError(e) } finally { setBusy(null) }
  }

  const count = (s: ReviewStatus) => (reviews ?? []).filter(r => r.status === s).length
  const shown = (reviews ?? []).filter(r => r.status === tab)
  return (
    <>
      <ScreenTitle title={t('staff.screens.myReviews')} />
      <Notice tone="info" className="mb-5">{t('review.my.intro')}</Notice>
      {!reviews ? <DataStatus loading={!error} error={error} /> : (
        <>
          <Tabs value={tab} onChange={setTab} tabs={[
            { id: 'pending', label: t('review.my.pending'), count: count('pending') },
            { id: 'approved', label: t('review.my.approved'), count: count('approved') },
            { id: 'rejected', label: t('review.my.rejected'), count: count('rejected') },
          ]} />
          {!shown.length ? <Empty>{t('review.my.empty')}</Empty> : (
            <ul className="grid gap-3">
              {shown.map(r => (
                <li key={r.id} className="rounded-2xl bg-white p-4 ring-1 ring-line">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">{r.name}</span>
                        <Stars value={r.rating} size={14} label={t('review.starsLabel', { n: r.rating })} />
                      </div>
                      <p className="mt-1 text-xs text-muted"><bdi dir="ltr">{r.bookingRef ?? '—'}</bdi> · {formatInZone(r.at, 'Africa/Cairo', lang, 'full')}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {r.status !== 'approved' && (
                        <Button size="sm" disabled={busy === r.id} onClick={() => void decide(r, 'approved')}>{t('review.my.show')}</Button>
                      )}
                      {r.status !== 'rejected' && (
                        <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => void decide(r, 'rejected')}>{t('review.my.hide')}</Button>
                      )}
                    </div>
                  </div>
                  <p className={`mt-2 text-sm leading-relaxed ${r.comment ? 'text-slate' : 'italic text-muted'}`}>{r.comment || t('review.noComment')}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  )
}
