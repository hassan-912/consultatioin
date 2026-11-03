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
    if (!error && data.user) return { userId: data.user.id }
    if (error?.status === 422 || /already|registered/i.test(error?.message ?? '')) throw new Error('ALREADY_EXISTS')
    // Supabase's built-in mailer sends only a few emails an hour. Create the invitation anyway; the admin shares the link.
    if (error?.status === 429 || error?.code === 'over_email_send_rate_limit') {
      const made = await admin.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo } })
      if (made.error || !made.data.user) throw new Error(/already|registered/i.test(made.error?.message ?? '') ? 'ALREADY_EXISTS' : 'INVITE_UNAVAILABLE')
      return { userId: made.data.user.id, link: made.data.properties.action_link }
    }
    throw new Error('INVITE_UNAVAILABLE')
  },
  async grantProfile(actorId, userId, request) {
    // One transaction: insert-only profile + audit_log row. Existing profiles are refused, never overwritten.
    const { error } = await admin.rpc('invite_staff_profile', {
      p_actor: actorId, p_user_id: userId, p_display_name: request.displayName, p_role: request.role, p_consultant_id: request.consultantId,
    })
    if (error) throw new Error(error.message === 'ALREADY_EXISTS' ? 'ALREADY_EXISTS' : 'INVITE_UNAVAILABLE')
  },
}))
