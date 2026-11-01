import { create } from 'zustand'
import type { Booking, AuditEntry } from '../domain/types'
import type { ScheduleRules } from '../domain/availability'
import type { ConsultationRecord } from '../store/useAppStore'
import type { PublicMetadata } from './types'
import type { StoredAssessment } from '../assessment/questions'

/** Memory only. Customer capabilities never enter the staff snapshot or persisted UI. */
export const useLiveData = create<{
  bookings: Record<string, Booking>; records: Record<string, ConsultationRecord>; audit: AuditEntry[]; assessments: Record<string, StoredAssessment>
  schedules: Record<string, ScheduleRules>; metadata: PublicMetadata[] | null; metadataError: unknown
  staffKey: string | null; connection: 'idle' | 'connected' | 'reconnecting'; loading: boolean; error: unknown; actionError: unknown
}>(() => ({ bookings: {}, records: {}, audit: [], assessments: {}, schedules: {}, metadata: null, metadataError: null, staffKey: null, connection: 'idle', loading: true, error: null, actionError: null }))
