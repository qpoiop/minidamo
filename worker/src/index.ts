/*
 * minidamo signaling Worker.
 *
 * Endpoints:
 *   POST   /room                Host publishes offer (body = SignalingPayload<offer>)
 *   GET    /room?roomId=…       Guest fetches offer for a specific room
 *   GET    /rooms               Guest lists active rooms
 *   POST   /join                Guest submits answer (body = SignalingPayload<answer>)
 *   GET    /answer?roomId=…     Host polls for the guest's answer
 *   DELETE /room?roomId=…       Cleanup
 *
 * Storage layout in R2 bucket bound as ROOMS_BUCKET:
 *   rooms/<roomId>.json     offer + metadata + expiresAt
 *   answers/<roomId>.json   answer
 *
 * User can add extra R2 buckets or KV namespaces later by declaring them
 * in wrangler.toml and updating the Env interface below — no logic change
 * is required for the storage abstraction to keep working.
 */

interface Env {
  ROOMS_BUCKET: R2Bucket;
  ROOM_TTL_SECONDS?: string;
  ALLOWED_ORIGIN?: string;
}

interface RoomRecord {
  roomId: string;
  hostName?: string;
  gameId?: string;
  location?: { lat: number; lon: number; acc: number };
  offer: unknown;
  createdAt: number;
  expiresAt: number;
}

interface AnswerRecord {
  roomId: string;
  guestName?: string;
  answer: unknown;
  createdAt: number;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

function ttlSeconds(env: Env): number {
  const raw = env.ROOM_TTL_SECONDS ? Number(env.ROOM_TTL_SECONDS) : 60
  return Number.isFinite(raw) && raw > 0 ? raw : 60
}

function corsHeaders(env: Env): Record<string, string> {
  return {
    'access-control-allow-origin': env.ALLOWED_ORIGIN ?? '*',
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  }
}

function jsonResponse(status: number, body: unknown, env: Env): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(env) },
  })
}

function textResponse(status: number, msg: string, env: Env): Response {
  return new Response(msg, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', ...corsHeaders(env) },
  })
}

async function readJson<T>(req: Request): Promise<T> {
  return (await req.json()) as T
}

async function saveRoom(env: Env, record: RoomRecord): Promise<void> {
  await env.ROOMS_BUCKET.put(`rooms/${record.roomId}.json`, JSON.stringify(record), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: {
      hostName: record.hostName ?? '',
      gameId: record.gameId ?? '',
      expiresAt: String(record.expiresAt),
    },
  })
}

async function loadRoom(env: Env, roomId: string): Promise<RoomRecord | null> {
  const obj = await env.ROOMS_BUCKET.get(`rooms/${roomId}.json`)
  if (!obj) return null
  return (await obj.json()) as RoomRecord
}

async function deleteRoom(env: Env, roomId: string): Promise<void> {
  await Promise.all([
    env.ROOMS_BUCKET.delete(`rooms/${roomId}.json`),
    env.ROOMS_BUCKET.delete(`answers/${roomId}.json`),
  ])
}

async function saveAnswer(env: Env, record: AnswerRecord): Promise<void> {
  await env.ROOMS_BUCKET.put(`answers/${record.roomId}.json`, JSON.stringify(record), {
    httpMetadata: { contentType: 'application/json' },
  })
}

async function loadAnswer(env: Env, roomId: string): Promise<AnswerRecord | null> {
  const obj = await env.ROOMS_BUCKET.get(`answers/${roomId}.json`)
  if (!obj) return null
  return (await obj.json()) as AnswerRecord
}

async function listActiveRooms(env: Env, now: number): Promise<RoomRecord[]> {
  const listed = await env.ROOMS_BUCKET.list({ prefix: 'rooms/', limit: 200 })
  const active: RoomRecord[] = []
  for (const obj of listed.objects) {
    const expiresAt = Number(obj.customMetadata?.expiresAt ?? '0')
    if (expiresAt <= now) continue
    // Hydrate lazily; light-weight enough for demo scale.
    const full = await env.ROOMS_BUCKET.get(obj.key)
    if (!full) continue
    active.push((await full.json()) as RoomRecord)
  }
  return active
}

