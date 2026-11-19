import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { repo } from '../../data'
import { reportActionError } from '../../data/feedback'
import { useAppStore } from '../../store/useAppStore'
import type { Booking, MeetingSummary } from '../../domain/types'
import { getConsultant } from '../../store/actions'
import { Button } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { AssessmentQuestions } from '../../assessment/AssessmentQuestions'
import { evaluate } from '../../assessment/evaluate'
import { useEgpRates } from '../../assessment/useEgpRates'
import type { StoredAssessment } from '../../assessment/questions'
import type { RoomContext } from './RoomCall'
import { useClientAssessment } from './useSharedAssessment'
import { downloadAssessment, downloadSummary } from './pdf/downloads'

/** Beside the client's video: nothing until the consultant sends the assessment, then the live card. */
export function ClientRoomSide({ ctx, consultantName }: { ctx: RoomContext; consultantName: string }) {
  const { t } = useT()
  const now = useAppStore(s => s.now)
  const { card, recording, setAnswers } = useClientAssessment(ctx.channel, now)
  if (!card && !recording) return null
  return (
    <div className="grid gap-4">
      {recording && (
        <p role="status" className="mg-slide-in flex items-start gap-3 rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad ring-1 ring-bad/20">
          <span className="mt-1 size-2.5 shrink-0 animate-pulse rounded-full bg-bad" />{t('room.recordingBanner')}
        </p>
      )}
      {card && (
        <section aria-labelledby="live-card" className="mg-slide-in overflow-hidden rounded-[1.75rem] bg-white shadow-lift ring-2 ring-gold/60">
          <header className="bg-slate-deep px-5 py-4 text-white">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold">
              <span className="relative inline-flex size-2"><span className="mg-breathe absolute inset-0 rounded-full bg-gold" /><span className="relative size-2 rounded-full bg-gold" /></span>
              {t('room.clientCardLive', { name: consultantName })}
            </p>
            <h2 id="live-card" className="mt-1 font-display text-lg font-semibold">{t('room.clientCardTitle')}</h2>
            <p className="mt-0.5 text-sm text-mist">{t('room.clientCardHint')}</p>
          </header>
          <div className="max-h-[calc(78dvh-90px)] overflow-y-auto p-4">
            <AssessmentQuestions program={card.program} answers={card.answers} onChange={setAnswers} showErrors={false} />
          </div>
        </section>
      )}
    </div>
  )
}

/** The client's published meeting summary through their manage link; asks again every 20 s until it is there. */
export function useMySummary(token: string, poll = false) {
  const [summary, setSummary] = useState<MeetingSummary | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout>
    const ask = () => repo.myMeetingSummary(token).then(s => {
      if (!live) return
      setSummary(s)
      if (!s && poll) timer = setTimeout(ask, 20_000)
    }, () => live && setSummary(null))
    void ask()
    return () => { live = false; clearTimeout(timer) }
  }, [token, poll])
  return summary
}

function useMyAssessmentOnce(token: string) {
  const [stored, setStored] = useState<StoredAssessment | null | undefined>(undefined)
  useEffect(() => { let live = true; repo.myAssessment(token).then(a => live && setStored(a), () => live && setStored(null)); return () => { live = false } }, [token])
  return stored
}

/** One big download: a gold button the client cannot miss. */
function DownloadCard({ icon, title, hint, action, busy, disabled, pending }: {
  icon: 'card' | 'list'; title: string; hint: string; action: () => void; busy: boolean; disabled?: boolean; pending?: string
}) {
  const { t } = useT()
  return (
    <div className="flex flex-col rounded-[1.5rem] bg-white/[0.06] p-6 ring-1 ring-white/15 backdrop-blur-sm">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-gold/15 text-gold"><Icon name={icon} size={22} /></span>
      <h3 className="mt-4 font-display text-xl font-semibold text-white">{title}</h3>
      <p className="mt-1 flex-1 text-sm leading-relaxed text-mist">{pending ?? hint}</p>
      <Button variant="gold" size="lg" className="mt-5 w-full text-lg" disabled={disabled || busy} onClick={action}>
        {pending ? <span className="size-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink" /> : <Icon name="download" size={20} />}
        {busy ? t('room.downloading') : title}
      </Button>
    </div>
  )
}

