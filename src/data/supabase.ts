import type { SupabaseClient } from '@supabase/supabase-js'
import type { BackendClients } from '../lib/supabase'
import type { Booking, CustomerDetails, Format, AuditEntry, PendingDecision, Review, StaffReview } from '../domain/types'
import type { ScheduleRules } from '../domain/availability'
import { dateInZone, addDays } from '../domain/time'
import { consultationMinutes } from '../config/booking'
import { adminTestKeyOnThisDevice } from './adminTest'
import type { MessageTemplateKey, MessageTemplates } from '../config/messageTemplates'
import { HoldExpired, RepoError, SlotTaken, type BookingRepo, type PaymentInput } from './types'
import type { ConsultationRecord } from '../store/useAppStore'
import type { StoredAssessment } from '../assessment/questions'
import { mergeRules } from '../assessment/readiness'

type Row = Record<string, any> // JSON returned by RPCs and explicitly selected table columns.
export const STAFF_BOOKING_COLUMNS = 'id,reference,consultant_id,branch_id,format,starts_at,ends_at,tz,price_amount,price_currency,customer_name,customer_phone,customer_email,channel,lang,program,note,status,hold_expires_at,reject_reason,meeting_url,checked_in_at,ticket_sent_at,ticket_sent_via,sales_name,swap_reason,swapped_from,created_at'
const mapReview = (r: Row): Review => ({ rating: Number(r.rating), comment: r.comment ?? '', name: r.name, at: Date.parse(r.created_at) })
const ms = (v: unknown) => v == null ? undefined : Date.parse(String(v))
export function mapBooking(r: Row, audience: 'customer' | 'staff' = 'customer'): Booking {
  const c = r.customer ?? { name: r.customer_name, phone: r.customer_phone, email: r.customer_email, channel: r.channel, lang: r.lang, program: r.program, note: r.note }
  const p = r.payment
  const meetingUrl = typeof r.meeting_url === 'string' && /^https:\/\//.test(r.meeting_url) ? r.meeting_url : undefined
  return {
    id: r.id, reference: r.reference, qrToken: audience === 'customer' ? r.qr_token ?? '' : '', manageToken: audience === 'customer' ? r.manage_token ?? '' : '',
    consultantId: r.consultant_id, branchId: r.branch_id, format: r.format,
    durationMin: r.duration_min ?? (Date.parse(r.ends_at) - Date.parse(r.starts_at)) / 60000,
    startIso: new Date(r.starts_at).toISOString(), endIso: new Date(r.ends_at).toISOString(), tz: r.tz,
    price: { amount: r.price_amount, currency: r.price_currency }, status: r.status,
    customer: { name: c.name, phone: c.phone, email: c.email ?? '', channel: c.channel, consultationLang: c.lang, program: c.program ?? '', note: c.note ?? '' } as CustomerDetails,
    holdExpiresAt: ms(r.hold_expires_at) ?? 0, createdAt: ms(r.created_at)!, rejectReason: r.reject_reason ?? undefined,
    checkedInAt: ms(r.checked_in_at), ticketSentAt: ms(r.ticket_sent_at), ticketSentVia: r.ticket_sent_via ?? undefined, meetingUrl,
    salesName: r.sales_name ?? undefined, swapReason: r.swap_reason ?? undefined, swappedFrom: r.swapped_from ?? undefined,
    payment: p ? { method: p.method, txnRef: p.txn_ref, submittedAt: ms(p.submitted_at)!, hasReceipt: p.has_receipt ?? !!p.receipt_path, receiptPath: p.receipt_path ?? undefined } : undefined,
  }
}

