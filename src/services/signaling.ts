/*
 * Cloudflare Worker signaling client.
 *
 * All routes are optional — if VITE_SIGNALING_URL is empty the client
 * degrades to QR-only mode. Every fetch has a hard timeout so a slow
 * network never blocks the UI.
 */

import type { SignalingPayload } from './rtc'

const DEFAULT_TIMEOUT_MS = 6000

export interface RoomSummary {
  roomId: string;
  hostName: string;
  gameId: string;
  location?: { lat: number; lon: number; acc: number };
  createdAt: number;
  expiresAt: number;
}

export interface SignalingConfig {
  baseUrl: string;
}

function envConfig(): SignalingConfig | null {
  const url = import.meta.env.VITE_SIGNALING_URL?.trim()
  if (!url) return null
  return { baseUrl: url.replace(/\/+$/, '') }
}

function timeoutFetch(url: string, init: RequestInit, timeout = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

export function isSignalingAvailable(): boolean {
  return envConfig() !== null
}

export async function publishRoom(offer: SignalingPayload): Promise<void> {
  const cfg = envConfig()
  if (!cfg) throw new Error('Signaling URL not configured')
  const res = await timeoutFetch(`${cfg.baseUrl}/room`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(offer),
  })
  if (!res.ok) throw new Error(`publishRoom failed: ${res.status}`)
}

export async function fetchRooms(): Promise<RoomSummary[]> {
  const cfg = envConfig()
  if (!cfg) return []
  try {
    const res = await timeoutFetch(`${cfg.baseUrl}/rooms`, { method: 'GET' })
    if (!res.ok) return []
    const data = (await res.json()) as { rooms: RoomSummary[] }
    return Array.isArray(data.rooms) ? data.rooms : []
  } catch {
    return []
  }
}

export async function fetchRoomOffer(roomId: string): Promise<SignalingPayload | null> {
  const cfg = envConfig()
  if (!cfg) return null
  try {
    const res = await timeoutFetch(`${cfg.baseUrl}/room?roomId=${encodeURIComponent(roomId)}`, { method: 'GET' })
    if (!res.ok) return null
    return (await res.json()) as SignalingPayload
  } catch {
    return null
  }
}

export async function submitAnswer(answer: SignalingPayload): Promise<void> {
  const cfg = envConfig()
  if (!cfg) throw new Error('Signaling URL not configured')
  const res = await timeoutFetch(`${cfg.baseUrl}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(answer),
  })
  if (!res.ok) throw new Error(`submitAnswer failed: ${res.status}`)
}

export async function pollAnswer(roomId: string): Promise<SignalingPayload | null> {
  const cfg = envConfig()
  if (!cfg) return null
  try {
    const res = await timeoutFetch(`${cfg.baseUrl}/answer?roomId=${encodeURIComponent(roomId)}`, { method: 'GET' })
    if (res.status === 404) return null
    if (!res.ok) return null
    return (await res.json()) as SignalingPayload
  } catch {
    return null
  }
}

export async function deleteRoom(roomId: string): Promise<void> {
  const cfg = envConfig()
  if (!cfg) return
  try {
    await timeoutFetch(`${cfg.baseUrl}/room?roomId=${encodeURIComponent(roomId)}`, { method: 'DELETE' })
  } catch {
    // best-effort cleanup
  }
}
