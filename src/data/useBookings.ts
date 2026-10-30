import { useAppStore } from '../store/useAppStore'
import type { Booking } from '../domain/types'

/**
 * Read hooks. The local layer reads the store synchronously so screens render without a loading
 * frame; a remote layer would swap these for fetch-and-subscribe versions that add loading state.
 */
export function useBookingByToken(token: string): Booking | undefined {
  return useAppStore(s => Object.values(s.bookings).find(b => b.manageToken === token))
}
