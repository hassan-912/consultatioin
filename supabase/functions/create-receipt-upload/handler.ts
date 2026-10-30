type Capability = { booking_id: string; path: string }
type Dependencies = {
  siteUrl: string
  anonKey: string
  authorize: (token: string, extension: string) => Promise<Capability>
  sign: (path: string) => Promise<{ signedUrl: string; token: string }>
}
const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }
export function receiptHandler(deps: Dependencies) {
  const allowedOrigin = new URL(deps.siteUrl).origin
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin')
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
      ...(origin === allowedOrigin ? { 'Access-Control-Allow-Origin': origin } : {}) }
    const reply = (status: number, error: string) => new Response(JSON.stringify({ error }), { status, headers })
    if (origin && origin !== allowedOrigin) return reply(403, 'FORBIDDEN')
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers,
      'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' } })
    if (request.method !== 'POST') return reply(405, 'METHOD_NOT_ALLOWED')
    // This public endpoint accepts only the anonymous project credential; never forward a staff JWT.
    const authorization = request.headers.get('authorization')
    if (authorization && authorization !== `Bearer ${deps.anonKey}`) return reply(403, 'FORBIDDEN')
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415, 'INVALID_INPUT')
    if (Number(request.headers.get('content-length')) > 2048) return reply(413, 'REQUEST_TOO_LARGE')
    try {
      const reader = request.body?.getReader()
      if (!reader) return reply(400, 'INVALID_INPUT')
      const chunks: Uint8Array[] = []; let bytes = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > 2048) { await reader.cancel(); return reply(413, 'REQUEST_TOO_LARGE') }
        chunks.push(value)
      }
      const buffer = new Uint8Array(bytes); let offset = 0
      for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length }
      const body = JSON.parse(new TextDecoder().decode(buffer))
      if (!body || typeof body.manage_token !== 'string' || !/^[0-9a-f]{32}$/.test(body.manage_token)
        || typeof body.mime_type !== 'string' || !Object.hasOwn(extensions, body.mime_type)) return reply(400, 'INVALID_INPUT')
      const capability = await deps.authorize(body.manage_token, extensions[body.mime_type])
      const signed = await deps.sign(capability.path)
      return new Response(JSON.stringify({ bucket: 'receipts', ...capability, ...signed }), { status: 200, headers })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      const statuses: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403, INVALID_INPUT: 400,
        HOLD_EXPIRED: 409, INVALID_TRANSITION: 409, RATE_LIMITED: 429 }
      if (error instanceof SyntaxError) return reply(400, 'INVALID_INPUT')
      return reply(statuses[message] ?? 500, statuses[message] ? message : 'UPLOAD_UNAVAILABLE')
    }
  }
}
