import { useAppStore, emptyDraft, todayIn } from '../store/useAppStore'
import { applyEvent, createReservation, rescheduleBooking, submitPayment, getRules, editSchedule, editConsultant, getConsultant, getConsultants } from '../store/actions'
import { consultants } from '../config/consultants'
import { CLOSES_AFTER_MS, OPENS_BEFORE_MS } from '../../supabase/functions/video-room/handler'
import { demoStats } from '../demo/seed'
import { publicTotals } from '../domain/stats'
import { slotsFor } from '../features/shared/availability'
import { InvalidTransition, checkInVerdict } from '../domain/bookingStatus'
import { cleanPhone, normalizeDigits } from '../domain/phone'
import { addDays, dateInZone } from '../domain/time'
import { bookingConfig } from '../config/booking'
import type { Booking, Format, MeetingSummary } from '../domain/types'
import { HoldExpired, RepoError, SlotTaken, type BookingRepo } from './types'
import { staffAccounts } from '../config/staffAccounts'
import { consultantBusy } from '../domain/bookingStatus'
import { localReferralCode } from './referral'
import { MAX_TEMPLATE_LENGTH } from '../config/messageTemplates'
import { mergeRules } from '../assessment/readiness'

const get = () => useAppStore.getState()

const byToken = (token: string) => Object.values(get().bookings).find(b => b.manageToken === token)

/** A booking the signed-in consultant (their own) or admin may work on, as the database checks it. */
function ownBooking(bookingId: string): Booking {
  const s = get().staffSession
  const b = get().bookings[bookingId]
  if (!s || (s.role !== 'admin' && !(s.role === 'consultant' && b && s.consultantId === b.consultantId))) throw new RepoError('FORBIDDEN')
  if (!b) throw new RepoError('NOT_FOUND')
  return b
}

/** Prototype stand-in for the AI summary of a call. */
function demoSummary(b: Booking): MeetingSummary {
  if (b.customer.consultationLang === 'ar') {
    return {
      lang: 'ar',
      overview: `ناقشنا مع ${b.customer.name} ملفه والخيارات المتاحة له، وراجعنا نقاط القوة وما يحتاج إلى تقوية قبل التقديم.`,
      keyPoints: ['الملف المالي جيد ويحتاج كشف حساب لآخر 6 أشهر.', 'خطاب جهة العمل يجب أن يذكر الإجازة المعتمدة.', 'سجل السفر السابق يدعم الطلب.'],
      agreements: ['التقديم على التأشيرة السياحية خلال الشهر القادم.', 'يقوم MG بمراجعة المستندات قبل الحجز.'],
      nextSteps: ['العميل: إرسال كشف الحساب البنكي خلال 7 أيام.', 'العميل: طلب خطاب جهة العمل.', 'MG: مراجعة المستندات وتأكيد موعد التقديم.'],
    }
  }
  return {
    lang: 'en',
    overview: `We reviewed ${b.customer.name}'s file and options together, covering what is already strong and what needs work before applying.`,
    keyPoints: ['Finances are solid; a 6-month bank statement is still needed.', 'The employer letter must state the approved leave dates.', 'Previous travel history supports the application.'],
    agreements: ['Apply for the tourist visa within the next month.', 'MG reviews every document before the appointment is booked.'],
    nextSteps: ['Client: send the bank statement within 7 days.', 'Client: request the employer letter.', 'MG: review the documents and confirm the appointment date.'],
  }
}

function mustFind(token: string): Booking {
  const b = byToken(token)
  if (!b) throw new Error('Booking not found')
  return b
}

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })

