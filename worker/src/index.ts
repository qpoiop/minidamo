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
 * Storage abstraction lives in the `storage` object below. Default = KV.
 * Swap to R2 by toggling wrangler.toml (see comments there) and changing
 * `STORAGE` to 'r2'.
 */

interface Env {
  ROOMS_KV?: KVNamespace;
  ROOMS_BUCKET?: R2Bucket;
  DB?: D1Database;
  ROOM_TTL_SECONDS?: string;
  ALLOWED_ORIGIN?: string;
}

const STORAGE = 'd1' as 'kv' | 'r2' | 'd1'

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
  const raw = env.ROOM_TTL_SECONDS ? Number(env.ROOM_TTL_SECONDS) : 300
  return Number.isFinite(raw) && raw > 0 ? raw : 300
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

/* ------------------------------------------------------------------
 * Storage adapters — pluggable so R2 can drop in later.
 * ------------------------------------------------------------------ */

interface Storage {
  saveRoom(env: Env, record: RoomRecord): Promise<void>;
  loadRoom(env: Env, roomId: string): Promise<RoomRecord | null>;
  deleteRoom(env: Env, roomId: string): Promise<void>;
  listActiveRooms(env: Env, now: number): Promise<RoomRecord[]>;
  saveAnswer(env: Env, record: AnswerRecord): Promise<void>;
  loadAnswer(env: Env, roomId: string): Promise<AnswerRecord | null>;
  purgeExpired(env: Env, now: number): Promise<number>;
}

const kvStorage: Storage = {
  async saveRoom(env, record) {
    if (!env.ROOMS_KV) throw new Error('ROOMS_KV binding not configured')
    const ttl = Math.max(1, Math.ceil((record.expiresAt - Date.now()) / 1000))
    await env.ROOMS_KV.put(`room:${record.roomId}`, JSON.stringify(record), {
      expirationTtl: ttl,
      metadata: {
        hostName: record.hostName ?? '',
        gameId: record.gameId ?? '',
        expiresAt: record.expiresAt,
      },
    })
  },
  async loadRoom(env, roomId) {
    if (!env.ROOMS_KV) return null
    const raw = await env.ROOMS_KV.get(`room:${roomId}`)
    return raw ? (JSON.parse(raw) as RoomRecord) : null
  },
  async deleteRoom(env, roomId) {
    if (!env.ROOMS_KV) return
    await Promise.all([
      env.ROOMS_KV.delete(`room:${roomId}`),
      env.ROOMS_KV.delete(`answer:${roomId}`),
    ])
  },
  async listActiveRooms(env, now) {
    if (!env.ROOMS_KV) return []
    const listed = await env.ROOMS_KV.list<{ expiresAt?: number }>({ prefix: 'room:', limit: 200 })
    const active: RoomRecord[] = []
    for (const entry of listed.keys) {
      const meta = entry.metadata
      if (meta?.expiresAt && meta.expiresAt <= now) continue
      const raw = await env.ROOMS_KV.get(entry.name)
      if (!raw) continue
      const rec = JSON.parse(raw) as RoomRecord
      if (rec.expiresAt > now) active.push(rec)
    }
    return active
  },
  async saveAnswer(env, record) {
    if (!env.ROOMS_KV) throw new Error('ROOMS_KV binding not configured')
    // Answers live briefly — reuse TTL default.
    await env.ROOMS_KV.put(`answer:${record.roomId}`, JSON.stringify(record), {
      expirationTtl: 300,
    })
  },
  async loadAnswer(env, roomId) {
    if (!env.ROOMS_KV) return null
    const raw = await env.ROOMS_KV.get(`answer:${roomId}`)
    return raw ? (JSON.parse(raw) as AnswerRecord) : null
  },
  async purgeExpired() {
    // KV natively expires; noop.
    return 0
  },
}

