import { createSupabaseRepo } from './supabase'
import { getBackendClients } from '../lib/supabase'
import { RepoError, type BookingRepo } from './types'

const selected = (() => {
  try {
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) throw new Error('Missing configuration')
    return { configurationError: null, repo: createSupabaseRepo(getBackendClients()) }
  } catch {
    return { configurationError: 'LIVE_CONFIG_MISSING', repo: new Proxy({} as BookingRepo, { get: () => () => Promise.reject(new RepoError('LIVE_CONFIG_MISSING')) }) }
  }
})()
export const { configurationError, repo } = selected
/** Task 8's auth/session adapter uses this exact client; never the customer client. */
export const staffClient = configurationError ? null : getBackendClients().staff
