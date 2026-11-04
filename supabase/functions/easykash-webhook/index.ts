import { createClient } from 'npm:@supabase/supabase-js@2.49.8'
import { easykashHandler } from './handler.ts'

// The service-role key exists only in the Edge runtime. Never return it or import this module into the frontend.
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })

Deno.serve(easykashHandler({
  config: { hmacSecret: Deno.env.get('EASYKASH_HMAC_SECRET') || undefined },
  async record(payload) {
    const { data, error } = await admin.rpc('record_easykash_callback', { p_payload: payload })
    if (error) throw new Error('RECORD_FAILED')
    return data === true
  },
  log: (event, fields) => console.log(JSON.stringify({ fn: 'easykash-webhook', event, ...fields })),
}))
