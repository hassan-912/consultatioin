import type { Booking, BookingStatus, Channel, PaymentSubmission } from './types'
import { dateInZone } from './time'
import { makeToken } from './ids'

export type BookingEvent =
  | { type: 'submit-payment'; payment: PaymentSubmission }
  | { type: 'verify' }
  | { type: 'reject'; reason: string }
  | { type: 'wrong-amount' }
  | { type: 'duplicate' }
  | { type: 'late' }
  | { type: 'expire' }
  | { type: 'check-in' }
  | { type: 'complete' }
  | { type: 'no-show' }
  | { type: 'cancel' }
  | { type: 'mark-sent'; via: Channel }

export class InvalidTransition extends Error {
  constructor(public from: BookingStatus, public event: BookingEvent['type']) {
    super(`Cannot ${event} from ${from}`)
  }
}

const REVIEWABLE: BookingStatus[] = ['on-hold', 'wrong-amount', 'duplicate', 'late-transfer']

const allowed: Record<BookingEvent['type'], BookingStatus[]> = {
  'submit-payment': ['reserved', 'rejected'],
  verify: REVIEWABLE,
  reject: ['on-hold'],
  'wrong-amount': ['on-hold'],
  duplicate: ['on-hold'],
  late: ['expired'],
  expire: ['reserved', 'rejected'],
  'check-in': ['confirmed'],
  complete: ['confirmed', 'checked-in'],
  'no-show': ['confirmed'],
  cancel: ['reserved', 'on-hold', 'confirmed', 'rejected', 'wrong-amount', 'duplicate', 'late-transfer'],
  'mark-sent': ['confirmed'],
}

const target: Record<Exclude<BookingEvent['type'], 'mark-sent'>, BookingStatus> = {
  'submit-payment': 'on-hold',
  verify: 'confirmed',
  reject: 'rejected',
  'wrong-amount': 'wrong-amount',
  duplicate: 'duplicate',
  late: 'late-transfer',
  expire: 'expired',
  'check-in': 'checked-in',
  complete: 'completed',
  'no-show': 'no-show',
  cancel: 'cancelled',
}

export function canApply(b: Booking, type: BookingEvent['type']): boolean {
  return allowed[type].includes(b.status)
}

export function transition(b: Booking, e: BookingEvent, nowMs: number): Booking {
  if (!canApply(b, e.type)) throw new InvalidTransition(b.status, e.type)
  switch (e.type) {
    case 'submit-payment':
      if (nowMs > b.holdExpiresAt) throw new InvalidTransition('expired', e.type)
      return { ...b, status: 'on-hold', payment: e.payment, rejectReason: undefined }
    case 'verify':
      return {
        ...b,
        status: 'confirmed',
        // Platform is a pending decision; the prototype links to an internal waiting room.
        meetingUrl: b.format === 'online' ? `#/meet/${makeToken()}` : undefined,
      }
    case 'reject':
      return { ...b, status: 'rejected', rejectReason: e.reason }
    case 'check-in':
      return { ...b, status: 'checked-in', checkedInAt: nowMs }
    case 'mark-sent':
      return { ...b, ticketSentVia: e.via, ticketSentAt: nowMs }
    default:
      return { ...b, status: target[e.type] }
  }
}

export type CheckInVerdict = 'ok' | 'not-found' | 'on-hold' | 'unpaid' | 'already-used' | 'cancelled' | 'expired' | 'wrong-date'

export function checkInVerdict(b: Booking | undefined, todayInTz: string): CheckInVerdict {
  if (!b) return 'not-found'
  switch (b.status) {
    case 'reserved':
    case 'rejected':
      return 'unpaid'
    case 'on-hold':
    case 'wrong-amount':
    case 'duplicate':
    case 'late-transfer':
      return 'on-hold'
    case 'checked-in':
    case 'completed':
      return 'already-used'
    case 'cancelled':
      return 'cancelled'
    case 'expired':
    case 'no-show':
      return 'expired'
    case 'confirmed':
      return dateInZone(b.startIso, b.tz) === todayInTz ? 'ok' : 'wrong-date'
  }
}

export const isActive = (s: BookingStatus) => !['expired', 'cancelled', 'completed', 'no-show'].includes(s)
