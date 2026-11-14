import { useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { repo } from '../../data'
import { DataStatus, errorKey } from '../../data/feedback'
import type { Booking, ConsultantReviews, Review } from '../../domain/types'
import { Button, Notice } from '../../components/ui'
import { TextArea } from '../../components/fields'
import { formatDate } from '../../domain/time'

const STAR = 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z'
const dateOf = (at: number) => new Date(at).toISOString().slice(0, 10)

/** Read-only star row; `value` may be fractional (an average). */
export function Stars({ value, size = 16, label }: { value: number; size?: number; label?: string }) {
  return (
    <span role="img" aria-label={label} className="inline-flex shrink-0 gap-0.5 text-gold" dir="ltr">
      {[1, 2, 3, 4, 5].map(i => {
        const fill = Math.max(0, Math.min(1, value - i + 1))
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
            <defs>
              <linearGradient id={`star-${i}-${Math.round(fill * 100)}`}>
                <stop offset={fill} stopColor="currentColor" />
                <stop offset={fill} stopColor="var(--color-line)" />
              </linearGradient>
            </defs>
            <path d={STAR} fill={`url(#star-${i}-${Math.round(fill * 100)})`} />
          </svg>
        )
      })}
    </span>
  )
}

/** Customer side: rate a completed consultation once, then see what was sent. */
export function ReviewCard({ b }: { b: Booking }) {
  const { t } = useT()
  const [existing, setExisting] = useState<Review | null | undefined>(undefined)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    let live = true
    repo.getReview(b.manageToken).then(r => live && setExisting(r)).catch(e => live && (setExisting(null), setError(e)))
    return () => { live = false }
  }, [b.manageToken])

  if (existing === undefined) return <DataStatus loading />
  if (existing) {
    return (
      <section aria-labelledby="review-done" className="rounded-2xl bg-white p-4 ring-1 ring-line">
        <h2 id="review-done" className="font-semibold text-ink">{t('review.thanksEnhance')}</h2>
      </section>
    )
  }

  const submit = async () => {
    setBusy(true); setError(null)
    try { setExisting(await repo.submitReview(b.manageToken, rating, comment)) } catch (e) { setError(e) } finally { setBusy(false) }
  }

  return (
    <section aria-labelledby="review-title" className="grid gap-3 rounded-2xl bg-white p-4 ring-2 ring-gold/60">
      <div>
        <h2 id="review-title" className="font-semibold text-ink">{t('review.title')}</h2>
        <p className="mt-0.5 text-sm text-muted">{t('review.hint')}</p>
      </div>
      <fieldset>
        <legend className="sr-only">{t('review.ratingLabel')}</legend>
        <div className="flex gap-1" dir="ltr">
          {[1, 2, 3, 4, 5].map(n => (
            <label key={n} className="cursor-pointer rounded-lg p-1 focus-within:ring-2 focus-within:ring-navy">
              <input type="radio" name={`rating-${b.id}`} value={n} checked={rating === n} onChange={() => setRating(n)} className="sr-only" aria-label={t('review.starsLabel', { n })} />
              <svg width={34} height={34} viewBox="0 0 24 24" aria-hidden className={n <= rating ? 'text-gold' : 'text-line'}>
                <path d={STAR} fill="currentColor" />
              </svg>
            </label>
          ))}
        </div>
      </fieldset>
      <TextArea label={t('review.comment')} hint={t('review.commentHint')} value={comment} maxLength={500} onChange={e => setComment(e.target.value)} />
      {error != null && <Notice tone="bad">{t(errorKey(error))}</Notice>}
      <Button disabled={!rating || busy} onClick={submit}>{busy ? t('data.saving') : t('review.submit')}</Button>
    </section>
  )
}

/** Public profile: average, count and latest reviews. */
export function ConsultantFeedback({ consultantId }: { consultantId: string }) {
  const { t, lang } = useT()
  const [data, setData] = useState<ConsultantReviews>()
  const [error, setError] = useState<unknown>(null)
  useEffect(() => {
    let live = true
    repo.consultantReviews(consultantId).then(d => live && setData(d)).catch(e => live && setError(e))
    return () => { live = false }
  }, [consultantId])

  return (
    <section role="region" aria-labelledby="feedback" className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
      <h2 id="feedback" className="mb-3 text-lg font-semibold text-ink">{t('profile.ratingTitle')}</h2>
      {!data ? <DataStatus loading={!error} error={error} /> : !data.count || data.average == null ? (
        <>
          <p className="font-semibold text-slate">{t('profile.noFeedback')}</p>
          <p className="mt-1 text-sm text-muted">{t('profile.noFeedbackHint')}</p>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <span className="font-display text-4xl font-semibold text-ink" dir="ltr">{data.average.toFixed(1)}</span>
            <div>
              <Stars value={data.average} size={18} label={t('review.averageLabel', { n: data.average.toFixed(1) })} />
              <p className="mt-0.5 text-sm text-muted">{data.count === 1 ? t('review.countOne') : t('review.count', { n: data.count })}</p>
            </div>
          </div>
          <ul className="mt-4 grid gap-3">
            {data.reviews.map((r, i) => (
              <li key={`${r.at}-${i}`} className="border-t border-line pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink">{r.name}</span>
                  <Stars value={r.rating} size={14} label={t('review.starsLabel', { n: r.rating })} />
                </div>
                {r.comment && <p className="mt-1 text-sm leading-relaxed text-slate">{r.comment}</p>}
                <p className="mt-1 text-xs text-muted">{formatDate(dateOf(r.at), lang)}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
