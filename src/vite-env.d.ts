/// <reference types="vite/client" />
declare const __DATA_MODE__: 'local' | 'supabase'
declare module '#data-repo' {
  export const repo: import('./data/types').BookingRepo
  export const configurationError: string | null
  export const staffClient: import('@supabase/supabase-js').SupabaseClient | null
}
