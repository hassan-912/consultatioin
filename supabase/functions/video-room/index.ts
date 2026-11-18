import { createClient } from 'npm:@supabase/supabase-js@2.49.8'
import { videoRoomHandler, type RoomBooking } from './handler.ts'

const url = Deno.env.get('SUPABASE_URL')!
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const anonymous = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, options)
// The service-role key exists only in the Edge runtime. Never return it or import this module into the frontend.
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, options)
const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await admin.rpc(fn, args)
  if (error) throw new Error('VIDEO_UNAVAILABLE')
  return data as T
}

Deno.serve(videoRoomHandler({
  siteUrl: Deno.env.get('SITE_URL')!,
  dailyKey: Deno.env.get('DAILY_API_KEY') || undefined,
  clientBooking: token => rpc<RoomBooking | null>('video_room_booking', { p_manage_token: token }),
  async verifyUser(jwt) {
    const { data, error } = await anonymous.auth.getUser(jwt)
    return error || !data.user ? null : data.user.id
  },
  staffBooking: (bookingId, userId) => rpc<RoomBooking | null>('video_room_staff_booking', { p_booking_id: bookingId, p_user_id: userId }),
  clientJoined: bookingId => rpc('video_room_client_joined', { p_booking_id: bookingId }),
  now: () => Date.now(),
  fetch: (input, init) => fetch(input, init),
  log: (event, fields) => console.log(JSON.stringify({ fn: 'video-room', event, ...fields })),
}))
