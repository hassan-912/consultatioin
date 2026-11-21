import { videoRoomHandler, type Dependencies, type RoomBooking } from '../../supabase/functions/video-room/handler'

const START = Date.parse('2026-11-24T14:00:00Z')
const booking = (over: Partial<RoomBooking> = {}): RoomBooking => ({
  id: '0b6f2f6e-6a51-4b1e-9d1b-1d6c7d0f0a11', reference: 'MG-TEST-ROOM', name: 'Kamel', status: 'confirmed', format: 'online',
  starts_at: new Date(START).toISOString(), ends_at: new Date(START + 45 * 60_000).toISOString(), lang: 'ar', ...over,
})

function setup(over: Partial<Dependencies> = {}, now = START) {
  const calls: { path: string; method: string; body: unknown }[] = []
  const rooms = new Set<string>()
  const joined: string[] = []
  const deps: Dependencies = {
    siteUrl: 'https://mg.example',
    dailyKey: 'daily-test-key',
    clientBooking: async t => (t === 'a'.repeat(32) ? booking() : null),
    verifyUser: async jwt => (jwt === 'staff-jwt' ? 'user-1' : null),
    staffBooking: async (id, user) => (user === 'user-1' && id === booking().id ? { ...booking(), name: 'Ahmed Tarek' } : null),
    clientJoined: async id => { joined.push(id) },
    now: () => now,
    fetch: (async (input: string, init?: RequestInit) => {
      const path = String(input).replace('https://api.daily.co/v1', '')
      const method = init?.method ?? 'GET'
      calls.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status })
      if (path.startsWith('/rooms/') && method === 'GET') {
        const name = path.slice('/rooms/'.length)
        return rooms.has(name) ? json(200, { name, url: `https://mg.daily.co/${name}` }) : json(404, { error: 'not-found' })
      }
      if (path === '/rooms' && method === 'POST') {
        const name = (JSON.parse(String(init!.body)) as { name: string }).name
        rooms.add(name)
        return json(200, { name, url: `https://mg.daily.co/${name}` })
      }
      if (path === '/meeting-tokens') return json(200, { token: 'pass-123' })
      return json(500, {})
    }) as typeof fetch,
    ...over,
  }
  const call = (body: unknown, headers: Record<string, string> = {}) => videoRoomHandler(deps)(new Request('https://x.supabase.co/functions/v1/video-room', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  }))
  return { call, calls, joined, rooms }
}

test('a paid client inside the time window gets a private room and a pass, and is checked in', async () => {
  const { call, calls, joined } = setup()
  const res = await call({ manage_token: 'a'.repeat(32) })
  expect(res.status).toBe(200)
  expect(await res.json()).toMatchObject({ state: 'ready', url: `https://mg.daily.co/mg-${booking().id}`, token: 'pass-123' })
  const created = calls.find(c => c.path === '/rooms' && c.method === 'POST')!.body as { privacy: string; properties: { exp: number } }
  expect(created.privacy).toBe('private')
  expect(created.properties.exp).toBe(Math.floor((START + 45 * 60_000 + 30 * 60_000) / 1000))
  const pass = calls.find(c => c.path === '/meeting-tokens')!.body as { properties: { is_owner: boolean; user_name: string } }
  expect(pass.properties).toMatchObject({ is_owner: false, user_name: 'Kamel' })
  expect(joined).toEqual([booking().id])
})

test('when Daily refuses the recording settings, the room still opens without them', async () => {
  const { call, calls } = setup({
    fetch: (async (input: string, init?: RequestInit) => {
      const path = String(input).replace('https://api.daily.co/v1', '')
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) as { name: string; properties: Record<string, unknown> } : undefined
      calls.push({ path, method, body })
      const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status })
      if (path === '/rooms' && method === 'POST') {
        if (body!.properties.enable_recording) return json(400, { error: 'invalid-request-error' })
        return json(200, { name: body!.name, url: `https://mg.daily.co/${body!.name}` })
      }
      if (path.startsWith('/rooms/')) return json(404, { error: 'not-found' })
      if (path === '/meeting-tokens') return json(200, { token: 'pass-123' })
      return json(500, {})
    }) as typeof fetch,
  })
  const res = await call({ manage_token: 'a'.repeat(32) })
  expect(await res.json()).toMatchObject({ state: 'ready', token: 'pass-123' })
  const creates = calls.filter(c => c.path === '/rooms' && c.method === 'POST').map(c => (c.body as { properties: Record<string, unknown> }).properties)
  expect(creates).toHaveLength(2)
  expect(creates[0]).toMatchObject({ enable_recording: 'cloud-audio-only' })
  expect(creates[1]).not.toHaveProperty('enable_recording')
})

