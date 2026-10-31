import { createClient } from 'npm:@supabase/supabase-js@2.49.8'
import { inviteHandler } from './handler.ts'

const url = Deno.env.get('SUPABASE_URL')!
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const anonymous = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, options)
// This key exists only in the Edge runtime. Never return it or import this module into the frontend.
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, options)

Deno.serve(inviteHandler({
  siteUrl: Deno.env.get('SITE_URL')!,
  async verifyUser(jwt) {
    const { data, error } = await anonymous.auth.getUser(jwt)
    return error || !data.user ? null : data.user.id
  },
  async callerProfile(userId) {
    const { data, error } = await admin.from('staff_profiles').select('role,active').eq('user_id', userId).maybeSingle()
    if (error) throw new Error('INVITE_UNAVAILABLE')
    return data
  },
  async consultantExists(consultantId) {
    const { data, error } = await admin.from('consultant_branches').select('consultant_id').eq('consultant_id', consultantId).limit(1)
    if (error) throw new Error('INVITE_UNAVAILABLE')
    return data.length > 0
  },
  async invite(email, redirectTo) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })
    if (error || !data.user) throw new Error(error?.status === 422 || /already|registered/i.test(error?.message ?? '') ? 'ALREADY_EXISTS' : 'INVITE_UNAVAILABLE')
    return data.user.id
  },
  async upsertProfile(userId, request) {
    const { error } = await admin.from('staff_profiles').upsert({
      user_id: userId, display_name: request.displayName, role: request.role, consultant_id: request.consultantId, active: true,
    }, { onConflict: 'user_id' })
    if (error) throw new Error('INVITE_UNAVAILABLE')
  },
}))
