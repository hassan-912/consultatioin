// The online consultation room (Daily.co). Clients come with their manage link; staff with their sign-in.
// Rooms are private: nobody enters without a pass made here, and a pass only works for one booking's time window.

const DAILY = 'https://api.daily.co/v1'
/** The room opens this long before the start and closes this long after the end. */
export const OPENS_BEFORE_MS = 5 * 60_000
export const CLOSES_AFTER_MS = 30 * 60_000

export type RoomBooking = {
  id: string; reference: string; name: string; status: string; format: string; starts_at: string; ends_at: string; lang: string
}
export type Dependencies = {
  siteUrl: string
  /** Daily.co API key (secret DAILY_API_KEY). Missing: the room answers VIDEO_UNAVAILABLE. */
  dailyKey?: string
  clientBooking: (manageToken: string) => Promise<RoomBooking | null>
  /** Verifies the caller's JWT and returns the auth user id, or null. */
  verifyUser: (jwt: string) => Promise<string | null>
  /** The booking as this staff member may see it (own consultant or admin), or null. */
  staffBooking: (bookingId: string, userId: string) => Promise<RoomBooking | null>
  /** The client entered: a confirmed booking becomes checked in. */
  clientJoined: (bookingId: string) => Promise<unknown>
  now: () => number
  fetch: typeof fetch
  log?: (event: string, fields: Record<string, string | number>) => void
}

const ROOM_STATUSES = ['confirmed', 'checked-in']

export function videoRoomHandler(deps: Dependencies) {
  const allowedOrigin = new URL(deps.siteUrl).origin
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin')
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
      ...(origin === allowedOrigin ? { 'Access-Control-Allow-Origin': origin } : {}) }
    const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers,
      'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' } })
    if (request.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' })

    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const manageToken = typeof body?.manage_token === 'string' ? body.manage_token : null
    const bookingId = typeof body?.booking_id === 'string' ? body.booking_id : null
    let booking: RoomBooking | null = null
    let isStaff = false
    try {
      if (manageToken && /^[A-Za-z0-9_-]{16,128}$/.test(manageToken)) {
        booking = await deps.clientBooking(manageToken)
      } else if (bookingId && /^[0-9a-f-]{36}$/i.test(bookingId)) {
        const jwt = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1]
        const userId = jwt ? await deps.verifyUser(jwt) : null
        if (!userId) return reply(401, { error: 'FORBIDDEN' })
        booking = await deps.staffBooking(bookingId, userId)
        isStaff = true
      } else return reply(400, { error: 'INVALID_INPUT' })
    } catch {
      return reply(503, { error: 'VIDEO_UNAVAILABLE' })
    }
    // Unknown link and "not your booking" look the same from outside.
    if (!booking) return reply(404, { error: 'NOT_FOUND' })
    if (booking.format !== 'online') return reply(200, { state: 'not-online' })
    if (!ROOM_STATUSES.includes(booking.status)) return reply(200, { state: 'unavailable' })

    const now = deps.now()
    const opensAt = Date.parse(booking.starts_at) - OPENS_BEFORE_MS
    const closesAt = Date.parse(booking.ends_at) + CLOSES_AFTER_MS
    if (now < opensAt) return reply(200, { state: 'early', opens_at: new Date(opensAt).toISOString() })
    if (now > closesAt) return reply(200, { state: 'ended' })
    if (!deps.dailyKey) return reply(503, { error: 'VIDEO_UNAVAILABLE' })

    const daily = async (path: string, init?: { method?: string; payload?: unknown }) => {
      const res = await deps.fetch(`${DAILY}${path}`, {
        method: init?.method ?? 'GET',
        headers: { Authorization: `Bearer ${deps.dailyKey}`, 'Content-Type': 'application/json' },
        body: init?.payload === undefined ? undefined : JSON.stringify(init.payload),
        signal: AbortSignal.timeout(15000),
      })
      const data = await res.json().catch(() => null) as Record<string, unknown> | null
      return { status: res.status, data }
    }
    try {
      const name = `mg-${booking.id}`
      const exp = Math.floor(closesAt / 1000)
      let room = await daily(`/rooms/${name}`)
      if (room.status === 404) {
        room = await daily('/rooms', { method: 'POST', payload: {
          name, privacy: 'private',
          properties: { exp, eject_at_room_exp: true, enable_prejoin_ui: true, enable_chat: true, enable_screenshare: true, max_participants: 4 },
        } })
        // Two people opening the room at the same moment: the second create finds it already there.
        if (room.status === 400) room = await daily(`/rooms/${name}`)
      }
      // A rescheduled booking keeps its room: move the closing time with it, or Daily would refuse entry.
      const config = room.data?.config as Record<string, unknown> | undefined
      if (room.status === 200 && config?.exp !== exp) {
        const updated = await daily(`/rooms/${name}`, { method: 'POST', payload: { properties: { exp, eject_at_room_exp: true } } })
        if (updated.status === 200) room = updated
      }
      const url = typeof room.data?.url === 'string' ? room.data.url : null
      if (room.status !== 200 || !url) {
        deps.log?.('daily_room_failed', { status: room.status })
        return reply(503, { error: 'VIDEO_UNAVAILABLE' })
      }
      const pass = await daily('/meeting-tokens', { method: 'POST', payload: {
        properties: { room_name: name, user_name: booking.name.slice(0, 60), is_owner: isStaff, exp },
      } })
      const token = typeof pass.data?.token === 'string' ? pass.data.token : null
      if (pass.status !== 200 || !token) {
        deps.log?.('daily_token_failed', { status: pass.status })
        return reply(503, { error: 'VIDEO_UNAVAILABLE' })
      }
      // Check-in must never keep the client out of their call.
      if (!isStaff && booking.status === 'confirmed') {
        await deps.clientJoined(booking.id).catch(() => deps.log?.('checkin_failed', { booking: booking!.reference }))
      }
      return reply(200, { state: 'ready', url, token, closes_at: new Date(closesAt).toISOString() })
    } catch {
      return reply(503, { error: 'VIDEO_UNAVAILABLE' })
    }
  }
}