export function rpcFailure(error: { message?: string; code?: string }): Error {
  const code = error.message?.match(/SLOT_TAKEN|HOLD_EXPIRED|FORBIDDEN|RATE_LIMITED|INVALID_INPUT|INVALID_TRANSITION|NOT_FOUND|UPLOAD_FAILED|PAYMENT_UNAVAILABLE|NOT_CONFIGURED/)?.[0]
    ?? (['42501', 'PGRST301', 'PGRST302'].includes(error.code ?? '') ? 'FORBIDDEN' : 'NETWORK')
  if (code === 'SLOT_TAKEN' || error.code === '23P01') return new SlotTaken()
  if (code === 'HOLD_EXPIRED') return new HoldExpired()
  return new RepoError(code, { cause: error })
}
async function allRows(q: { range: (from: number, to: number) => PromiseLike<{ data: any; error: any }> }): Promise<Row[]> {
  const rows: Row[] = []
  for (let offset = 0; ; offset += 500) {
    const page = await result<Row[]>(q.range(offset, offset + 499))
    rows.push(...page)
    if (page.length < 500) return rows
  }
}
async function result<T = any>(request: PromiseLike<{ data: any; error: any }>): Promise<T> {
  let response
  try { response = await request } catch (e) { throw new RepoError('NETWORK', { cause: e }) }
  if (response.error) throw rpcFailure(response.error)
  return response.data
}
export async function receiptBlob(p: PaymentInput): Promise<Blob | undefined> {
  if (!p.receiptImage) return p.receipt
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/.exec(p.receiptImage)
  if (!match) throw new RepoError('INVALID_INPUT')
  const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0))
  return new Blob([bytes], { type: match[1] })
}

