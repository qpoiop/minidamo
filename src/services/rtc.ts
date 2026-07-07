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
  onCandidateType?: (type: 'host' | 'srflx' | 'prflx' | 'relay') => void;
}

const DEFAULT_ICE: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  // Public relay (Metered / openrelay). Rate-limited but usable for
  // dev + emergency fallback when the env-configured TURN isn't set.
  // For production traffic swap in a dedicated TURN via env vars
  // (VITE_TURN_URL / VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL) and
  // this line stops mattering.
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

// Hard cap; in practice iceGatheringState=='complete' fires way before
// this and we resolve immediately. We only really wait if the network is
// hostile. 2.5s covers typical mobile STUN roundtrips + a host candidate;
// going tighter (we tried 1.2s) shipped incomplete ICE that stalled the
// online handshake.
const ICE_GATHER_TIMEOUT_MS = 2500
// Once we have at least this many candidates AND `ICE_EARLY_PUBLISH_MS`
// has elapsed we resolve early — most calls come back in ~500–1200ms
// instead of blocking the whole timeout.
const ICE_EARLY_CANDIDATES = 2
const ICE_EARLY_PUBLISH_MS = 900
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
  const session = wireSession(pc, null, events)
  pc.ondatachannel = (e) => {
    // Setter binds the channel event handlers and updates the closure that
    // session.send / session.close read from.
    session.dc = e.channel
    if (e.channel.readyState === 'open') {
      events.onOpen()
    }
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
  initialDc: RTCDataChannel | null,
  events: RtcSessionEvents,
): RtcSession {
  // `send` and `close` must always read the *current* data channel — guest
  // side receives its channel asynchronously via `pc.ondatachannel`, so the
  // channel handed in at construction time is often null. Using a mutable
  // holder ensures both host (dc provided upfront) and guest (dc arrives
  // later) share the same read/write path.
  const dcHolder: { current: RTCDataChannel | null } = { current: initialDc }
  if (dcHolder.current) bindDataChannel(dcHolder.current, events)

  pc.oniceconnectionstatechange = () => events.onIceStateChange?.(pc.iceConnectionState)

  const gathered: RTCIceCandidateInit[] = []
  pc.onicecandidate = (e) => {
    if (!e.candidate) return
    gathered.push(e.candidate.toJSON())
    // Parse candidate string for type. Fields:
    // "candidate:foundation component protocol priority ip port typ <type> ..."
    // Values: host / srflx (server-reflexive) / prflx (peer-reflexive) / relay
    const raw = e.candidate.candidate
    const m = raw.match(/ typ (host|srflx|prflx|relay)/)
    if (m && events.onCandidateType) {
      events.onCandidateType(m[1] as 'host' | 'srflx' | 'prflx' | 'relay')
    }
  }

  const waitForIceGathering = () =>
    new Promise<RTCIceCandidateInit[]>((resolve) => {
      let done = false
      const started = Date.now()
      const finish = () => {
        if (done) return
        done = true
        clearTimeout(hardTimer)
        clearInterval(pollTimer)
        pc.removeEventListener('icegatheringstatechange', onStateChange)
        resolve([...gathered])
      }
      if (pc.iceGatheringState === 'complete') {
        resolve([...gathered])
        return
      }
      const onStateChange = () => {
        if (pc.iceGatheringState === 'complete') finish()
      }
      pc.addEventListener('icegatheringstatechange', onStateChange)
      const hardTimer = setTimeout(finish, ICE_GATHER_TIMEOUT_MS)
      // Early-exit poll: once we already have a healthy candidate set and
      // ICE_EARLY_PUBLISH_MS has elapsed, don't keep waiting.
      const pollTimer = setInterval(() => {
        if (gathered.length >= ICE_EARLY_CANDIDATES && Date.now() - started >= ICE_EARLY_PUBLISH_MS) {
          finish()
        }
      }, 100)
    })

  const send = (data: unknown) => {
    const dc = dcHolder.current
    if (!dc || dc.readyState !== 'open') return
    try { dc.send(typeof data === 'string' ? data : JSON.stringify(data)) } catch (err) {
      console.warn('DC send failed', err)
    }
  }

  const close = () => {
    // Detach every callback BEFORE tearing the transport down.
    // Otherwise dc.onclose / pc.oniceconnectionstatechange fire during
    // the close synchronously and the useRoom event proxy pushes the
    // room state back to WAITING right after teardown() set it to IDLE
    // — that leftover WAITING was the reason "홈 → 주변찾기" fell
    // through to the room-screen branch instead of the JOIN search UI.
    const dc = dcHolder.current
    if (dc) {
      dc.onopen = null
      dc.onclose = null
      dc.onerror = null
      dc.onmessage = null
      try { dc.close() } catch { /* ignore */ }
    }
    pc.onicecandidate = null
    pc.oniceconnectionstatechange = null
    pc.onicegatheringstatechange = null
    pc.ondatachannel = null
    try { pc.close() } catch { /* ignore */ }
  }

  const session: RtcSession = {
    pc,
    get dc() { return dcHolder.current },
    set dc(next: RTCDataChannel | null) {
      if (dcHolder.current === next) return
      dcHolder.current = next
      if (next) bindDataChannel(next, events)
    },
    waitForIceGathering,
    send,
    close,
  }
  return session
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
 * Compresses the payload using native deflate compression to keep the QR code density low.
 */
export async function encodeSignal(payload: SignalingPayload): Promise<string> {
  const str = JSON.stringify(payload)
  const stream = new Response(str).body
    ?.pipeThrough(new CompressionStream('deflate'))
  if (!stream) throw new Error('CompressionStream not supported')
  const buffer = await new Response(stream).arrayBuffer()
  const bytes = new Uint8Array(buffer)
  
  // Safe base64 encoding for browser environment
  let binary = ''
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export async function decodeSignal(text: string): Promise<SignalingPayload> {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const stream = new Response(bytes).body
    ?.pipeThrough(new DecompressionStream('deflate'))
  if (!stream) throw new Error('DecompressionStream not supported')
  const decompressed = await new Response(stream).text()
  
  const parsed = JSON.parse(decompressed) as SignalingPayload
  if (parsed.v !== 1 || (parsed.kind !== 'offer' && parsed.kind !== 'answer')) {
    throw new Error('Unsupported signal payload')
  }
  return parsed
}

/** 4-digit numeric room code (1000–9999). Small space (~9k) is fine for
 * the near-field / same-friend-group use case; collisions on the worker
 * side just overwrite the room and the earlier host's answer poll times
 * out. */
export function generateRoomId(): string {
  const buf = crypto.getRandomValues(new Uint32Array(1))
  const n = (buf[0] % 9000) + 1000
  return String(n)
}

/**
 * Trim an ICE candidate list to keep the offline QR payload small.
 * For direct P2P on the same LAN we only need host + srflx candidates
 * (drop relay + tcp typ which are the biggest strings).
 */
export function compactIceForQr(list: RTCIceCandidateInit[]): RTCIceCandidateInit[] {
  return list.filter((c) => {
    const s = (c.candidate ?? '').toLowerCase()
    if (!s) return true
    if (s.includes('typ relay')) return false
    if (s.includes(' tcp ')) return false
    return true
  })
}

/**
 * Return a shallow copy of a signaling payload with QR-friendly ICE.
 */
export function compactPayloadForQr(p: SignalingPayload): SignalingPayload {
  return { ...p, ice: compactIceForQr(p.ice) }
}