async function purgeExpired(env: Env, now: number): Promise<number> {
  const listed = await env.ROOMS_BUCKET.list({ prefix: 'rooms/', limit: 1000 })
  const deletions: Promise<void>[] = []
  let count = 0
  for (const obj of listed.objects) {
    const expiresAt = Number(obj.customMetadata?.expiresAt ?? '0')
    if (expiresAt > now) continue
    const roomId = obj.key.replace(/^rooms\//, '').replace(/\.json$/, '')
    deletions.push(deleteRoom(env, roomId))
    count += 1
  }
  await Promise.all(deletions)
  return count
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const method = request.method.toUpperCase()

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) })
    }

    try {
      if (method === 'POST' && url.pathname === '/room') {
        const payload = await readJson<{ roomId: string; hostName?: string; gameId?: string; location?: RoomRecord['location'] } & { sdp?: unknown }>(request)
        if (!payload?.roomId) return textResponse(400, 'roomId required', env)
        const now = Date.now()
        const record: RoomRecord = {
          roomId: payload.roomId,
          hostName: payload.hostName,
          gameId: payload.gameId,
          location: payload.location,
          offer: payload,
          createdAt: now,
          expiresAt: now + ttlSeconds(env) * 1000,
        }
        await saveRoom(env, record)
        return jsonResponse(200, { ok: true, roomId: record.roomId, expiresAt: record.expiresAt }, env)
      }

      if (method === 'GET' && url.pathname === '/room') {
        const roomId = url.searchParams.get('roomId')
        if (!roomId) return textResponse(400, 'roomId required', env)
        const record = await loadRoom(env, roomId)
        if (!record) return textResponse(404, 'not found', env)
        if (record.expiresAt <= Date.now()) return textResponse(410, 'expired', env)
        return jsonResponse(200, record.offer, env)
      }

      if (method === 'DELETE' && url.pathname === '/room') {
        const roomId = url.searchParams.get('roomId')
        if (!roomId) return textResponse(400, 'roomId required', env)
        await deleteRoom(env, roomId)
        return jsonResponse(200, { ok: true }, env)
      }

      if (method === 'GET' && url.pathname === '/rooms') {
        const now = Date.now()
        const rooms = await listActiveRooms(env, now)
        const summaries = rooms.map((r) => ({
          roomId: r.roomId,
          hostName: r.hostName,
          gameId: r.gameId,
          location: r.location,
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
        }))
        return jsonResponse(200, { rooms: summaries }, env)
      }

      if (method === 'POST' && url.pathname === '/join') {
        const payload = await readJson<{ roomId: string; guestName?: string }>(request)
        if (!payload?.roomId) return textResponse(400, 'roomId required', env)
        const record: AnswerRecord = {
          roomId: payload.roomId,
          guestName: payload.guestName,
          answer: payload,
          createdAt: Date.now(),
        }
        await saveAnswer(env, record)
        return jsonResponse(200, { ok: true }, env)
      }

      if (method === 'GET' && url.pathname === '/answer') {
        const roomId = url.searchParams.get('roomId')
        if (!roomId) return textResponse(400, 'roomId required', env)
        const record = await loadAnswer(env, roomId)
        if (!record) return textResponse(404, 'not yet', env)
        return jsonResponse(200, record.answer, env)
      }

      return textResponse(404, 'not found', env)
    } catch (err) {
      console.error('handler error', err)
      return textResponse(500, 'server error', env)
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      purgeExpired(env, Date.now()).then((n) => {
        if (n > 0) console.log(`purged ${n} expired rooms`)
      }),
    )
  },
}
