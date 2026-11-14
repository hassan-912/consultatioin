import { useEffect, useRef, useState } from 'react'
import { bookingConfig } from '../../config/booking'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useT } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { getConsultant } from '../../store/actions'
import { repo, SlotTaken } from '../../data'
import { consultants } from '../../config/consultants'
import { branchById } from '../../config/branches'
import { Header } from '../../components/Header'
import { Button } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { useOfferedFormats } from '../shared/availability'
import { isLive } from '../../data/mode'
import { DataStatus } from '../../data/feedback'
import type { Booking } from '../../domain/types'
import { FormatStep } from './steps/FormatStep'
import { SlotStep } from './steps/SlotStep'
import { DetailsStep } from './steps/DetailsStep'
import { ReviewStep } from './steps/ReviewStep'
import { PaymentStep } from './steps/PaymentStep'
import { SummaryCard, validateDetails, type DetailErrors } from './shared'
import { isAssessed, unanswered } from '../../assessment/questions'
import { defaultReadinessRules, readinessOf, type ReadinessRules } from '../../assessment/readiness'
import { useEgpRates } from '../../assessment/useEgpRates'
import { NotReadyNotice } from './NotReadyNotice'
import { currentReferral } from '../../data/referral'
import { rememberPayment } from '../../data/pendingPayment'

const STEP_KEYS = ['format', 'time', 'details', 'review', 'payment'] as const

export function BookingWizard() {
  const { id = '' } = useParams()
  if (!consultants.some(c => c.id === id)) return <Navigate to="/" replace />
  return <Wizard id={id} />
}

