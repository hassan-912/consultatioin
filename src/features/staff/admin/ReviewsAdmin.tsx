import { useEffect, useState } from 'react'
import { useT } from '../../../i18n'
import { repo } from '../../../data'
import { DataStatus, reportActionError } from '../../../data/feedback'
import { getConsultant } from '../../../store/actions'
import { formatInZone } from '../../../domain/time'
import type { StaffReview } from '../../../domain/types'
import { Button, Notice } from '../../../components/ui'
import { Stars } from '../../reviews/Reviews'
import { ScreenTitle } from '../StaffApp'
import { Empty, Tabs } from '../common'

/** Admin moderation: every review with a Hide / Show toggle. Hidden reviews stay stored and audited. */
export function ReviewsAdmin() {
  const { t, l, lang } = useT()
  const [reviews, setReviews] = useState<StaffReview[]>()
  const [error, setError] = useState<unknown>(null)
  const [tab, setTab] = useState<'all' | 'hidden'>('all')
  const [busy, setBusy] = useState<string | null>(null)

  const load = () => repo.staffReviews().then(r => { setReviews(r); setError(null) }).catch(setError)
  useEffect(() => { void load() }, [])

  const toggle = async (r: StaffReview) => {
    setBusy(r.id)
    try { await repo.setReviewHidden(r.id, !r.hidden); await load() } catch (e) { reportActionError(e) } finally { setBusy(null) }
  }

  const shown = (reviews ?? []).filter(r => tab === 'all' || r.hidden)
  return (
    <>
      <ScreenTitle title={t('staff.screens.reviews')} />
      <Notice tone="info" className="mb-5">{t('review.adminIntro')}</Notice>
      {!reviews ? <DataStatus loading={!error} error={error} /> : (
        <>
          <Tabs value={tab} onChange={setTab} tabs={[
            { id: 'all', label: t('review.filterAll'), count: reviews.length },
            { id: 'hidden', label: t('review.filterHidden'), count: reviews.filter(r => r.hidden).length },
          ]} />
          {!shown.length ? <Empty>{t('review.empty')}</Empty> : (
            <ul className="grid gap-3">
              {shown.map(r => (
                <li key={r.id} aria-label={`${r.name} ${r.bookingRef ?? ''}`.trim()} className={`rounded-2xl bg-white p-4 ring-1 ring-line ${r.hidden ? 'opacity-70' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">{r.name}</span>
                        <Stars value={r.rating} size={14} label={t('review.starsLabel', { n: r.rating })} />
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.hidden ? 'bg-warn-soft text-warn' : 'bg-ok-soft text-ok'}`}>
                          {r.hidden ? t('review.hidden') : t('review.visible')}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === 'approved' ? 'bg-ok-soft text-ok' : r.status === 'rejected' ? 'bg-paper text-muted' : 'bg-warn-soft text-warn'}`}>
                          {t(`review.my.${r.status}`)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {l(getConsultant(r.consultantId).name)} · <bdi dir="ltr">{r.bookingRef ?? '—'}</bdi> · {formatInZone(r.at, 'Africa/Cairo', lang, 'full')}
                      </p>
                    </div>
                    <Button size="sm" variant={r.hidden ? 'primary' : 'ghost'} disabled={busy === r.id} onClick={() => void toggle(r)}>
                      {r.hidden ? t('review.show') : t('review.hide')}
                    </Button>
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
