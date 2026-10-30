import { createClient } from 'npm:@supabase/supabase-js@2.49.8'
import { receiptHandler } from './handler.ts'

const url = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const anonymous = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
// This key exists only in the Edge runtime. Never return it or import this module into the frontend.
const storage = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
Deno.serve(receiptHandler({
  siteUrl: Deno.env.get('SITE_URL')!, anonKey,
  async authorize(token, extension) {
    const { data, error } = await anonymous.rpc('create_receipt_upload', { p_manage_token: token, p_extension: extension })
    if (error) throw new Error(error.message)
    return data
  },
  async sign(path) {
    const { data, error } = await storage.storage.from('receipts').createSignedUploadUrl(path, { upsert: false })
    if (error) throw new Error('UPLOAD_UNAVAILABLE')
    return { signedUrl: data.signedUrl, token: data.token }
  },
}))