/** Wraps the zustand-backed actions; the booking logic stays in store/actions. */
export function createLocalRepo(): BookingRepo {
  return {
    async availableSlots(consultantId, date, format) {
      return slotsFor(consultantId, date, format)
    },

    async reserve(d) {
      // createReservation works off the store's draft, so load it with the caller's choices.
      useAppStore.setState(s => ({
        draft: {
          ...s.draft, consultantId: d.consultantId, format: d.format, durationMin: bookingConfig.durations[d.format][0],
          slotStartIso: d.startIso, details: d.details, bookingId: d.supersedes ?? null,
        },
      }))
      const b = createReservation(d.lang)
      return { bookingId: b.id, reference: b.reference, manageToken: b.manageToken, holdExpiresAt: b.holdExpiresAt }
    },

    async submitPayment(token, p) {
      const b = mustFind(token)
      const receiptImage = p.receiptImage ?? (p.receipt ? await toDataUrl(p.receipt) : undefined)
      try {
        return submitPayment(b.id, { method: p.method, txnRef: p.txnRef, receiptName: p.receiptName, receiptImage })
      } catch (e) {
        if (e instanceof InvalidTransition && e.from === 'expired' && e.event === 'submit-payment') throw new HoldExpired()
        throw e
      }
    },

    async startOnlinePayment(token, currency) {
      const b = mustFind(token)
      if (b.status === 'expired' || (b.status === 'reserved' && b.holdExpiresAt <= get().now())) throw new HoldExpired()
      if (b.status !== 'reserved') throw new RepoError('INVALID_TRANSITION')
      get().addAudit({ actor: 'customer', action: 'payment-started', bookingRef: b.reference, to: currency })
      // Prototype: a stand-in for EasyKash's hosted page.
      return `#/pay/demo?currency=${currency}`
    },
    async checkOnlinePayment() {},

    async getByManageToken(token) {
      return byToken(token) ?? null
    },

    async find(reference, phone) {
      const r = normalizeDigits(reference).trim().toUpperCase()
      const p = cleanPhone(phone)
      return Object.values(get().bookings).find(b => b.reference === r && b.customer.phone === p)?.manageToken ?? null
    },

    async cancel(token) {
      const b = mustFind(token)
      // Ticket issued: only staff may cancel a confirmed booking (as in the database, 0047).
      if (b.status === 'confirmed') throw new RepoError('INVALID_TRANSITION')
      return applyEvent(b.id, { type: 'cancel' }, 'customer')
    },

    async reschedule(token, startIso) {
      return rescheduleBooking(mustFind(token).id, startIso, 'customer')
    },

    async staffList({ statuses, consultantId, date }) {
      return Object.values(get().bookings).filter(b =>
        (!statuses || statuses.includes(b.status)) &&
        (!consultantId || b.consultantId === consultantId) &&
        (!date || dateInZone(b.startIso, b.tz) === date))
    },

    async staffTransition(bookingId, e, actor) {
      return applyEvent(bookingId, e, actor ?? get().staffSession?.role ?? get().role)
    },

    async checkIn(raw) {
      const q = normalizeDigits(raw).trim()
      const b = Object.values(get().bookings).find(x => x.qrToken === q || x.reference === q.toUpperCase())
      const verdict = checkInVerdict(b, todayIn(b?.tz ?? 'Africa/Cairo', get().now()))
      if (!b) return { verdict }
      return { verdict, booking: verdict === 'ok' ? applyEvent(b.id, { type: 'check-in' }, 'reception') : b }
    },

    async receiptUrl(bookingId) {
      return get().bookings[bookingId]?.payment?.receiptImage ?? null
    },

    async staffManageToken(id) { return get().bookings[id]?.manageToken ?? '' },
    // Prototype: no real email; recording the send is the simulation.
    async queueTicketEmail(id) { applyEvent(id, { type: 'mark-sent', via: 'email' }, get().staffSession?.role ?? get().role); return 'sent' },
    async publicMetadata() {
      return getConsultants().map(c => ({ consultantId: c.id, formats: getRules(c.id).formats, listed: !c.hidden, ...publicTotals(Object.values(get().bookings), c.id, get().now(), demoStats[c.id]) }))
    },
    async consultantReviews(consultantId) {
      const list = Object.values(get().reviews).filter(r => r.consultantId === consultantId && !r.hidden && r.status === 'approved').sort((a, b) => b.at - a.at)
      const average = list.length ? Math.round((list.reduce((n, r) => n + r.rating, 0) / list.length) * 10) / 10 : null
      return { average, count: list.length, reviews: list.slice(0, 20).map(r => ({ rating: r.rating, comment: r.comment, name: r.name, at: r.at })) }
    },
    async getReview(token) {
      const r = get().reviews[mustFind(token).id]
      if (!r) return null
      return { rating: r.rating, comment: r.comment, name: r.name, at: r.at }
    },
    async submitReview(token, rating, comment) {
      const b = mustFind(token)
      if (b.status !== 'completed' || get().reviews[b.id]) throw new RepoError('INVALID_TRANSITION')
      const text = comment.trim()
      if (!Number.isInteger(rating) || rating < 1 || rating > 5 || text.length > 500) throw new RepoError('INVALID_INPUT')
      const review = { rating, comment: text, name: b.customer.name.trim().split(/\s+/)[0] || 'Customer', at: get().now() }
      useAppStore.setState(s => ({ reviews: { ...s.reviews, [b.id]: { ...review, consultantId: b.consultantId, status: 'pending' } } }))
      get().addAudit({ actor: 'customer', action: 'reviewed', bookingRef: b.reference, to: String(rating) })
      return review
    },
    async saveAssessment(token, a) {
      const b = mustFind(token)
      if (!['reserved', 'on-hold'].includes(b.status)) throw new RepoError('INVALID_TRANSITION')
      if (get().assessments[b.id]) throw new RepoError('ALREADY_EXISTS')
      useAppStore.setState(s => ({ assessments: { ...s.assessments, [b.id]: a } }))
    },
    async myAssessment(token) { return get().assessments[mustFind(token).id] ?? null },
    async markAssessmentSent(bookingId) {
      const session = get().staffSession
      const b = get().bookings[bookingId]
      const isAdmin = session?.role === 'admin'
      if (!isAdmin && (session?.role !== 'consultant' || !b || b.consultantId !== session.consultantId)) throw new RepoError('FORBIDDEN')
      if (!b) throw new RepoError('NOT_FOUND')
      if (b.assessmentSentAt) return b.assessmentSentAt
      const at = get().now()
      useAppStore.setState(s => ({ bookings: { ...s.bookings, [bookingId]: { ...b, assessmentSentAt: at } } }))
      get().addAudit({ actor: isAdmin ? 'admin' : 'consultant', action: 'assessment-sent', bookingRef: b.reference, to: 'whatsapp' })
      return at
    },
    async staffSaveAssessment(bookingId, a) {
      const session = get().staffSession
      const b = get().bookings[bookingId]
      const isAdmin = session?.role === 'admin'
      if (!isAdmin && (session?.role !== 'consultant' || !b || b.consultantId !== session.consultantId)) throw new RepoError('FORBIDDEN')
      if (!b) throw new RepoError('NOT_FOUND')
      useAppStore.setState(s => ({ assessments: { ...s.assessments, [bookingId]: a } }))
      get().addAudit({ actor: isAdmin ? 'admin' : 'consultant', action: 'assessment-saved', bookingRef: b.reference, to: a.program })
    },
    async staffAssessments() {
      const session = get().staffSession
      if (!session || !['admin', 'consultant', 'sales'].includes(session.role)) return {}
      const code = session.role === 'sales' ? localReferralCode(session.username) : null
      return Object.fromEntries(Object.entries(get().assessments).filter(([id]) => session.role === 'admin'
        || (session.role === 'consultant' && get().bookings[id]?.consultantId === session.consultantId)
        || (code !== null && get().bookings[id]?.salesCode === code)))
    },
    // Prototype: one code per username, so links are stable between sessions.
    async myReferralCode() { return localReferralCode(get().staffSession?.username ?? '') },
    async setReferral(token, code) {
      const b = mustFind(token)
      if (!['reserved', 'on-hold'].includes(b.status) || b.salesCode) return false
      if (!/^[a-z0-9]{8}$/.test(code)) return false
      const account = staffAccounts.find(a => localReferralCode(a.username) === code)
      useAppStore.setState(s => ({ bookings: { ...s.bookings, [b.id]: { ...b, salesCode: code, salesName: account?.username ?? `Sales ${code}` } } }))
      return true
    },
    async reassignConsultant(id, consultantId, reason) {
      const b = get().bookings[id]
      if (!b) throw new RepoError('NOT_FOUND')
      const why = reason.trim()
      if (why.length < 3 || why.length > 300) throw new RepoError('INVALID_INPUT')
      if (!['confirmed', 'checked-in'].includes(b.status)) throw new RepoError('INVALID_TRANSITION')
      const target = consultants.find(c => c.id === consultantId)
      if (!target || (b.format === 'in-person' && target.branchId !== b.branchId)) throw new RepoError('INVALID_INPUT')
      if (consultantBusy(Object.values(get().bookings), consultantId, b)) throw new SlotTaken()
      if (consultantId === b.consultantId) return b
      const next = { ...b, consultantId, swappedFrom: b.consultantId, swapReason: why }
      useAppStore.setState(s => ({ bookings: { ...s.bookings, [id]: next } }))
      get().addAudit({ actor: get().staffSession?.role ?? 'reception', action: 'consultant-changed', bookingRef: b.reference, from: b.consultantId, to: consultantId, note: why })
      return next
    },
    // Prototype: admin-only consultants aren't enforced locally.
    async adminTestKey() { return 'demo' },
    async readinessRules() { return mergeRules(get().readinessRules) },
    async saveReadinessRules(rules) {
      if (get().staffSession?.role !== 'admin') throw new RepoError('FORBIDDEN')
      useAppStore.setState({ readinessRules: rules })
      get().addAudit({ actor: 'admin', action: 'readiness-rules' })
    },
    async submitReadinessRequest(r) {
      if (!r.name.trim() || !cleanPhone(r.phone) || !r.reasons.length) throw new RepoError('INVALID_INPUT')
      const id = crypto.randomUUID()
      useAppStore.setState(s => ({ readinessRequests: { ...s.readinessRequests, [id]: { ...r, phone: cleanPhone(r.phone) ?? r.phone, id, createdAt: get().now(), status: 'open' } } }))
    },
    async readinessRequests() {
      const session = get().staffSession
      if (session?.role !== 'admin' && !session?.salesManager) throw new RepoError('FORBIDDEN')
      return Object.values(get().readinessRequests).sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open') || b.createdAt - a.createdAt)
    },
    async readinessSalesPeople() {
      const session = get().staffSession
      if (session?.role !== 'admin' && !session?.salesManager) throw new RepoError('FORBIDDEN')
      return staffAccounts.filter(a => a.role === 'sales').map(a => ({ id: a.username, name: a.username }))
    },
    async assignReadinessRequest(id, salesPersonId) {
      const session = get().staffSession
      if (session?.role !== 'admin' && !session?.salesManager) throw new RepoError('FORBIDDEN')
      const r = get().readinessRequests[id]
      if (!r) throw new RepoError('NOT_FOUND')
      const person = salesPersonId ? staffAccounts.find(a => a.role === 'sales' && a.username === salesPersonId) : undefined
      if (salesPersonId && !person) throw new RepoError('INVALID_INPUT')
      useAppStore.setState(s => ({ readinessRequests: { ...s.readinessRequests, [id]: { ...r, assignedTo: person?.username, assignedName: person?.username } } }))
    },
    async setReadinessStatus(id, status) {
      const session = get().staffSession
      if (session?.role !== 'admin' && !session?.salesManager) throw new RepoError('FORBIDDEN')
      const r = get().readinessRequests[id]
      if (!r) throw new RepoError('NOT_FOUND')
      useAppStore.setState(s => ({ readinessRequests: { ...s.readinessRequests, [id]: { ...r, status, handledAt: status === 'open' ? undefined : get().now() } } }))
    },
    async setConsultantListed(id, listed) {
      if (!consultants.some(c => c.id === id)) throw new RepoError('INVALID_INPUT')
      editConsultant(id, { hidden: !listed })
    },
    async staffReviews() {
      return Object.entries(get().reviews)
        .map(([bookingId, r]) => ({ ...r, id: bookingId, hidden: !!r.hidden, status: r.status ?? 'pending', bookingRef: get().bookings[bookingId]?.reference }))
        .sort((a, b) => b.at - a.at)
    },
    async setReviewHidden(id, hidden) {
      const r = get().reviews[id]
      if (!r) throw new RepoError('NOT_FOUND')
      useAppStore.setState(s => ({ reviews: { ...s.reviews, [id]: { ...r, hidden } } }))
      get().addAudit({ actor: 'admin', action: hidden ? 'review-hidden' : 'review-shown', bookingRef: get().bookings[id]?.reference, to: String(r.rating) })
    },
    async myReviews() {
      const session = get().staffSession
      if (session?.role !== 'consultant' || !session.consultantId) throw new RepoError('FORBIDDEN')
      return Object.entries(get().reviews)
        .filter(([, r]) => r.consultantId === session.consultantId)
        .map(([bookingId, r]) => ({ rating: r.rating, comment: r.comment, name: r.name, at: r.at, id: bookingId, status: r.status ?? 'pending', bookingRef: get().bookings[bookingId]?.reference }))
        .sort((a, b) => b.at - a.at)
    },
    async setReviewStatus(id, status) {
      const session = get().staffSession
      const isAdmin = session?.role === 'admin'
      if (!isAdmin && (session?.role !== 'consultant' || !session.consultantId)) throw new RepoError('FORBIDDEN')
      const r = get().reviews[id]
      if (!r) throw new RepoError('NOT_FOUND')
      if (!isAdmin && r.consultantId !== session!.consultantId) throw new RepoError('FORBIDDEN')
      if ((r.status ?? 'pending') === status) return
      useAppStore.setState(s => ({ reviews: { ...s.reviews, [id]: { ...r, status } } }))
      get().addAudit({ actor: isAdmin ? 'admin' : 'consultant', action: `review-${status}`, bookingRef: get().bookings[id]?.reference, from: r.status ?? 'pending', to: status })
    },
    async staffDecisions() { return get().decisions },
    async saveDecision({ id, ...d }) {
      if (!d.question.en.trim() && !d.question.ar.trim()) throw new RepoError('INVALID_INPUT')
      if (id) {
        if (!get().decisions.some(x => x.id === id)) throw new RepoError('NOT_FOUND')
        useAppStore.setState(s => ({ decisions: s.decisions.map(x => (x.id === id ? { ...d, id } : x)) }))
      } else {
        useAppStore.setState(s => ({ decisions: [...s.decisions, { ...d, id: crypto.randomUUID() }] }))
        get().addAudit({ actor: 'admin', action: 'decision-added', to: d.question.en || d.question.ar })
      }
    },
    async resolveDecision(id) {
      const d = get().decisions.find(x => x.id === id)
      if (!d) throw new RepoError('NOT_FOUND')
      useAppStore.setState(s => ({ decisions: s.decisions.filter(x => x.id !== id) }))
      get().addAudit({ actor: 'admin', action: 'decision-resolved', to: d.question.en || d.question.ar })
    },
    async staffRecords() { return get().records },
    async staffAudit() { return get().audit },
    async videoRoom(who) {
      // Same rules as the video-room edge function, without a video service behind it.
      let b: Booking | undefined
      if ('manageToken' in who) b = byToken(who.manageToken)
      else {
        const s = get().staffSession
        b = get().bookings[who.bookingId]
        if (!s) throw new RepoError('FORBIDDEN')
        if (b && s.role !== 'admin' && !(s.role === 'consultant' && s.consultantId === b.consultantId)) b = undefined
      }
      if (!b) throw new RepoError('NOT_FOUND')
      if (b.format !== 'online') return { state: 'not-online' }
      if (!['confirmed', 'checked-in'].includes(b.status)) return { state: 'unavailable' }
      const now = get().now()
      const opensAt = Date.parse(b.startIso) - OPENS_BEFORE_MS
      if (now < opensAt) return { state: 'early', opensAt }
      if (now > Date.parse(b.endIso) + CLOSES_AFTER_MS) return { state: 'ended' }
      if ('manageToken' in who && b.status === 'confirmed') applyEvent(b.id, { type: 'check-in' }, 'customer')
      return { state: 'demo' }
    },
    async meetingSummary(bookingId) {
      return get().meetingSummaries[ownBooking(bookingId).id] ?? null
    },
    async generateMeetingSummary(bookingId) {
      // The prototype has no call to transcribe: it writes a sample in the consultation's language.
      const b = ownBooking(bookingId)
      const record = { summary: demoSummary(b), status: 'draft' as const, generatedAt: get().now() }
      useAppStore.setState(s => ({ meetingSummaries: { ...s.meetingSummaries, [b.id]: record } }))
      return record
    },
    async publishMeetingSummary(bookingId, summary) {
      const b = ownBooking(bookingId)
      const before = get().meetingSummaries[b.id]
      const record = { summary, status: 'published' as const, generatedAt: before?.generatedAt ?? get().now(), publishedAt: get().now() }
      useAppStore.setState(s => ({ meetingSummaries: { ...s.meetingSummaries, [b.id]: record } }))
      get().addAudit({ actor: get().staffSession?.role === 'admin' ? 'admin' : 'consultant', action: 'summary-published', bookingRef: b.reference })
    },
    async myMeetingSummary(token) {
      const r = get().meetingSummaries[mustFind(token).id]
      return r?.status === 'published' ? r.summary : null
    },
    async recordingLink(bookingId) { ownBooking(bookingId); return null },
    async adminDeleteBooking(id) {
      if (get().staffSession?.role !== 'admin') throw new RepoError('FORBIDDEN')
      const b = get().bookings[id]
      if (!b) throw new RepoError('NOT_FOUND')
      useAppStore.setState(s => {
        const drop = <T,>(m: Record<string, T>) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== id))
        return { bookings: drop(s.bookings), records: drop(s.records), assessments: drop(s.assessments), meetingSummaries: drop(s.meetingSummaries) }
      })
      get().addAudit({ actor: 'admin', action: 'booking-deleted', from: b.status, note: `${b.reference} · ${b.customer.name}` })
    },
    async consultantProfiles() {
      const o = get().consultantOverrides
      return Object.fromEntries(Object.entries(o).map(([id, c]) => [id, { bio: c.bio, photo: c.photo, videoUrl: c.videoUrl, videoPoster: c.videoPoster }]))
    },
    async saveConsultantProfile(id, p) {
      if (get().staffSession?.role !== 'admin') throw new RepoError('FORBIDDEN')
      if (!consultants.some(c => c.id === id)) throw new RepoError('INVALID_INPUT')
      // Same contract as the database: null means "the built-in value".
      const base = getConsultant(id, {})
      const before = getConsultant(id)
      const next = { bio: p.bio ?? base.bio, photo: p.photo ?? base.photo, videoUrl: p.videoUrl ?? base.videoUrl, videoPoster: p.videoUrl ? (p.videoPoster ?? undefined) : base.videoPoster }
      const changed = [
        JSON.stringify(before.bio ?? null) !== JSON.stringify(next.bio ?? null) && 'bio',
        (before.photo ?? null) !== (next.photo ?? null) && 'photo',
        (before.videoUrl ?? null) !== (next.videoUrl ?? null) && 'video',
      ].filter(Boolean).join(', ')
      useAppStore.setState(s => ({ consultantOverrides: { ...s.consultantOverrides, [id]: { ...s.consultantOverrides[id], ...next } } }))
      get().addAudit({ actor: 'admin', action: 'consultant-edited', to: id, note: changed || undefined })
    },
    async uploadConsultantMedia(_id, file) {
      if (get().staffSession?.role !== 'admin') throw new RepoError('FORBIDDEN')
      // Prototype: the file stays in this browser tab only.
      return URL.createObjectURL(file)
    },
    async staffSchedules() { return Object.fromEntries(consultants.map(c => [c.id, getRules(c.id)])) },
    async saveSchedule(id, patch) {
      editSchedule(id, patch)
    },
    async addDayOff(id, from, to) {
      if (!from || !to || to < from) throw new RepoError('INVALID_INPUT')
      editSchedule(id, { leave: [...getRules(id).leave, { from, to }] })
    },
    async removeDayOff(id, dayOffId) {
      const r = getRules(id)
      const [kind, from, to] = dayOffId.split(':')
      if (kind === 'leave') editSchedule(id, { leave: r.leave.filter(l => !(l.from === from && l.to === to)) })
      else if (kind === 'holiday') editSchedule(id, { holidays: r.holidays.filter(d => d !== from) })
      else if (kind === 'unavailable') editSchedule(id, { unavailable: r.unavailable.filter(d => d !== from) })
      else throw new RepoError('NOT_FOUND')
    },
    async setSlotBlocked(id, startIso, blocked) {
      const iso = new Date(startIso).toISOString()
      const now = getRules(id).blocked ?? []
      editSchedule(id, { blocked: blocked ? [...new Set([...now, iso])] : now.filter(x => x !== iso) })
    },
    async saveNextStep(id, nextStep, program, refundReason) {
      const b = get().bookings[id]
      if (!b) throw new RepoError('NOT_FOUND')
      if (!['checked-in', 'completed'].includes(b.status)) throw new RepoError('INVALID_TRANSITION')
      const reason = refundReason?.trim()
      if (nextStep === 'refund' && (!reason || reason.length > 500)) throw new RepoError('INVALID_INPUT')
      const prev = get().records[id] ?? { notes: '', outcome: 'none' as const }
      const changedStep = prev.nextStep !== nextStep
      const next = {
        ...prev, nextStep, recommendedProgram: program ?? (b.customer.program || undefined), refundReason: nextStep === 'refund' ? reason : undefined,
        nextStepAt: changedStep ? get().now() : prev.nextStepAt ?? get().now(),
        followedUpAt: changedStep ? undefined : prev.followedUpAt, financeHandledAt: changedStep ? undefined : prev.financeHandledAt,
      }
      useAppStore.setState(s => ({ records: { ...s.records, [id]: next } }))
      get().addAudit({ actor: get().staffSession?.role ?? get().role, action: 'next-step', bookingRef: b.reference, to: nextStep })
    },
    async markFollowedUp(id) {
      const r = get().records[id]
      if (r?.nextStep !== 'thinking') throw new RepoError('INVALID_TRANSITION')
      useAppStore.setState(s => ({ records: { ...s.records, [id]: { ...r, followedUpAt: get().now() } } }))
    },
    async financeNextSteps() {
      const { records, bookings } = get()
      return Object.entries(records)
        .filter(([id, r]) => (r.nextStep === 'contract' || r.nextStep === 'refund') && bookings[id])
        .map(([id, r]) => {
          const b = bookings[id]
          return { bookingId: id, reference: b.reference, name: b.customer.name, phone: b.customer.phone, consultantId: b.consultantId,
            nextStep: r.nextStep as 'contract' | 'refund', program: r.recommendedProgram, at: r.nextStepAt ?? 0, handledAt: r.financeHandledAt,
            refundReason: r.refundReason, salesName: b.salesName, paid: b.price }
        })
        .sort((a, b) => Number(!!a.handledAt) - Number(!!b.handledAt) || b.at - a.at)
    },
    async markFinanceHandled(id) {
      const r = get().records[id]
      if (!r || (r.nextStep !== 'contract' && r.nextStep !== 'refund') || r.financeHandledAt) throw new RepoError('INVALID_TRANSITION')
      useAppStore.setState(s => ({ records: { ...s.records, [id]: { ...r, financeHandledAt: get().now() } } }))
    },
    async messageTemplates() { return get().messageTemplates },
    async saveMessageTemplate(key, lang, body) {
      if (get().staffSession?.role !== 'admin') throw new RepoError('FORBIDDEN')
      const text = body?.trim() ? body : null
      if (text && text.length > MAX_TEMPLATE_LENGTH) throw new RepoError('INVALID_INPUT')
      useAppStore.setState(s => {
        const own = { ...s.messageTemplates[key] }
        if (text) own[lang] = text
        else delete own[lang]
        return { messageTemplates: { ...s.messageTemplates, [key]: own } }
      })
      get().addAudit({ actor: 'admin', action: 'message-template', to: `${key}:${lang}` })
    },
    async freeSlots(fromDate, days) {
      const out: { consultantId: string; format: Format; startIso: string }[] = []
      for (const c of consultants) for (let i = 0; i < days; i++) {
        const date = addDays(fromDate, i)
        for (const format of getRules(c.id).formats) for (const s of slotsFor(c.id, date, format)) out.push({ consultantId: c.id, format, startIso: s.startIso })
      }
      return out.sort((a, b) => a.consultantId.localeCompare(b.consultantId) || a.startIso.localeCompare(b.startIso))
    },
    async saveRecord(id, record) {
      // Keep the next step and follow-up fields; notes and outcome are saved separately.
      useAppStore.setState(s => ({ records: { ...s.records, [id]: { ...s.records[id], ...record } } }))
      get().addAudit({ actor: get().role, action: 'edited', bookingRef: get().bookings[id]?.reference, to: record.outcome })
    },
    subscribe(onChange) {
      return useAppStore.subscribe(onChange)
    },
  }
}

/** Prototype EasyKash: a successful payment confirms the booking, as the signed callback does live. */
export function completeDemoPayment(token: string) {
  const b = mustFind(token)
  if (b.status !== 'reserved') return b
  submitPayment(b.id, { method: 'easykash', txnRef: `EK-DEMO-${b.reference.slice(-4)}` })
  return applyEvent(b.id, { type: 'verify' }, 'system')
}

/** Test helper: back to an empty, seeded store. */
export function resetLocalRepo() {
  useAppStore.setState({
    bookings: {}, audit: [], timeOffsetMs: 0, seeded: true, scheduleOverrides: {}, draft: emptyDraft(), lastCustomerBookingId: null,
  })
}