/** After the call (or when the client opens a closed room): thanks, and the documents to download. */
export function ClientAfterCall({ booking }: { booking: Booking }) {
  const { t, l, lang } = useT()
  const stored = useMyAssessmentOnce(booking.manageToken)
  const summary = useMySummary(booking.manageToken, true)
  const { rates } = useEgpRates(stored?.program === 'job-seeking')
  const result = useMemo(() => (stored ? evaluate(stored, rates) : null), [stored, rates])
  const [busy, setBusy] = useState<'' | 'a' | 's'>('')
  const run = (which: 'a' | 's', fn: () => Promise<void>) => { setBusy(which); fn().catch(reportActionError).finally(() => setBusy('')) }
  const first = booking.customer.name.trim().split(/\s+/)[0]

  return (
    <section className="relative overflow-hidden rounded-[1.75rem] bg-slate-deep px-6 py-10 text-white shadow-lift sm:px-10 sm:py-14">
      <div className="grain pointer-events-none absolute inset-0" aria-hidden />
      <svg className="pointer-events-none absolute -end-16 -top-16 opacity-20" width="420" height="420" viewBox="0 0 420 420" aria-hidden>
        {Array.from({ length: 9 }, (_, i) => <circle key={i} cx="340" cy="80" r={40 + i * 30} fill="none" stroke="#c9a86a" strokeWidth="1" />)}
      </svg>
      <div className="relative">
        <span className="flex size-16 items-center justify-center rounded-full bg-gold text-ink shadow-[0_10px_30px_-10px_rgb(201_168_106)]"><Icon name="check" size={30} /></span>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-gold">{t('room.doneEyebrow')}</p>
        <h2 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">{t('room.doneTitle', { name: first })}</h2>
        <p className="mt-3 max-w-2xl text-base text-mist-soft">{t('room.doneBody', { name: l(getConsultant(booking.consultantId).name) })}</p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <DownloadCard icon="card" title={t('room.dlAssessment')} hint={t('room.dlAssessmentHint')} busy={busy === 'a'}
            disabled={!result} pending={stored === null ? t('room.noAssessment') : undefined}
            action={() => result && stored && run('a', () => downloadAssessment(booking, result, stored.program, lang))} />
          <DownloadCard icon="list" title={t('room.dlSummary')} hint={t('room.dlSummaryHint')} busy={busy === 's'}
            disabled={!summary} pending={summary === null ? t('room.summaryPending') : undefined}
            action={() => summary && run('s', () => downloadSummary(booking, summary))} />
        </div>

        <Link to={`/booking/${booking.manageToken}`} className="mt-8 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-mist hover:text-white">
          <Icon name="chevron" size={15} className="rotate-180 rtl:rotate-0" />{t('room.back')}
        </Link>
      </div>
    </section>
  )
}

/** On the booking page: the meeting summary download, once the consultant has published it. */
export function SummaryLinkCard({ booking }: { booking: Booking }) {
  const { t } = useT()
  const summary = useMySummary(booking.manageToken)
  const [busy, setBusy] = useState(false)
  if (!summary) return null
  return (
    <section aria-labelledby="your-summary" className="rounded-2xl bg-slate-deep p-5 text-white ring-1 ring-ink/20">
      <h2 id="your-summary" className="font-display text-lg font-semibold">{t('room.summaryCardTitle')}</h2>
      <p className="mt-1 text-sm text-mist">{t('room.dlSummaryHint')}</p>
      <Button variant="gold" size="lg" className="mt-4 w-full sm:w-auto" disabled={busy}
        onClick={() => { setBusy(true); downloadSummary(booking, summary).catch(reportActionError).finally(() => setBusy(false)) }}>
        <Icon name="download" size={18} />{busy ? t('room.downloading') : t('room.dlSummary')}
      </Button>
    </section>
  )
}