export function createSupabaseRepo(clients: BackendClients): BookingRepo {
  const { customer, staff } = clients
  const listeners = new Set<() => void>()
  let channel: ReturnType<SupabaseClient['channel']> | undefined
  const connectionListeners = new Set<(state: 'connected' | 'reconnecting') => void>()
  let connection: 'connected' | 'reconnecting' | undefined
  const setConnection = (state: 'connected' | 'reconnecting') => { connection = state; connectionListeners.forEach(fn => fn(state)) }
  const changed = () => listeners.forEach(fn => fn())
  const customerBooking = async (rpc: string, args: Row) => {
    const row = await result<Row>(customer.rpc(rpc, args))
    changed()
    return mapBooking(row)
  }
  const requireStaff = async () => {
    const session = await result(staff.auth.getSession())
    if (!session.session) throw new RepoError('FORBIDDEN')
  }
  const staffRow = async (id: string) => {
    await requireStaff()
    const row = await result<Row>(staff.from('bookings').select(STAFF_BOOKING_COLUMNS).eq('id', id).single())
    const payments = await result<Row[]>(staff.from('payments').select('method,txn_ref,receipt_path,submitted_at').eq('booking_id', id).order('submitted_at', { ascending: false }).order('created_at', { ascending: false }).order('id').limit(1))
    return mapBooking({ ...row, payment: payments[0] }, 'staff')
  }
  const easykashPay = async (body: Row): Promise<Row> => {
    let response: Response
    try {
      const send = clients.fetch // detached on purpose: a native fetch throws if called as a method
      response = await send(`${clients.url}/functions/v1/easykash-pay`, {
        method: 'POST', headers: { apikey: clients.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
    } catch (e) { throw new RepoError('NETWORK', { cause: e }) }
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw rpcFailure({ message: data.error ?? 'PAYMENT_UNAVAILABLE' })
    return data
  }
  const repo: BookingRepo = {
    async availableSlots(id, date, format, rescheduleToken) {
      const starts = await result<string[]>(customer.rpc(rescheduleToken ? 'reschedule_slots' : 'available_slots', rescheduleToken
        ? { p_manage_token: rescheduleToken, p_date: date }
        : { p_consultant_id: id, p_date: date, p_format: format }))
      return (starts ?? []).map(s => ({ startIso: new Date(s).toISOString(), endIso: new Date(Date.parse(s) + consultationMinutes * 60000).toISOString() }))
    },
    async reserve(d) {
      if (d.supersedes) {
        // A customer may reuse their own hold. IDs never grant customer authority.
        const held = holds.get(d.supersedes)
        if (held) {
          const b = await repo.getByManageToken(held.manageToken)
          if (b?.status === 'reserved' && b.holdExpiresAt > Date.now()) {
            if (b.startIso === new Date(d.startIso).toISOString() && b.format === d.format && b.consultantId === d.consultantId) return held
            await repo.cancel(held.manageToken)
          }
        }
      }
      const r = await result<Row>(customer.rpc('reserve_slot', { p_consultant_id: d.consultantId, p_format: d.format, p_starts_at: d.startIso, p_details: { ...d.details, lang: d.details.consultationLang, testKey: adminTestKeyOnThisDevice() } }))
      const reservation = { bookingId: r.booking_id, reference: r.reference, manageToken: r.manage_token, holdExpiresAt: ms(r.hold_expires_at)! }
      holds.set(reservation.bookingId, reservation)
      changed()
      return reservation
    },
    async submitPayment(token, p) {
      const blob = await receiptBlob(p)
      let path: string | null = null
      if (blob) {
        if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(blob.type) || blob.size > 5 * 1024 * 1024) throw new RepoError('INVALID_INPUT')
        let response: Response
        try {
          const send = clients.fetch // detached on purpose: a native fetch throws if called as a method
          response = await send(`${clients.url}/functions/v1/create-receipt-upload`, {
            method: 'POST', headers: { apikey: clients.key, 'Content-Type': 'application/json' },
            body: JSON.stringify({ manage_token: token, mime_type: blob.type }),
          })
        } catch (e) { throw new RepoError('NETWORK', { cause: e }) }
        const capability = await response.json().catch(() => { throw new RepoError('UPLOAD_FAILED') })
        if (!response.ok) throw rpcFailure({ message: capability.error ?? capability.code ?? 'UPLOAD_FAILED' })
        if (capability.bucket !== 'receipts' || !capability.path || !capability.token) throw new RepoError('UPLOAD_FAILED')
        // Storage errors carry no RPC code; only a rejected capability is distinguishable from a failed upload.
        await result(customer.storage.from(capability.bucket).uploadToSignedUrl(capability.path, capability.token, blob, { upsert: false, contentType: blob.type }))
          .catch(e => { throw e instanceof RepoError && e.code === 'FORBIDDEN' ? e : new RepoError('UPLOAD_FAILED', { cause: e }) })
        path = capability.path
      }
      return customerBooking('submit_payment', { p_manage_token: token, p_method: p.method, p_txn_ref: p.txnRef, p_receipt_path: path })
    },
    async startOnlinePayment(token, currency) {
      const data = await easykashPay({ action: 'start', manage_token: token, currency })
      if (typeof data.redirectUrl !== 'string' || !/^https:\/\/(www\.)?easykash\.net\//.test(data.redirectUrl)) throw new RepoError('PAYMENT_UNAVAILABLE')
      return data.redirectUrl
    },
    async checkOnlinePayment(token) {
      await easykashPay({ action: 'check', manage_token: token })
      changed()
    },
    async getByManageToken(token) {
      const r = await result<Row | null>(customer.rpc('get_booking', { p_manage_token: token }))
      return r ? mapBooking(r) : null
    },
    async find(reference, phone) { return result(customer.rpc('find_booking', { p_reference: reference, p_phone: phone })) },
    cancel: token => customerBooking('cancel_booking', { p_manage_token: token }),
    reschedule: (token, start) => customerBooking('reschedule_booking', { p_manage_token: token, p_starts_at: start }),
    async staffList({ statuses, consultantId, date }) {
      await requireStaff()
      let q = staff.from('bookings').select(STAFF_BOOKING_COLUMNS).order('starts_at', { ascending: true }).order('id')
      if (statuses) q = q.in('status', statuses)
      if (consultantId) q = q.eq('consultant_id', consultantId)
      // PostgREST's default 1000-row cap must never silently truncate the staff workspace.
      const rows = await allRows(q)
      const payments = await allRows(staff.from('payments').select('booking_id,method,txn_ref,receipt_path,submitted_at').order('submitted_at', { ascending: false }).order('created_at', { ascending: false }).order('id'))
      const latest = new Map<string, Row>()
      for (const p of payments) if (!latest.has(p.booking_id)) latest.set(p.booking_id, p)
      return rows.map(r => mapBooking({ ...r, payment: latest.get(r.id) }, 'staff')).filter(b => !date || dateInZone(b.startIso, b.tz) === date)
    },
    async staffTransition(id, event) {
      await requireStaff()
      await result<Row>(staff.rpc('staff_transition', { p_booking_id: id, p_event: event.type, p_reason: 'reason' in event ? event.reason : event.type === 'mark-sent' ? event.via : null }))
      changed()
      return staffRow(id)
    },
    async checkIn(code) {
      await requireStaff()
      const r = await result<Row>(staff.rpc('check_in', { p_code: code }))
      // RPC deliberately returns a minimal row. Fetch only the current caller's permitted fields.
      const booking = r.booking?.id ? await staffRow(r.booking.id) : undefined
      changed()
      return { verdict: r.verdict, booking }
    },
    async receiptUrl(id) {
      await requireStaff()
      const role = await result<string | null>(staff.rpc('current_staff_role'))
      if (role !== 'finance' && role !== 'admin') throw new RepoError('FORBIDDEN')
      const payments = await result<Row[]>(staff.from('payments').select('receipt_path').eq('booking_id', id).order('submitted_at', { ascending: false }).limit(1))
      if (!payments[0]?.receipt_path) return null
      const r = await result(staff.storage.from('receipts').createSignedUrl(payments[0].receipt_path, 60))
      return r.signedUrl
    },
    async staffManageToken(id) { await requireStaff(); return result(staff.rpc('staff_manage_token', { p_booking_id: id })) },
    async queueTicketEmail(id) { await requireStaff(); const status = await result<'pending' | 'sending' | 'sent' | 'failed'>(staff.rpc('staff_queue_ticket_email', { p_booking_id: id })); changed(); return status },
    async publicMetadata() {
      const rows = await result<Row[]>(customer.rpc('public_consultant_metadata'))
      return rows.map(r => ({ consultantId: r.consultant_id, formats: r.formats as Format[], total: Number(r.total), thisMonth: Number(r.this_month), listed: r.listed !== false }))
    },
    async consultantReviews(consultantId) {
      const r = await result<Row>(customer.rpc('public_consultant_reviews', { p_consultant_id: consultantId }))
      return { average: r.average == null ? null : Number(r.average), count: Number(r.count ?? 0), reviews: (r.reviews ?? []).map(mapReview) }
    },
    async getReview(token) {
      const r = await result<Row | null>(customer.rpc('get_review', { p_manage_token: token }))
      return r ? mapReview(r) : null
    },
    async submitReview(token, rating, comment) {
      return mapReview(await result<Row>(customer.rpc('submit_review', { p_manage_token: token, p_rating: rating, p_comment: comment })))
    },
    async saveAssessment(token, a) {
      await result(customer.rpc('save_assessment', { p_manage_token: token, p_program: a.program, p_answers: a.answers }))
    },
    async staffAssessments() {
      await requireStaff()
      const rows = await allRows(staff.from('booking_assessments').select('booking_id,program,answers').order('booking_id'))
      return Object.fromEntries(rows.map(r => [r.booking_id, { program: r.program, answers: r.answers ?? {} }])) as Record<string, StoredAssessment>
    },
    async myReferralCode() { await requireStaff(); return result<string>(staff.rpc('my_referral_code')) },
    async setReferral(token, code) { return result<boolean>(customer.rpc('set_booking_referral', { p_manage_token: token, p_code: code })) },
    async reassignConsultant(id, consultantId, reason) {
      await requireStaff()
      await result(staff.rpc('staff_reassign_consultant', { p_booking_id: id, p_consultant_id: consultantId, p_reason: reason.trim() }))
      changed()
      return staffRow(id)
    },
    async adminTestKey() { await requireStaff(); return result<string>(staff.rpc('admin_test_key')) },
    async readinessRules() {
      // The booking form must never get stuck on this: no rules from the server means the defaults.
      return mergeRules(await result<unknown>(customer.rpc('public_readiness_rules')).catch(() => null))
    },
    async saveReadinessRules(rules) {
      await requireStaff()
      await result(staff.rpc('admin_save_readiness_rules', { p_rules: rules }))
    },
    async submitReadinessRequest(r) {
      await result(customer.rpc('submit_readiness_request', { p: {
        name: r.name, phone: r.phone, email: r.email, lang: r.lang, program: r.program, destination: r.destination ?? '',
        consultantId: r.consultantId, format: r.format, wantedAt: r.wantedIso, score: r.score, scoreMax: r.scoreMax,
        reasons: r.reasons, answers: r.answers,
      } }))
    },
    async readinessRequests() {
      await requireStaff()
      const rows = await result<Row[]>(staff.rpc('readiness_request_list'))
      return (rows ?? []).map(r => ({
        id: r.id, createdAt: ms(r.created_at)!, name: r.customer_name, phone: r.customer_phone, email: r.customer_email ?? '', lang: r.lang,
        program: r.program, destination: r.destination ?? undefined, consultantId: r.consultant_id ?? '', format: r.format ?? 'online',
        wantedIso: r.wanted_at ?? '', score: r.score == null ? null : Number(r.score), scoreMax: r.score_max == null ? null : Number(r.score_max),
        reasons: Array.isArray(r.reasons) ? r.reasons : [], answers: r.answers ?? {}, status: r.status, handledAt: ms(r.handled_at),
      }))
    },
    async setReadinessStatus(id, status) {
      await requireStaff()
      await result(staff.rpc('set_readiness_status', { p_id: id, p_status: status }))
    },
    async setConsultantListed(id, listed) {
      await requireStaff()
      await result(staff.rpc('admin_set_consultant_listed', { p_consultant_id: id, p_listed: listed }))
      changed()
    },
    async staffReviews() {
      await requireStaff()
      const rows = await allRows(staff.from('consultant_reviews').select('id,booking_id,consultant_id,rating,comment,reviewer_name,hidden,created_at').order('created_at', { ascending: false }).order('id'))
      const ids = [...new Set(rows.map(r => r.booking_id))]
      const refs = ids.length ? await result<Row[]>(staff.from('bookings').select('id,reference').in('id', ids)) : []
      const byId = new Map(refs.map(r => [r.id, r.reference]))
      return rows.map(r => ({ ...mapReview({ ...r, name: r.reviewer_name }), id: r.id, consultantId: r.consultant_id, bookingRef: byId.get(r.booking_id), hidden: !!r.hidden })) as StaffReview[]
    },
    async setReviewHidden(id, hidden) {
      await requireStaff()
      await result(staff.rpc('staff_set_review_hidden', { p_review_id: id, p_hidden: hidden }))
      changed()
    },
    async staffDecisions() {
      await requireStaff()
      const rows = await allRows(staff.from('pending_decisions').select('id,area_en,area_ar,question_en,question_ar,owner,position').order('position').order('id'))
      return rows.map(r => ({ id: r.id, area: { en: r.area_en, ar: r.area_ar }, question: { en: r.question_en, ar: r.question_ar }, owner: r.owner ?? '' })) as PendingDecision[]
    },
    async saveDecision(d) {
      await requireStaff()
      await result(staff.rpc('staff_save_decision', {
        p_id: d.id ?? null, p_area_en: d.area.en, p_area_ar: d.area.ar, p_question_en: d.question.en, p_question_ar: d.question.ar, p_owner: d.owner,
      }))
    },
    async resolveDecision(id) {
      await requireStaff()
      await result(staff.rpc('staff_resolve_decision', { p_id: id }))
    },
    async staffRecords() {
      await requireStaff()
      const rows = await allRows(staff.from('consultation_records').select('booking_id,notes,outcome,next_step,recommended_program,next_step_at,followed_up_at,finance_handled_at,refund_reason').order('booking_id'))
      return Object.fromEntries(rows.map(r => [r.booking_id, {
        notes: r.notes ?? '', outcome: r.outcome ?? 'none', nextStep: r.next_step ?? undefined, recommendedProgram: r.recommended_program ?? undefined, refundReason: r.refund_reason ?? undefined,
        nextStepAt: ms(r.next_step_at), followedUpAt: ms(r.followed_up_at), financeHandledAt: ms(r.finance_handled_at),
      }])) as Record<string, ConsultationRecord>
    },
    async saveNextStep(id, nextStep, program, refundReason) {
      await requireStaff()
      await result(staff.rpc('save_next_step', { p_booking_id: id, p_next_step: nextStep, p_program: program, p_refund_reason: nextStep === 'refund' ? refundReason ?? '' : null }))
      changed()
    },
    async markFollowedUp(id) {
      await requireStaff()
      await result(staff.rpc('mark_followed_up', { p_booking_id: id }))
      changed()
    },
    async financeNextSteps() {
      await requireStaff()
      const rows = await result<Row[]>(staff.rpc('finance_next_steps'))
      return (rows ?? []).map(r => ({
        bookingId: r.booking_id, reference: r.reference, name: r.customer_name, phone: r.customer_phone, consultantId: r.consultant_id,
        nextStep: r.next_step, program: r.recommended_program ?? undefined, at: ms(r.next_step_at)!, handledAt: ms(r.handled_at),
        refundReason: r.refund_reason ?? undefined, salesName: r.sales_name ?? undefined,
        paid: { amount: Number(r.price_amount ?? 0), currency: r.price_currency ?? 'EGP' },
      }))
    },
    async markFinanceHandled(id) {
      await requireStaff()
      await result(staff.rpc('finance_mark_handled', { p_booking_id: id }))
      changed()
    },
    async messageTemplates() {
      await requireStaff()
      const rows = await result<Row[]>(staff.from('message_templates').select('key,lang,body'))
      const out: MessageTemplates = {}
      for (const r of rows ?? []) out[r.key as MessageTemplateKey] = { ...out[r.key as MessageTemplateKey], [r.lang]: r.body }
      return out
    },
    async saveMessageTemplate(key, lang, body) {
      await requireStaff()
      await result(staff.rpc('admin_save_message_template', { p_key: key, p_lang: lang, p_body: body }))
      changed()
    },
    async freeSlots(fromDate, days) {
      await requireStaff()
      const rows = await result<Row[]>(staff.rpc('staff_free_slots', { p_from: fromDate, p_days: days }))
      return (rows ?? []).map(r => ({ consultantId: r.consultant_id, format: r.format, startIso: new Date(r.starts_at).toISOString() }))
    },
    async saveRecord(id, record) {
      await requireStaff()
      await result(staff.rpc('save_record', { p_booking_id: id, p_notes: record.notes, p_outcome: record.outcome }))
      changed()
    },
    async staffAudit() {
      await requireStaff()
      const rows = await result<Row[]>(staff.from('audit_log').select('at,actor_kind,booking_id,action,from_value,to_value,note').order('at', { ascending: false }).limit(500))
      const ids = [...new Set(rows.map(r => r.booking_id).filter(Boolean))]
      const refs = ids.length ? await result<Row[]>(staff.from('bookings').select('id,reference').in('id', ids)) : []
      const byId = new Map(refs.map(r => [r.id, r.reference]))
      return rows.map(r => ({ at: ms(r.at)!, actor: r.actor_kind, bookingRef: byId.get(r.booking_id), action: r.action, from: r.from_value ?? undefined, to: r.to_value ?? undefined, note: r.note ?? undefined })) as AuditEntry[]
    },
    async staffSchedules() {
      await requireStaff()
      const schedules = await result<Row[]>(staff.from('schedules').select('consultant_id,weekly,breaks,formats,max_per_day'))
      const exceptions = await allRows(staff.from('schedule_exceptions').select('id,consultant_id,kind,starts_on,ends_on').order('id'))
      const blocks = await allRows(staff.from('slot_blocks').select('consultant_id,starts_at').gte('starts_at', new Date(Date.now() - 864e5).toISOString()).order('starts_at'))
      return Object.fromEntries(schedules.map(r => {
        const ex = exceptions.filter(e => e.consultant_id === r.consultant_id)
        const dates = (kind: string) => ex.filter(e => e.kind === kind).flatMap(e => {
          const out: string[] = []
          for (let d = e.starts_on; d <= e.ends_on; d = addDays(d, 1)) out.push(d)
          return out
        })
        return [r.consultant_id, { consultantId: r.consultant_id, weekly: Object.fromEntries(Array.from({ length: 7 }, (_, d) => [d, r.weekly[d] ?? []])), breaks: r.breaks, formats: r.formats, maxPerDay: r.max_per_day ?? undefined, holidays: dates('holiday'), unavailable: dates('unavailable'), leave: ex.filter(e => e.kind === 'leave').map(e => ({ from: e.starts_on, to: e.ends_on })),
          blocked: blocks.filter(x => x.consultant_id === r.consultant_id).map(x => new Date(x.starts_at).toISOString()),
          exceptions: ex.map(e => ({ id: String(e.id), kind: e.kind, from: e.starts_on, to: e.ends_on })) }]
      })) as Record<string, ScheduleRules>
    },
    async addDayOff(id, from, to) {
      await requireStaff()
      await result(staff.rpc('add_exception', { p_consultant_id: id, p_kind: 'leave', p_starts_on: from, p_ends_on: to }))
      changed()
    },
    async removeDayOff(_id, dayOffId) {
      await requireStaff()
      await result(staff.rpc('remove_exception', { p_id: dayOffId }))
      changed()
    },
    async setSlotBlocked(id, startIso, blocked) {
      await requireStaff()
      await result(staff.rpc('set_slot_blocked', { p_consultant_id: id, p_starts_at: startIso, p_blocked: blocked }))
      changed()
    },
    async saveSchedule(id, patch) {
      const rules = (await repo.staffSchedules())[id]
      if (!rules) throw new RepoError('NOT_FOUND')
      if (patch.weekly || patch.breaks || patch.formats || 'maxPerDay' in patch) {
        const next = { ...rules, ...patch }
        await result(staff.rpc('upsert_schedule', { p_consultant_id: id, p_weekly: next.weekly, p_breaks: next.breaks, p_formats: next.formats, p_max_per_day: next.maxPerDay ?? null }))
      }
      // Append-only exceptions; the current UI adds leave and never removes existing exceptions.
      for (const leave of patch.leave ?? []) if (!rules.leave.some(l => l.from === leave.from && l.to === leave.to)) {
        await result(staff.rpc('add_exception', { p_consultant_id: id, p_kind: 'leave', p_starts_on: leave.from, p_ends_on: leave.to }))
      }
      changed()
    },
    subscribe(fn) {
      listeners.add(fn)
      if (!channel) channel = staff.channel('mg-staff-bookings').on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', select: ['id', 'status'] }, changed).subscribe(status => {
        if (status === 'SUBSCRIBED') setConnection('connected')
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { setConnection('reconnecting'); if (status !== 'CLOSED') changed() }
      })
      return () => {
        listeners.delete(fn)
        if (!listeners.size && channel) { void staff.removeChannel(channel); channel = undefined; connection = undefined }
      }
    },
    onConnection(fn) {
      connectionListeners.add(fn)
      if (connection) fn(connection)
      return () => { connectionListeners.delete(fn) }
    },
  }
  const holds = new Map<string, Awaited<ReturnType<BookingRepo['reserve']>>>()
  return repo
}
