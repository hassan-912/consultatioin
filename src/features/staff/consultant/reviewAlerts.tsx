import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { create } from 'zustand'
import { useT } from '../../../i18n'
import { repo } from '../../../data'
import { useAppStore } from '../../../store/useAppStore'
import { Icon } from '../../../components/Icon'
import { chime, desktopNotify, flashTitle } from '../finance/paymentAlerts'
import type { ConsultantReview } from '../../../domain/types'

const POLL_MS = 60_000

interface ReviewWatch {
  reviews: ConsultantReview[] | null
  error: unknown
  /** Ids already known; null until the first snapshot, which only seeds it (opening the app never announces old reviews). */
  seen: Set<string> | null
  notice: boolean
}
const useReviewWatch = create<ReviewWatch>(() => ({ reviews: null, error: null, seen: null, notice: false }))

/** Test helper: forget everything the watcher knew. */
export const resetReviewWatch = () => { generation++; useReviewWatch.setState({ reviews: null, error: null, seen: null, notice: false }) }

/** Fetch the signed-in consultant's reviews; a new pending id (after the first snapshot) raises the notice. */
let generation = 0

export async function reloadMyReviews(): Promise<boolean> {
  const mine = generation
  try {
    const reviews = await repo.myReviews()
    // Signed out or switched accounts while this was in flight: drop it.
    if (mine !== generation) return false
    const { seen } = useReviewWatch.getState()
    const pending = reviews.filter(r => r.status === 'pending')
    const fresh = seen ? pending.filter(r => !seen.has(r.id)) : []
    useReviewWatch.setState({ reviews, error: null, seen: new Set([...(seen ?? []), ...reviews.map(r => r.id)]), ...(fresh.length ? { notice: true } : {}) })
    return fresh.length > 0
  } catch (error) {
    if (mine === generation) useReviewWatch.setState({ error })
    return false
  }
}

/** The signed-in consultant's id, or null for any other role. */
const useConsultantId = () => useAppStore(s => (s.role === 'consultant' ? s.staffSession?.consultantId ?? null : null))

export function useMyReviews() {
  const reviews = useReviewWatch(s => s.reviews)
  const error = useReviewWatch(s => s.error)
  return { reviews, error, pendingCount: (reviews ?? []).filter(r => r.status === 'pending').length, reload: reloadMyReviews }
}

/** Pending-review count on the consultant's nav entry. */
export function ReviewBadge() {
  const { t } = useT()
  const { pendingCount } = useMyReviews()
  if (!pendingCount) return null
  return (
    <span className="ms-auto inline-flex min-w-6 items-center justify-center rounded-full bg-gold px-1.5 text-xs font-bold text-ink" aria-label={t('review.my.badge', { count: pendingCount })}>
      <span aria-hidden="true">{pendingCount}</span>
    </span>
  )
}

/**
 * While a consultant's workspace is open: polls their reviews every minute and, for a review that arrived after the
 * first snapshot, shows a pop-up card, plays the chime, flashes the tab title and (if allowed) a desktop notification.
 */
export function NewReviewNotice() {
  const { t } = useT()
  const navigate = useNavigate()
  const consultantId = useConsultantId()
  const enabled = consultantId !== null
  const notice = useReviewWatch(s => s.notice)
  const tRef = useRef(t)
  tRef.current = t

  useEffect(() => {
    resetReviewWatch()
    if (!consultantId) return
    let live = true
    const tick = async () => {
      if (await reloadMyReviews() && live) {
        const title = tRef.current('review.my.newTitle')
        chime()
        flashTitle(title)
        desktopNotify(title, tRef.current('review.my.newBody'), () => navigate('/staff/my-reviews'), 'mg-review')
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), POLL_MS)
    return () => { live = false; window.clearInterval(id); resetReviewWatch() }
  }, [consultantId, navigate])

  if (!enabled) return null
  const close = () => useReviewWatch.setState({ notice: false })
  return (
    <div aria-live="polite" aria-atomic="true" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center sm:inset-x-auto sm:bottom-6 sm:end-6">
      {notice && (
        <div className="alert-pop pointer-events-auto w-full max-w-sm rounded-2xl bg-slate-deep p-4 text-white shadow-[var(--shadow-lift)] ring-4 ring-gold">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gold text-ink"><Icon name="star" size={22} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold">{t('review.my.newTitle')}</p>
              <p className="mt-0.5 text-sm text-mist">{t('review.my.newBody')}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button type="button" onClick={close} className="min-h-11 rounded-xl px-3 font-semibold text-mist hover:text-white">{t('staff.finance.alerts.dismiss')}</button>
            <Link to="/staff/my-reviews" onClick={close} className="inline-flex min-h-11 items-center rounded-xl bg-gold px-4 font-semibold text-ink hover:brightness-105">
              {t('review.my.view')}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
