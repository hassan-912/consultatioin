import { useAppStore } from '../store/useAppStore'
import type { StaffRole } from '../domain/types'

/** Test helper: start a staff session without going through the sign-in form. */
export function loginAs(role: StaffRole, consultantId: string | null = null) {
  useAppStore.setState(s => ({
    role,
    staffSession: { username: role, role, consultantId },
    staffConsultantId: consultantId ?? s.staffConsultantId,
  }))
}