function Wizard({ id }: { id: string }) {
  const { t, l, lang } = useT()
  const navigate = useNavigate()
  const draft = useAppStore(s => s.draft)
  const bookings = useAppStore(s => s.bookings)
  const overrides = useAppStore(s => s.consultantOverrides)
  const updateDraft = useAppStore(s => s.updateDraft)
  const updateDetails = useAppStore(s => s.updateDetails)
  const resetDraft = useAppStore(s => s.resetDraft)
  const consultant = getConsultant(id, overrides)
  const branch = branchById(consultant.branchId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const offered = useOfferedFormats(id)
  const [errors, setErrors] = useState<DetailErrors>({})
  const [tried, setTried] = useState(false)
  const [slotError, setSlotError] = useState<string | null>(null)
  const [fatal, setFatal] = useState<unknown>(null)
  const [remoteBooking, setRemoteBooking] = useState<Booking>()
  const pendingReservations = useRef(new Map<string, ReturnType<typeof repo.reserve>>())
  const [reserveAttempt, setReserveAttempt] = useState(0)
  // Readiness: a client who isn't ready for the program doesn't pay; the sales manager calls them instead.
  const [rules, setRules] = useState<ReadinessRules>(defaultReadinessRules)
  useEffect(() => { void repo.readinessRules().then(setRules).catch(() => undefined) }, [])
  const fx = useEgpRates(draft.details.program === 'job-seeking').rates
  const [notReady, setNotReady] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [notReadyError, setNotReadyError] = useState<unknown>(null)
  if (fatal && !isLive) throw fatal

  // Start a fresh draft when arriving for a different consultant.
  useEffect(() => {
    if (draft.consultantId !== id) resetDraft(id)
  }, [draft.consultantId, id, resetDraft])
  // Preselect the only format on offer.
  useEffect(() => {
    if (draft.consultantId === id && !draft.format && offered.length === 1) updateDraft({ format: offered[0] })
  }, [draft.consultantId, draft.format, id, offered, updateDraft])

  // Payment step: create (or reuse) the held reservation.
  const step = draft.step
  useEffect(() => {
    if (step !== 4 || draft.consultantId !== id) return
    const d = useAppStore.getState().draft
    if (!d.format || !d.slotStartIso) return
    setFatal(null)
    const key = JSON.stringify([id, d.format, d.slotStartIso, d.details, lang, d.bookingId])
    let pending = pendingReservations.current.get(key)
    if (!pending) {
      pending = repo.reserve({ consultantId: id, format: d.format, startIso: d.slotStartIso, details: d.details, lang, supersedes: d.bookingId ?? undefined })
      pendingReservations.current.set(key, pending)
    }
    const stillCurrent = () => {
      const current = useAppStore.getState().draft
      return current.consultantId === id && current.slotStartIso === d.slotStartIso && current.format === d.format
    }
    pending
      .then(async r => {
        // Situation answers travel separately from the booking details so they never reach the ticket.
        // A failed save must not block payment; the consultant can still ask in person.
        const a = d.assessment
        if (a && a.program === d.details.program) await repo.saveAssessment(r.manageToken, a).catch(() => undefined)
        // Sales link the customer arrived with; never blocks the booking.
        const ref = currentReferral()
        if (ref) await repo.setReferral(r.manageToken, ref).catch(() => false)
        if (isLive) {
          const booking = await repo.getByManageToken(r.manageToken)
          if (!booking) throw new Error('NOT_FOUND')
          if (stillCurrent()) {
            setRemoteBooking(booking)
            updateDraft({ bookingId: r.bookingId })
          }
        }
      })
      .catch(e => {
        if (!stillCurrent()) return
        if (e instanceof SlotTaken) {
          setSlotError(t('booking.noTimes'))
          updateDraft({ step: 1, slotStartIso: null })
        } else {
          setFatal(e) // rethrown during render so the error boundary sees it, as the old sync call did
        }
      }).finally(() => { pendingReservations.current.delete(key) })
  }, [step, draft.consultantId, draft.slotStartIso, draft.format, id, lang, t, updateDraft, reserveAttempt])

  const booking = isLive
    ? remoteBooking?.consultantId === id && remoteBooking.format === draft.format && Date.parse(remoteBooking.startIso) === Date.parse(draft.slotStartIso ?? '') ? remoteBooking : undefined
    : draft.bookingId ? bookings[draft.bookingId] : undefined
  const go = (s: 0 | 1 | 2 | 3 | 4) => updateDraft({ step: s })


  const program = draft.details.program
  const assessmentIncomplete = isAssessed(program) && unanswered(program, draft.assessment?.program === program ? draft.assessment.answers : {}).length > 0
  const fileNotReady = async () => {
    const d = useAppStore.getState().draft
    const a = d.assessment
    if (!a || !d.format || !d.slotStartIso) return false
    const r = readinessOf(a, rules, fx)
    if (r.ready) return false
    setNotReady('sending'); setNotReadyError(null)
    try {
      await repo.submitReadinessRequest({
        name: d.details.name, phone: d.details.phone, email: d.details.email, lang: d.details.consultationLang,
        program: a.program, destination: a.answers.destination, consultantId: id, format: d.format, wantedIso: d.slotStartIso,
        score: r.score, scoreMax: r.max, reasons: r.reasons, answers: a.answers,
      })
      setNotReady('sent')
      resetDraft(id)
    } catch (e) { setNotReady('idle'); setNotReadyError(e) }
    return true
  }
  const next = () => {
    if (step === 3 && isAssessed(program) && draft.assessment?.program === program) {
      if (notReady === 'sending') return
      void fileNotReady().then(stopped => { if (!stopped) go(4) })
      return
    }
    if (step === 2) {
      const e = validateDetails(draft.details)
      setErrors(e)
      setTried(true)
      if (Object.keys(e).length || assessmentIncomplete) return
    }
    if (step === 0 && draft.format) updateDraft({ durationMin: draft.durationMin ?? null })
    if (step < 4) go((step + 1) as 0 | 1 | 2 | 3 | 4)
  }


  return (
    <>
      <Header />
      <section aria-labelledby="wizard-title" className="border-b border-line bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={() => go((step - 1) as 0 | 1 | 2 | 3)} className="shrink-0">
                <Icon name="chevron" size={16} className="rotate-180" />
                {t('common.back')}
              </Button>
            )}
            <h1 id="wizard-title" className="text-sm font-normal text-muted">
              {t('booking.title')} {t('booking.with', { name: l(consultant.name) })}
            </h1>
          </div>
          <ol className="mt-3 flex gap-1.5" aria-label={t('booking.stepOf', { n: step + 1, total: 5 })}>
            {STEP_KEYS.map((k, i) => (
              <li key={k} className="flex-1" aria-current={i === step ? 'step' : undefined}>
                <span className={`block h-1.5 rounded-full transition-colors ${i < step ? 'bg-slate' : i === step ? 'bg-gold' : 'bg-line'}`} />
                <span className={`mt-1.5 hidden text-xs sm:block ${i === step ? 'font-semibold text-ink' : 'text-muted'}`}>{t(`booking.steps.${k}`)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs font-semibold text-slate sm:hidden">
            {t('booking.stepOf', { n: step + 1, total: 5 })}: {t(`booking.steps.${STEP_KEYS[step]}`)}
          </p>
        </div>
      </section>

      {notReady === 'sent' ? <NotReadyNotice /> : (
      <main id="main" className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-8 px-4 py-6 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: lang === 'ar' ? -16 : 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="min-w-0"
          >
            <DataStatus error={fatal ?? notReadyError} loading={(step === 4 && !booking && !fatal) || notReady === 'sending'} />
            {isLive && fatal != null && <Button className="mt-3" onClick={() => setReserveAttempt(n => n + 1)}>{t('data.retry')}</Button>}
            {step === 0 && <FormatStep value={draft.format} offered={offered} branch={branch} onChange={f => updateDraft({ format: f, durationMin: bookingConfig.durations[f][0], slotStartIso: null, step: 1 })} />}
            {step === 1 && draft.format && (
              <SlotStep
                consultantId={id}
                branch={branch}
                format={draft.format}
                durationMin={draft.durationMin}
                slotStartIso={draft.slotStartIso}
                error={slotError}
                onChange={p => {
                  setSlotError(null)
                  // Picking a time moves straight on to the details step.
                  updateDraft(p.slotStartIso ? { ...p, step: 2 } : p)
                }}
              />
            )}
            {step === 2 && <DetailsStep value={draft.details} onChange={p => {
              updateDetails(p)
              if (tried) setErrors(validateDetails({ ...draft.details, ...p }))
            }} errors={errors} showSummary={tried} onSubmit={next}
              assessment={draft.assessment} onAssessment={assessment => updateDraft({ assessment })} assessmentIncomplete={assessmentIncomplete} />}
            {step === 3 && draft.format && draft.durationMin && draft.slotStartIso && (
              <ReviewStep consultant={consultant} branch={branch} format={draft.format} durationMin={draft.durationMin} slotStartIso={draft.slotStartIso} details={draft.details} onEdit={go} onContinue={next} />
            )}
            {step === 4 && booking && (
              <PaymentStep
                booking={booking}
                onPay={async currency => {
                  rememberPayment(booking.manageToken, booking.consultantId)
                  const url = await repo.startOnlinePayment(booking.manageToken, currency)
                  if (url.startsWith('#')) navigate(url.slice(1))
                  else window.location.assign(url)
                }}
                onExpiredRestart={() => updateDraft({ step: 1, slotStartIso: null, bookingId: null })}
              />
            )}
          </motion.div>
        </AnimatePresence>

        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <SummaryCard consultant={consultant} branch={branch} format={draft.format} durationMin={draft.durationMin} slotStartIso={draft.slotStartIso} />
          </div>
        </aside>
      </main>
      )}
    </>
  )
}