const r2Storage: Storage = {
  async saveRoom(env, record) {
    if (!env.ROOMS_BUCKET) throw new Error('ROOMS_BUCKET binding not configured')
    await env.ROOMS_BUCKET.put(`rooms/${record.roomId}.json`, JSON.stringify(record), {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: {
        hostName: record.hostName ?? '',
        gameId: record.gameId ?? '',
        expiresAt: String(record.expiresAt),
      },
    })
  },
  async loadRoom(env, roomId) {
    if (!env.ROOMS_BUCKET) return null
    const obj = await env.ROOMS_BUCKET.get(`rooms/${roomId}.json`)
    return obj ? ((await obj.json()) as RoomRecord) : null
  },
  async deleteRoom(env, roomId) {
    if (!env.ROOMS_BUCKET) return
    await Promise.all([
      env.ROOMS_BUCKET.delete(`rooms/${roomId}.json`),
      env.ROOMS_BUCKET.delete(`answers/${roomId}.json`),
    ])
  },
  async listActiveRooms(env, now) {
    if (!env.ROOMS_BUCKET) return []
    const listed = await env.ROOMS_BUCKET.list({ prefix: 'rooms/', limit: 200 })
    const active: RoomRecord[] = []
    for (const obj of listed.objects) {
      const expiresAt = Number(obj.customMetadata?.expiresAt ?? '0')
      if (expiresAt <= now) continue
      const full = await env.ROOMS_BUCKET.get(obj.key)
      if (!full) continue
      active.push((await full.json()) as RoomRecord)
    }
    return active
  },
  async saveAnswer(env, record) {
    if (!env.ROOMS_BUCKET) throw new Error('ROOMS_BUCKET binding not configured')
    await env.ROOMS_BUCKET.put(`answers/${record.roomId}.json`, JSON.stringify(record), {
      httpMetadata: { contentType: 'application/json' },
    })
  },
  async loadAnswer(env, roomId) {
    if (!env.ROOMS_BUCKET) return null
    const obj = await env.ROOMS_BUCKET.get(`answers/${roomId}.json`)
    return obj ? ((await obj.json()) as AnswerRecord) : null
  },
  async purgeExpired(env, now) {
    if (!env.ROOMS_BUCKET) return 0
    const listed = await env.ROOMS_BUCKET.list({ prefix: 'rooms/', limit: 1000 })
    const deletions: Promise<void>[] = []
    let count = 0
    for (const obj of listed.objects) {
      const expiresAt = Number(obj.customMetadata?.expiresAt ?? '0')
      if (expiresAt > now) continue
      const roomId = obj.key.replace(/^rooms\//, '').replace(/\.json$/, '')
      deletions.push(
        env.ROOMS_BUCKET.delete(`rooms/${roomId}.json`).then(() => undefined),
        env.ROOMS_BUCKET.delete(`answers/${roomId}.json`).then(() => undefined),
      )
      count += 1
    }
    await Promise.all(deletions)
    return count
  },
}

const d1Storage: Storage = {
  async saveRoom(env, record) {
    if (!env.DB) throw new Error('DB binding not configured')
    await env.DB.prepare(
      'INSERT OR REPLACE INTO rooms (roomId, hostName, gameId, location, offer, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      record.roomId,
      record.hostName ?? null,
      record.gameId ?? null,
      record.location ? JSON.stringify(record.location) : null,
      JSON.stringify(record.offer),
      record.createdAt,
      record.expiresAt
    ).run()
  },
  async loadRoom(env, roomId) {
    if (!env.DB) return null
    const row = await env.DB.prepare('SELECT * FROM rooms WHERE roomId = ?').bind(roomId).first<{
      roomId: string;
      hostName: string | null;
      gameId: string | null;
      location: string | null;
      offer: string;
      createdAt: number;
      expiresAt: number;
    }>()
    if (!row) return null
    return {
      roomId: row.roomId,
      hostName: row.hostName ?? undefined,
      gameId: row.gameId ?? undefined,
      location: row.location ? JSON.parse(row.location) : undefined,
      offer: JSON.parse(row.offer),
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    }
  },
  async deleteRoom(env, roomId) {
    if (!env.DB) return
    await env.DB.batch([
      env.DB.prepare('DELETE FROM rooms WHERE roomId = ?').bind(roomId),
      env.DB.prepare('DELETE FROM answers WHERE roomId = ?').bind(roomId)
    ])
  },
  async listActiveRooms(env, now) {
    if (!env.DB) return []
    const { results } = await env.DB.prepare('SELECT * FROM rooms WHERE expiresAt > ? LIMIT 200').bind(now).all<{
      roomId: string;
      hostName: string | null;
      gameId: string | null;
      location: string | null;
      offer: string;
      createdAt: number;
      expiresAt: number;
    }>()
    if (!results) return []
    return results.map(row => ({
      roomId: row.roomId,
      hostName: row.hostName ?? undefined,
      gameId: row.gameId ?? undefined,
      location: row.location ? JSON.parse(row.location) : undefined,
      offer: JSON.parse(row.offer),
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    }))
  },
  async saveAnswer(env, record) {
    if (!env.DB) throw new Error('DB binding not configured')
    await env.DB.prepare(
      'INSERT OR REPLACE INTO answers (roomId, guestName, answer, createdAt) VALUES (?, ?, ?, ?)'
    ).bind(
      record.roomId,
      record.guestName ?? null,
      JSON.stringify(record.answer),
      record.createdAt
    ).run()
  },
  async loadAnswer(env, roomId) {
    if (!env.DB) return null
    const row = await env.DB.prepare('SELECT * FROM answers WHERE roomId = ?').bind(roomId).first<{
      roomId: string;
      guestName: string | null;
      answer: string;
      createdAt: number;
    }>()
    if (!row) return null
    return {
      roomId: row.roomId,
      guestName: row.guestName ?? undefined,
      answer: JSON.parse(row.answer),
      createdAt: row.createdAt,
    }
  },
  async purgeExpired(env, now) {
    if (!env.DB) return 0
    const res = await env.DB.batch([
      env.DB.prepare('DELETE FROM rooms WHERE expiresAt <= ?').bind(now),
      env.DB.prepare('DELETE FROM answers WHERE createdAt <= ?').bind(now - 300000)
    ])
    const changes = (res[0]?.meta?.changes ?? 0) + (res[1]?.meta?.changes ?? 0)
    return changes
  },
}

const storage: Storage = STORAGE === 'd1' ? d1Storage : STORAGE === 'r2' ? r2Storage : kvStorage

/* ------------------------------------------------------------------
 * Router
 * ------------------------------------------------------------------ */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const method = request.method.toUpperCase()

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) })
    }

    try {
      if (method === 'POST' && url.pathname === '/room') {
        const payload = await readJson<{ roomId: string; hostName?: string; gameId?: string; location?: RoomRecord['location'] }>(request)
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
        await storage.saveRoom(env, record)
        return jsonResponse(200, { ok: true, roomId: record.roomId, expiresAt: record.expiresAt }, env)
      }

      if (method === 'GET' && url.pathname === '/room') {
        const roomId = url.searchParams.get('roomId')
        if (!roomId) return textResponse(400, 'roomId required', env)
        const record = await storage.loadRoom(env, roomId)
        if (!record) return textResponse(404, 'not found', env)
        if (record.expiresAt <= Date.now()) return textResponse(410, 'expired', env)
        return jsonResponse(200, record.offer, env)
      }

      if (method === 'DELETE' && url.pathname === '/room') {
        const roomId = url.searchParams.get('roomId')
        if (!roomId) return textResponse(400, 'roomId required', env)
        await storage.deleteRoom(env, roomId)
        return jsonResponse(200, { ok: true }, env)
      }

      if (method === 'GET' && url.pathname === '/rooms') {
        const now = Date.now()
        const rooms = await storage.listActiveRooms(env, now)
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
        // 이미 answer 있으면 정원 초과 (2인 게임 기준)
        const existing = await storage.loadAnswer(env, payload.roomId)
        if (existing) return textResponse(409, 'room is full', env)
        const record: AnswerRecord = {
          roomId: payload.roomId,
          guestName: payload.guestName,
          answer: payload,
          createdAt: Date.now(),
        }
        await storage.saveAnswer(env, record)
        // /rooms 리스트에서 즉시 사라지도록 offer 폐기 (answer는 host가 폴링 완료할 때까지 유지)
        if (STORAGE === 'd1' && env.DB) {
          await env.DB.prepare('DELETE FROM rooms WHERE roomId = ?').bind(payload.roomId).run()
        } else if (STORAGE === 'kv' && env.ROOMS_KV) {
          await env.ROOMS_KV.delete(`room:${payload.roomId}`)
        } else if (env.ROOMS_BUCKET) {
          await env.ROOMS_BUCKET.delete(`rooms/${payload.roomId}.json`)
        }
        return jsonResponse(200, { ok: true }, env)
      }

      if (method === 'GET' && url.pathname === '/answer') {
        const roomId = url.searchParams.get('roomId')
        if (!roomId) return textResponse(400, 'roomId required', env)
        const record = await storage.loadAnswer(env, roomId)
        if (!record) return textResponse(404, 'not yet', env)
        return jsonResponse(200, record.answer, env)
      }

      if (method === 'GET' && url.pathname === '/') {
        return jsonResponse(200, { service: 'minidamo-api', ok: true, storage: STORAGE }, env)
      }

      return textResponse(404, 'not found', env)
    } catch (err) {
      console.error('handler error', err)
      return textResponse(500, 'server error', env)
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      storage.purgeExpired(env, Date.now()).then((n) => {
        if (n > 0) console.log(`purged ${n} expired rooms`)
      }),
    )
  },
}
