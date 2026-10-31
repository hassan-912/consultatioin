import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface BackendClients {
  customer: SupabaseClient
  staff: SupabaseClient
  url: string
  key: string
  fetch: typeof fetch
}

/** No shared auth storage, URL grant handling, or staff credentials on customer requests. */
export function createBackendClients(url: string, key: string, request: typeof fetch = (...args) => globalThis.fetch(...args), storageNamespace = 'mg'): BackendClients {
  if (!url || !key) throw new Error('LIVE_CONFIG_MISSING')
  const customer = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `${storageNamespace}-customer-anonymous` },
    // accessToken prevents this client's auth state from ever supplying an authenticated JWT.
    accessToken: async () => null,
    global: { fetch: request },
  })
  const staff = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: `${storageNamespace}-staff-auth-v1` },
    global: { fetch: request },
  })
  return { customer, staff, url: url.replace(/\/$/, ''), key, fetch: request }
}

let clients: BackendClients | undefined
export function getBackendClients(): BackendClients {
  return clients ??= createBackendClients(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
}
