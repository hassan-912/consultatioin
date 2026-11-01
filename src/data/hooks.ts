import { useEffect, useState } from 'react'
import { repo } from './index'
import { isLive } from './mode'
import { useLiveData } from './liveState'
import { useAppStore, type AppState } from '../store/useAppStore'
import { getRules } from '../store/actions'
import { consultants } from '../config/consultants'
import type { Format } from '../domain/types'
import type { Slot } from '../domain/availability'
import { slotsFor } from '../features/shared/availability'

export function useStaffBookings() {
  const local = useAppStore(s => s.bookings)
  const live = useLiveData(s => s.bookings)
  return isLive ? live : local
}
export function useStaffRecords() {
  const local = useAppStore(s => s.records)
  const live = useLiveData(s => s.records)
  return isLive ? live : local
}
export function useStaffAssessments() {
  const local = useAppStore(s => s.assessments)
  const session = useAppStore(s => s.staffSession)
  const bookings = useAppStore(s => s.bookings)
  const live = useLiveData(s => s.assessments)
  if (isLive) return live
  // Prototype mirrors the database rule: admin sees all, a consultant only their own bookings.
  if (!session || (session.role !== 'admin' && session.role !== 'consultant')) return {}
  return session.role === 'admin' ? local : Object.fromEntries(Object.entries(local).filter(([id]) => bookings[id]?.consultantId === session.consultantId))
}
export function useStaffAudit() {
  const local = useAppStore(s => s.audit)
  const live = useLiveData(s => s.audit)
  return isLive ? live : local
}
export function useStaffSchedules() {
  const local = useAppStore(s => s.scheduleOverrides)
  const live = useLiveData(s => s.schedules)
  return isLive ? live : Object.fromEntries(consultants.map(c => [c.id, getRules(c.id, local)]))
}
export const staffSessionKey = (s: AppState['staffSession']) => s ? JSON.stringify([s.username, s.role, s.consultantId]) : null
export function useStaffHydration() {
  const session = useAppStore(s => s.staffSession)
  useEffect(() => {
    if (!isLive || !session) return
    let active = true
    let running = false
    let again = false
    const refresh = async () => {
      if (running) { again = true; return }
      running = true
      try {
        const [bookings, records, audit, schedules, assessments] = await Promise.all([
          repo.staffList({}),
          session.role === 'admin' || session.role === 'consultant' ? repo.staffRecords() : Promise.resolve({}),
          session.role === 'admin' || session.role === 'finance' ? repo.staffAudit() : Promise.resolve([]),
          repo.staffSchedules(),
          session.role === 'admin' || session.role === 'consultant' ? repo.staffAssessments() : Promise.resolve({}),
        ])
        if (active) useLiveData.setState({ bookings: Object.fromEntries(bookings.map(b => [b.id, b])), records, audit, schedules, assessments, error: null, loading: false })
      } catch (error) {
        if (active) useLiveData.setState({ bookings: {}, records: {}, audit: [], schedules: {}, assessments: {}, error, loading: false })
      } finally {
        running = false
        if (active && again) { again = false; void refresh() }
      }
    }
    useLiveData.setState({ bookings: {}, records: {}, audit: [], schedules: {}, assessments: {}, staffKey: staffSessionKey(session), loading: true, error: null })
    void refresh()
    const off = repo.subscribe(() => void refresh())
    const offConnection = repo.onConnection?.(connection => { if (active) useLiveData.setState({ connection }) })
    const timer = setInterval(() => void refresh(), 15000)
    return () => { active = false; clearInterval(timer); off(); offConnection?.(); useLiveData.setState({ bookings: {}, records: {}, audit: [], schedules: {}, assessments: {}, staffKey: null, connection: 'idle', loading: true, error: null, actionError: null }) }
  }, [session])
}
let metadataRequest: Promise<void> | undefined
let metadataAt = 0
export function refreshPublicMetadata() {
  return metadataRequest ??= repo.publicMetadata().then(metadata => { metadataAt = Date.now(); useLiveData.setState({ metadata, metadataError: null }) }).catch(metadataError => { useLiveData.setState({ metadataError }) }).finally(() => { metadataRequest = undefined })
}
export function usePublicMetadata() {
  const metadata = useLiveData(s => s.metadata)
  useEffect(() => {
    if (!isLive) return
    if (Date.now() - metadataAt > 60000 || !metadata) void refreshPublicMetadata()
    const timer = setInterval(() => { if (Date.now() - metadataAt > 60000) void refreshPublicMetadata() }, 60000)
    return () => clearInterval(timer)
  }, [metadata])
  return metadata
}
export function useSlots(id: string, date: string, format: Format, duration: number, excludeId?: string, rescheduleToken?: string) {
  const bookings = useAppStore(s => s.bookings)
  const overrides = useAppStore(s => s.scheduleOverrides)
  const [state, setState] = useState<{ slots: Slot[]; loading: boolean; error: unknown }>({ slots: [], loading: isLive, error: null })
  useEffect(() => {
    if (!isLive) return
    let active = true
    const refresh = () => {
      setState(s => ({ ...s, loading: true, error: null }))
      repo.availableSlots(id, date, format, rescheduleToken).then(slots => active && setState({ slots, loading: false, error: null })).catch(error => active && setState({ slots: [], loading: false, error }))
    }
    refresh()
    const timer = setInterval(refresh, 30000)
    return () => { active = false; clearInterval(timer) }
  }, [id, date, format, rescheduleToken])
  void bookings; void overrides
  return isLive ? state : { slots: slotsFor(id, date, format, duration, excludeId), loading: false, error: null }
}
