import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useT } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { createReservation, getConsultant, SlotTaken, submitPayment } from '../../store/actions'
import { consultants } from '../../config/consultants'
import { branchById } from '../../config/branches'
import { formatMoney, priceFor } from '../../domain/pricing'
import { Header } from '../../components/Header'
import { Button, Ltr } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { offeredFormats } from '../shared/availability'
import { FormatStep } from './steps/FormatStep'
import { SlotStep } from './steps/SlotStep'
import { DetailsStep } from './steps/DetailsStep'
import { ReviewStep } from './steps/ReviewStep'
import { PaymentStep } from './steps/PaymentStep'
import { SummaryCard, validateDetails, type DetailErrors } from './shared'

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
  const offered = useMemo(() => offeredFormats(id), [id])
  const [errors, setErrors] = useState<DetailErrors>({})
  const [tried, setTried] = useState(false)
  const [slotError, setSlotError] = useState<string | null>(null)

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
    try {
      createReservation()
    } catch (e) {
      if (e instanceof SlotTaken) {
        setSlotError(t('booking.noTimes'))
        updateDraft({ step: 1, slotStartIso: null })
      }
    }
  }, [step, draft.consultantId, draft.slotStartIso, id, t, updateDraft])

  const booking = draft.bookingId ? bookings[draft.bookingId] : undefined
  const go = (s: 0 | 1 | 2 | 3 | 4) => updateDraft({ step: s })

  const canContinue =
    step === 0 ? !!draft.format :
    step === 1 ? !!draft.slotStartIso && !!draft.durationMin :
    true

  const next = () => {
    if (step === 2) {
      const e = validateDetails(draft.details)
      setErrors(e)
      setTried(true)
      if (Object.keys(e).length) return
    }
    if (step === 0 && draft.format) updateDraft({ durationMin: draft.durationMin ?? null })
    if (step < 4) go((step + 1) as 0 | 1 | 2 | 3 | 4)
  }

  const price = draft.format && draft.durationMin ? priceFor(draft.format, draft.durationMin) : null

  return (
    <>
      <Header />
      <section aria-labelledby="wizard-title" className="border-b border-line bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <h1 id="wizard-title" className="text-sm font-normal text-muted">
            {t('booking.title')} {t('booking.with', { name: l(consultant.name) })}
          </h1>
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

      <main id="main" className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-8 px-4 py-6 pb-32 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:pb-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: lang === 'ar' ? -16 : 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="min-w-0"
          >
            {step === 0 && <FormatStep value={draft.format} offered={offered} branch={branch} onChange={f => updateDraft({ format: f, durationMin: null, slotStartIso: null })} />}
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
                  updateDraft(p)
                }}
              />
            )}
            {step === 2 && <DetailsStep value={draft.details} onChange={p => {
              updateDetails(p)
              if (tried) setErrors(validateDetails({ ...draft.details, ...p }))
            }} errors={errors} showSummary={tried} />}
            {step === 3 && draft.format && draft.durationMin && draft.slotStartIso && (
              <ReviewStep consultant={consultant} branch={branch} format={draft.format} durationMin={draft.durationMin} slotStartIso={draft.slotStartIso} details={draft.details} onEdit={go} />
            )}
            {step === 4 && booking && (
              <PaymentStep
                booking={booking}
                onSubmit={p => {
                  const b = submitPayment(booking.id, p)
                  resetDraft(null)
                  navigate(`/ticket/${b.manageToken}`)
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

      {step < 4 && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 pt-3 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 sm:px-6">
            {step > 0 && (
              <Button variant="ghost" onClick={() => go((step - 1) as 0 | 1 | 2 | 3)} aria-label={t('common.back')} className="px-3.5">
                <Icon name="chevron" size={18} className="rotate-180" />
                <span className="hidden sm:inline">{t('common.back')}</span>
              </Button>
            )}
            <div className="min-w-0 flex-1 lg:hidden">
              {price && (
                <>
                  <p className="text-xs text-muted">{t('common.minutes', { n: draft.durationMin! })}</p>
                  <p className="font-display text-lg font-semibold text-ink"><Ltr>{formatMoney(price, lang)}</Ltr></p>
                </>
              )}
            </div>
            <div className="hidden flex-1 lg:block" />
            <Button variant={step === 3 ? 'gold' : 'primary'} size="lg" disabled={!canContinue} onClick={next} className="min-w-40">
              {step === 3 ? t('booking.toPayment') : t('common.continue')}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