test('the room reuses an existing room instead of making a second one', async () => {
  const { call, calls, rooms } = setup()
  rooms.add(`mg-${booking().id}`)
  await call({ manage_token: 'a'.repeat(32) })
  expect(calls.filter(c => c.path === '/rooms' && c.method === 'POST')).toHaveLength(0)
})

test('too early: the client gets the opening time, and no room or check-in yet', async () => {
  const { call, calls, joined } = setup({}, START - 11 * 60_000)
  expect(await (await call({ manage_token: 'a'.repeat(32) })).json()).toEqual({ state: 'early', opens_at: new Date(START - 5 * 60_000).toISOString() })
  expect(calls).toHaveLength(0)
  expect(joined).toHaveLength(0)
})

test('five minutes before the start the room opens; after the end plus 30 minutes it is closed', async () => {
  expect((await (await setup({}, START - 5 * 60_000).call({ manage_token: 'a'.repeat(32) })).json()).state).toBe('ready')
  expect((await (await setup({}, START + 76 * 60_000).call({ manage_token: 'a'.repeat(32) })).json()).state).toBe('ended')
})

test('unpaid, cancelled or in-person bookings never get a room', async () => {
  for (const status of ['reserved', 'on-hold', 'cancelled', 'completed']) {
    const { call, calls } = setup({ clientBooking: async () => booking({ status }) })
    expect((await (await call({ manage_token: 'a'.repeat(32) })).json()).state).toBe('unavailable')
    expect(calls).toHaveLength(0)
  }
  const { call } = setup({ clientBooking: async () => booking({ format: 'in-person' }) })
  expect((await (await call({ manage_token: 'a'.repeat(32) })).json()).state).toBe('not-online')
})

test('an unknown link is not found', async () => {
  const res = await setup().call({ manage_token: 'b'.repeat(32) })
  expect(res.status).toBe(404)
})

test('the booked consultant joins as the host and checks nobody in', async () => {
  const { call, calls, joined } = setup()
  const res = await call({ booking_id: booking().id }, { authorization: 'Bearer staff-jwt' })
  expect((await res.json()).state).toBe('ready')
  const pass = calls.find(c => c.path === '/meeting-tokens')!.body as { properties: { is_owner: boolean; user_name: string } }
  expect(pass.properties).toMatchObject({ is_owner: true, user_name: 'Ahmed Tarek' })
  expect(joined).toHaveLength(0)
})

test('staff without a valid sign-in, or not on this booking, are refused', async () => {
  expect((await setup().call({ booking_id: booking().id })).status).toBe(401)
  expect((await setup().call({ booking_id: booking().id }, { authorization: 'Bearer nope' })).status).toBe(401)
  const other = setup({ staffBooking: async () => null })
  expect((await other.call({ booking_id: booking().id }, { authorization: 'Bearer staff-jwt' })).status).toBe(404)
})

test('without a Daily key, or when Daily fails, the room says it is unavailable', async () => {
  expect((await setup({ dailyKey: undefined }).call({ manage_token: 'a'.repeat(32) })).status).toBe(503)
  const broken = setup({ fetch: (async () => new Response('{}', { status: 500 })) as typeof fetch })
  expect((await broken.call({ manage_token: 'a'.repeat(32) })).status).toBe(503)
})

test('a failed check-in still lets the client into the call', async () => {
  const { call } = setup({ clientJoined: async () => { throw new Error('db down') } })
  expect((await (await call({ manage_token: 'a'.repeat(32) })).json()).state).toBe('ready')
})

test('bad input is refused before anything is looked up', async () => {
  const lookups: string[] = []
  const { call } = setup({ clientBooking: async t => { lookups.push(t); return null } })
  expect((await call({ manage_token: "x' or 1=1" })).status).toBe(400)
  expect((await call({})).status).toBe(400)
  expect(lookups).toHaveLength(0)
})

test('a rescheduled booking moves its existing room closing time', async () => {
  const later = START + 2 * 86_400_000
  const { call, calls, rooms } = setup({ clientBooking: async () => booking({ starts_at: new Date(later).toISOString(), ends_at: new Date(later + 45 * 60_000).toISOString() }) }, later)
  rooms.add(`mg-${booking().id}`)
  await call({ manage_token: 'a'.repeat(32) })
  const update = calls.find(c => c.path === `/rooms/mg-${booking().id}` && c.method === 'POST')!.body as { properties: { exp: number } }
  expect(update.properties.exp).toBe(Math.floor((later + 75 * 60_000) / 1000))
})
