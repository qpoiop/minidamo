/*
 * Native WebRTC wrapper.
 *
 * Encapsulates RTCPeerConnection + a single RTCDataChannel for game traffic.
 * Signaling payloads (offer / answer) are shaped as JSON so they can travel
 * over Cloudflare Worker HTTP or QR code equally.
 */

export interface RTCConfig {
  iceServers: RTCIceServer[];
  iceTransportPolicy?: RTCIceTransportPolicy;
}

export interface SignalingPayload {
  v: 1;
  kind: 'offer' | 'answer';
  roomId: string;
  sdp: RTCSessionDescriptionInit;
  ice: RTCIceCandidateInit[];
  createdAt: number;
  hostName?: string;
  guestName?: string;
  gameId?: string;
  location?: { lat: number; lon: number; acc: number };
}

export interface RtcSessionEvents {
  onOpen: () => void;
  onClose: () => void;
  onError: (err: unknown) => void;
  onMessage: (data: unknown) => void;
  onIceStateChange?: (state: RTCIceConnectionState) => void;
}

const DEFAULT_ICE: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
]

const ICE_GATHER_TIMEOUT_MS = 4000
const DATA_CHANNEL_LABEL = 'minidamo'

export function buildIceServers(env: {
  turnUrl?: string;
  turnUsername?: string;
  turnCredential?: string;
}): RTCIceServer[] {
  const list = [...DEFAULT_ICE]
  if (env.turnUrl && env.turnUsername && env.turnCredential) {
    list.push({
      urls: env.turnUrl,
      username: env.turnUsername,
      credential: env.turnCredential,
    })
  }
  return list
}

export interface RtcSession {
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  waitForIceGathering: () => Promise<RTCIceCandidateInit[]>;
  send: (data: unknown) => void;
  close: () => void;
}

/**
 * Host side. Creates connection, opens data channel, produces offer.
 */
export async function createHostSession(
  config: RTCConfig,
  events: RtcSessionEvents,
): Promise<{ session: RtcSession; localDescription: RTCSessionDescriptionInit }> {
  const pc = new RTCPeerConnection(config)
  const dc = pc.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true })
  const session = wireSession(pc, dc, events)

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  return { session, localDescription: offer }
}

/**
 * Guest side. Waits for host offer, returns answer.
 */
export async function createGuestSession(
  config: RTCConfig,
  events: RtcSessionEvents,
  remoteOffer: RTCSessionDescriptionInit,
  remoteIce: RTCIceCandidateInit[],
): Promise<{ session: RtcSession; localDescription: RTCSessionDescriptionInit }> {
  const pc = new RTCPeerConnection(config)
  let dc: RTCDataChannel | null = null
  const session = wireSession(pc, null, events)
  pc.ondatachannel = (e) => {
    dc = e.channel
    session.dc = dc
    bindDataChannel(dc, events)
  }

  await pc.setRemoteDescription(remoteOffer)
  for (const cand of remoteIce) {
    try { await pc.addIceCandidate(cand) } catch (err) { console.warn('addIceCandidate failed', err) }
  }
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  return { session, localDescription: answer }
}

/**
 * Host side. Once guest answer arrives, apply to complete the handshake.
 */
export async function applyRemoteAnswer(
  session: RtcSession,
  remoteAnswer: RTCSessionDescriptionInit,
  remoteIce: RTCIceCandidateInit[],
): Promise<void> {
  await session.pc.setRemoteDescription(remoteAnswer)
  for (const cand of remoteIce) {
    try { await session.pc.addIceCandidate(cand) } catch (err) { console.warn('addIceCandidate failed', err) }
  }
}

function wireSession(
  pc: RTCPeerConnection,
  dc: RTCDataChannel | null,
  events: RtcSessionEvents,
): RtcSession {
  if (dc) bindDataChannel(dc, events)
  pc.oniceconnectionstatechange = () => events.onIceStateChange?.(pc.iceConnectionState)

  const gathered: RTCIceCandidateInit[] = []
  pc.onicecandidate = (e) => {
    if (e.candidate) gathered.push(e.candidate.toJSON())
  }

  const waitForIceGathering = () =>
    new Promise<RTCIceCandidateInit[]>((resolve) => {
      const finish = () => resolve([...gathered])
      if (pc.iceGatheringState === 'complete') {
        finish()
        return
      }
      const timer = setTimeout(finish, ICE_GATHER_TIMEOUT_MS)
      const check = () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timer)
          pc.removeEventListener('icegatheringstatechange', check)
          finish()
        }
      }
      pc.addEventListener('icegatheringstatechange', check)
    })

  const send = (data: unknown) => {
    if (!dc || dc.readyState !== 'open') return
    try { dc.send(typeof data === 'string' ? data : JSON.stringify(data)) } catch (err) {
      console.warn('DC send failed', err)
    }
  }

  const close = () => {
    try { dc?.close() } catch { /* ignore */ }
    try { pc.close() } catch { /* ignore */ }
  }

  return { pc, dc, waitForIceGathering, send, close }
}

function bindDataChannel(dc: RTCDataChannel, events: RtcSessionEvents) {
  dc.onopen = () => events.onOpen()
  dc.onclose = () => events.onClose()
  dc.onerror = (e) => events.onError(e)
  dc.onmessage = (e) => {
    const raw = e.data
    if (typeof raw === 'string') {
      try {
        events.onMessage(JSON.parse(raw))
      } catch {
        events.onMessage(raw)
      }
    } else {
      events.onMessage(raw)
    }
  }
}

/**
 * Encode / decode signaling payloads for QR transport.
 * Payload is small enough for a single QR at medium error correction for typical SDPs.
 */
export function encodeSignal(payload: SignalingPayload): string {
  return JSON.stringify(payload)
}

export function decodeSignal(text: string): SignalingPayload {
  const parsed = JSON.parse(text) as SignalingPayload
  if (parsed.v !== 1 || (parsed.kind !== 'offer' && parsed.kind !== 'answer')) {
    throw new Error('Unsupported signal payload')
  }
  return parsed
}

export function generateRoomId(): string {
  const rand = crypto.getRandomValues(new Uint8Array(9))
  return Array.from(rand, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12)
}
