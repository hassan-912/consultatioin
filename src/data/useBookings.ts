import { useEffect, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { Booking } from '../domain/types'
import { repo } from './index'
import { isLive } from './mode'

/**
 * Read hooks. The local layer reads the store synchronously so screens render without a loading
 * frame; a remote layer would swap these for fetch-and-subscribe versions that add loading state.
 */
export function useBookingLookup(token: string) {
  const local = useAppStore(s => Object.values(s.bookings).find(b => b.manageToken === token))
  const [state, setState] = useState<{ token: string; booking?: Booking; loading: boolean; error: unknown }>({ token, loading: isLive, error: null })
  useEffect(() => {
    if (!isLive) return
    let active = true
    const refresh = async () => {
      try {
        const booking = await repo.getByManageToken(token)
        if (active) setState({ token, booking: booking ?? undefined, loading: false, error: null })
      } catch (error) { if (active) setState({ token, loading: false, error }) }
    }
    setState({ token, loading: true, error: null })
    void refresh()
    const timer = setInterval(() => void refresh(), 5000)
    return () => { active = false; clearInterval(timer) }
  }, [token])
  return isLive ? state.token === token ? state : { token, loading: true, error: null, booking: undefined } : { booking: local, loading: false, error: null }
}
export function useBookingByToken(token: string): Booking | undefined { return useBookingLookup(token).booking }
