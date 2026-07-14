/*
 * useRoom — orchestrates the entire lifecycle:
 *   session setup (WebRTC), signaling (Worker or QR), game-state broadcast.
 *
 * Replaces the old usePeer hook. UI never touches raw RTCPeerConnection.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyRemoteAnswer,
  buildIceServers,
  compactPayloadForQr,
  createGuestSession,
  createHostSession,
  decodeSignal,
  encodeSignal,
  generateRoomId,
} from '../services/rtc'
import type { RtcSession, SignalingPayload } from '../services/rtc'
import {
  fetchRooms,
  fetchRoomOffer,
  fetchTurnCredentials,
  isSignalingAvailable,
  pollAnswer,
  publishRoom,
  submitAnswer,
  deleteRoom,
} from '../services/signaling'
import type { UserLocation } from './useLocation'
import { getDistance } from '../utils/distance'

export type ConnectionStatus =
  | 'IDLE'
  | 'INITIALIZING'
  | 'WAITING'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'ERROR'

export interface PlayerInfo {
  id: string;
  name: string;
  ready: boolean;
  isHost: boolean;
  location?: UserLocation;
}

export interface GameSettings {
  selectedGameId: string;
  rounds: number;
  /** Optional second-axis option value. Currently used by Wavelength
   * (오차 범위 × 승리 점수). Games without a second axis leave it
   * undefined. */
  rounds2?: number;
}

export interface NearbyRoom {
  peerId: string;   // roomId — kept name for backwards-compat with lobby UI
  hostName: string;
  gameId: string;
  location: UserLocation;
  distance: number;
  timestamp: number;
}

export type P2PMessage = {
  type: 'LOBBY_STATE' | 'GAME_START' | 'GAME_ACTION' | 'GAME_RESET' | 'HEARTBEAT' | 'HEARTBEAT_ACK' | 'GPS_UPDATE' | 'DISCONNECT' | 'CHAT';
  senderId: string;
  timestamp: number;
  payload: {
    location?: UserLocation | null;
    originalTime?: number;
    isCodeConnection?: boolean;
    players?: PlayerInfo[];
    gameSettings?: GameSettings;
    gameId?: string;
    action?: string;
    cellIdx?: number;
    symbol?: string;
    actionType?: string;
    text?: string;
    senderName?: string;
    x?: number;
    ballX?: number;
    ballY?: number;
    hostScore?: number;
    guestScore?: number;
    winner?: string | null;
    /** 신규 4종(쿼리모/모빈치/모디언트릭/모루먼쇼) 등 복합 상태를
     * 실어 나르기 위한 자유 필드. JSON-직렬화 가능한 구조. 기존 게임은
     * 사용 안 하므로 optional. 게임별 protocol 문서 참조. */
    gameData?: unknown;
  };
}

export interface RoomState {
  peerId: string;
  connectionStatus: ConnectionStatus;
  reconnectCountdown: number | null;
  players: PlayerInfo[];
  gameSettings: GameSettings;
  nearbyRooms: NearbyRoom[];
  distance: number | null;
  rtt: number | null;
  error: string | null;
  isHost: boolean;
  isCodeConnection: boolean;
  offlineOffer: string | null; // JSON payload for QR (host, offline mode)
  offlineAnswer: string | null; // JSON payload for QR (guest, offline mode)
  waitExpiresAt: number | null; // host: 대기 만료 timestamp (ms epoch)
  waitExpired: boolean;         // host: TTL 초과 후 재대기 필요
  createRoom: () => Promise<void>;
  restartWait: () => Promise<void>; // host: 만료 후 재발행 + 재폴링
  restoreHostRoom: (roomId: string, gameId: string) => Promise<void>; // host: 콜드 리스토어 — 동일 roomId 로 세션 재구성
  reconnectHostSession: () => Promise<void>; // host: GAME_PLAY 중 RECONNECTING — 동일 roomId 로 세션 재구성 (roster 보존)
  joinRoom: (targetRoomId: string, viaCode?: boolean, keepRemoteRoom?: boolean) => Promise<void>;
  searchNearbyRooms: () => Promise<void>;
  toggleReady: () => void;
  updateGameSettings: (s: Partial<GameSettings>) => void;
  handleDisconnect: () => void;
  leaveRoom: () => void;
  sendMessage: (msg: P2PMessage) => void;
  ingestGuestSignal: (rawText: string) => Promise<void>; // host absorbs guest QR
  ingestHostSignal: (rawText: string) => Promise<void>;  // guest absorbs host QR
  iceState: RTCIceConnectionState | null;
  dcState: RTCDataChannelState | null;
  diagLog: Array<{ ts: number; text: string }>;
  candTypes: Record<'host' | 'srflx' | 'prflx' | 'relay', number>;
}

const ANSWER_POLL_INTERVAL_MS = 3000
const ANSWER_POLL_MAX_MS = 5 * 60_000
const HEARTBEAT_INTERVAL_MS = 2000
const CONNECTION_LOSS_MS = 6500
// Guest-side online join has no server-driven ceiling like the host's
// answer poll — without this, a stalled ICE handshake (checking forever,
// common on restrictive NAT / iOS Safari) left the guest on an indefinite
// "보안 연결 설정 중" spinner with no error and no automatic way back.
const JOIN_CONNECT_TIMEOUT_MS = 20_000
// Extended reconnect window so brief screen locks / tab switches don't
// permanently sink a session. iOS/Android suspend WebRTC after ~10 s in
// the background — pushed the ceiling up so a paused user has room to
// return before we tear everything down.
const RECONNECT_WINDOW_S = 180
const NEARBY_RADIUS_M = 20

const staticIceConfig = {
  iceServers: buildIceServers({
    turnUrl: import.meta.env.VITE_TURN_URL,
    turnUsername: import.meta.env.VITE_TURN_USERNAME,
    turnCredential: import.meta.env.VITE_TURN_CREDENTIAL,
  }),
}

/** Fetch Cloudflare Realtime TURN credentials (via Worker) and merge
 * them into the base iceServers pool. If the fetch fails we fall back
 * to the static pool so the session still tries direct/openrelay. */
async function buildIceConfigWithTurn(): Promise<{ iceServers: RTCIceServer[] }> {
  const dynamic = await fetchTurnCredentials()
  if (!dynamic) return staticIceConfig
  return {
    iceServers: [
      ...staticIceConfig.iceServers,
      { urls: dynamic.urls, username: dynamic.username, credential: dynamic.credential },
    ],
  }
}

export function useRoom(userName: string, userLocation: UserLocation | null): RoomState {
  const [peerId, setPeerId] = useState<string>('')
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('IDLE')
  const [reconnectCountdown, setReconnectCountdown] = useState<number | null>(null)
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [gameSettings, setGameSettings] = useState<GameSettings>({ selectedGameId: 'memory', rounds: 3 })
  const [nearbyRooms, setNearbyRooms] = useState<NearbyRoom[]>([])
  const [distance, setDistance] = useState<number | null>(null)
  const [rtt, setRtt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isHost, setIsHost] = useState<boolean>(false)
  const [isCodeConnection, setIsCodeConnection] = useState<boolean>(false)
  const [offlineOffer, setOfflineOffer] = useState<string | null>(null)
  const [offlineAnswer, setOfflineAnswer] = useState<string | null>(null)
  const [waitExpiresAt, setWaitExpiresAt] = useState<number | null>(null)
  const [waitExpired, setWaitExpired] = useState<boolean>(false)
  // ---- On-screen diagnostics (mobile can't easily read the console) ----
  const [iceState, setIceState] = useState<RTCIceConnectionState | null>(null)
  const [dcState, setDcState] = useState<RTCDataChannelState | null>(null)
  const [diagLog, setDiagLog] = useState<Array<{ ts: number; text: string }>>([])
  const pushDiag = useCallback((text: string) => {
    setDiagLog((prev) => {
      const next = [...prev, { ts: Date.now(), text }]
      return next.length > 10 ? next.slice(-10) : next
    })
  }, [])

  const sessionRef = useRef<RtcSession | null>(null)
  const peerIdRef = useRef<string>('')
  const isHostRef = useRef<boolean>(false)
  /** Latest gameSettings — read at broadcast time so the LOBBY_STATE
   * flushed to a late-joining guest carries whatever the host picked
   * BETWEEN room creation and the guest's answer. Without this ref,
   * `startAnswerPoll`'s closure captured the settings from mount and
   * a mid-wait change quietly reverted after the guest joined. */
  const gameSettingsRef = useRef<GameSettings>({ selectedGameId: 'memory', rounds: 3 })
  useEffect(() => { gameSettingsRef.current = gameSettings }, [gameSettings])
  const pendingHostOfferRef = useRef<SignalingPayload | null>(null)
  const answerPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const joinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Bumped on every teardown() — an in-flight joinRoom/ingestHostSignal
   * call captures its value at start and checks it after each await, so a
   * "방 나가기" (or a second join attempt) fired mid-handshake stops the
   * abandoned attempt from writing stale players/session state or, worse,
   * still POSTing an answer for a room the user already left. */
  const connectAttemptRef = useRef<number>(0)
  const lastRecvRef = useRef<number>(Date.now())
  const lastSentTsRef = useRef<number>(0)
  const outboundQueueRef = useRef<P2PMessage[]>([])
  const MAX_QUEUE = 32

  /**
   * Queue-aware outbound. Every internal broadcast (LOBBY_STATE from
   * host/guest, ready toggle, restart signals, etc.) routes through here
   * so a not-yet-open DC doesn't silently drop the packet. rtc.send is
   * a no-op while readyState !== 'open'; the queue drains as soon as
   * connectionStatus flips to CONNECTED.
   */
  const enqueueOut = useCallback((msg: P2PMessage) => {
    const s = sessionRef.current
    const dc = s?.dc
    if (s && dc && dc.readyState === 'open') {
      s.send(msg)
      return
    }
    const q = outboundQueueRef.current
    q.push(msg)
    if (q.length > MAX_QUEUE) q.splice(0, q.length - MAX_QUEUE)
  }, [])

  const teardown = useCallback((opts?: { skipRemoteDelete?: boolean }) => {
    connectAttemptRef.current += 1
    if (answerPollRef.current) {
      clearInterval(answerPollRef.current)
      answerPollRef.current = null
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
    if (joinTimeoutRef.current) {
      clearTimeout(joinTimeoutRef.current)
      joinTimeoutRef.current = null
    }
    try { sessionRef.current?.close() } catch { /* ignore */ }
    sessionRef.current = null
    pendingHostOfferRef.current = null
    if (peerIdRef.current && !opts?.skipRemoteDelete) void deleteRoom(peerIdRef.current)

    // Full identity reset — the same useRoom instance is reused across
    // create/join cycles, so any leftover peerId caused stale UI branches
    // (host code card leaking into a subsequent JOIN screen etc.).
    peerIdRef.current = ''
    setPeerId('')
    outboundQueueRef.current = []
    lastRecvRef.current = Date.now()
    lastSentTsRef.current = 0

    setConnectionStatus('IDLE')
    setPlayers([])
    setDistance(null)
    setRtt(null)
    setReconnectCountdown(null)
    setError(null)
    setOfflineOffer(null)
    setOfflineAnswer(null)
    setIsHost(false)
    isHostRef.current = false
    setIsCodeConnection(false)
    setWaitExpiresAt(null)
    setWaitExpired(false)
  }, [])

  useEffect(() => teardown, [teardown])

  // Any exit from CONNECTING (success, ICE failure, explicit error/back)
  // disarms the join watchdog — keeps it from firing a stale timeout after
  // the handshake already resolved one way or another.
  useEffect(() => {
    if (connectionStatus !== 'CONNECTING' && joinTimeoutRef.current) {
      clearTimeout(joinTimeoutRef.current)
      joinTimeoutRef.current = null
    }
  }, [connectionStatus])

  const startHeartbeat = useCallback(() => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    lastRecvRef.current = Date.now()
    heartbeatRef.current = setInterval(() => {
      const s = sessionRef.current
      if (!s) return
      const now = Date.now()
      lastSentTsRef.current = now
      s.send({
        type: 'HEARTBEAT',
        senderId: peerIdRef.current,
        timestamp: now,
        payload: { location: userLocation },
      })
      if (now - lastRecvRef.current > CONNECTION_LOSS_MS) {
        // Bug: heartbeat used to reset countdown to RECONNECT_WINDOW_S every
        // beat, so the visible timer never moved. Now we only flip status +
        // seed the countdown once per disconnection.
        setConnectionStatus((prev) => {
          if (prev === 'RECONNECTING') return prev
          setReconnectCountdown(RECONNECT_WINDOW_S)
          return 'RECONNECTING'
        })
      }
    }, HEARTBEAT_INTERVAL_MS)
  }, [userLocation])

  const handleDisconnect = useCallback(() => {
    // teardown() already resets every piece of room state to IDLE / empty.
    // Overriding the status to WAITING here would leave Lobby thinking it
    // was still mid-flow, which mis-renders the CREATE screen when the
    // user goes back and picks JOIN next.
    teardown()
  }, [teardown])

  // Local-leave only ("방 나가기" / back-gesture confirm) — sends an
  // explicit DISCONNECT so the remaining peer's overlay appears
  // immediately instead of waiting out CONNECTION_LOSS_MS/ICE timeout,
  // then tears down. Must stay separate from handleDisconnect (which
  // ALSO runs when we receive an inbound DISCONNECT) — sending from
  // there too would bounce a DISCONNECT back at a peer who just told us
  // they're leaving, the same ping-pong class of bug fixed for
  // GAME_START/GAME_RESET(LOBBY).
  const leaveRoom = useCallback(() => {
    const s = sessionRef.current
    if (s?.dc && s.dc.readyState === 'open') {
      try {
        s.send({
          type: 'DISCONNECT',
          senderId: peerIdRef.current,
          timestamp: Date.now(),
          payload: {},
        })
      } catch { /* ignore */ }
    }
    teardown()
  }, [teardown])

  const dispatchInbound = useCallback((raw: unknown) => {
    if (!raw || typeof raw !== 'object') return
    const msg = raw as P2PMessage
    if (!msg.type) return
    lastRecvRef.current = Date.now()
    setConnectionStatus('CONNECTED')
    setReconnectCountdown(null)
    if (msg.payload?.isCodeConnection) {
      setIsCodeConnection(true)
    }

    window.dispatchEvent(new CustomEvent('p2p_message', { detail: msg }))

    switch (msg.type) {
      case 'HEARTBEAT': {
        const s = sessionRef.current
        s?.send({
          type: 'HEARTBEAT_ACK',
          senderId: peerIdRef.current,
          timestamp: Date.now(),
          payload: { originalTime: msg.timestamp },
        })
        if (msg.payload?.location && userLocation) {
          setDistance(getDistance(
            userLocation.latitude, userLocation.longitude,
            msg.payload.location.latitude, msg.payload.location.longitude,
          ))
        }
        break
      }
      case 'HEARTBEAT_ACK':
        if (msg.payload?.originalTime) setRtt(Date.now() - msg.payload.originalTime)
        break
      case 'GPS_UPDATE':
        if (msg.payload?.location && userLocation) {
          setDistance(getDistance(
            userLocation.latitude, userLocation.longitude,
            msg.payload.location.latitude, msg.payload.location.longitude,
          ))
        }
        break
      case 'LOBBY_STATE':
        if (msg.payload?.players) setPlayers(msg.payload.players)
        if (msg.payload?.gameSettings) setGameSettings(msg.payload.gameSettings)
        break
      case 'DISCONNECT':
        handleDisconnect()
        break
    }
  }, [userLocation, handleDisconnect])

  const eventsRef = useRef<{
    onOpen: () => void;
    onClose: () => void;
    onError: (e: any) => void;
    onMessage: (msg: unknown) => void;
    onIceStateChange?: (state: RTCIceConnectionState) => void;
    onCandidateType?: (type: 'host' | 'srflx' | 'prflx' | 'relay') => void;
  }>({
    onOpen: () => {},
    onClose: () => {},
    onError: () => {},
    onMessage: () => {},
  })

  const eventsProxy = useMemo(() => ({
    onOpen: () => eventsRef.current.onOpen(),
    onClose: () => eventsRef.current.onClose(),
    onError: (e: any) => eventsRef.current.onError(e),
    onMessage: (msg: unknown) => eventsRef.current.onMessage(msg),
    onIceStateChange: (state: RTCIceConnectionState) => eventsRef.current.onIceStateChange?.(state),
    onCandidateType: (type: 'host' | 'srflx' | 'prflx' | 'relay') => eventsRef.current.onCandidateType?.(type),
  }), [])

  // Rolling candidate-type census — surfaces whether we managed to
  // gather a `relay` candidate (i.e. a working TURN server was reachable).
  const [candTypes, setCandTypes] = useState<Record<'host' | 'srflx' | 'prflx' | 'relay', number>>({
    host: 0, srflx: 0, prflx: 0, relay: 0,
  })

  useEffect(() => {
    eventsRef.current = {
      onOpen: () => {
        console.log('[useRoom] ✅ data channel OPEN')
        pushDiag('✅ 데이터 채널 open')
        setDcState('open')
        setConnectionStatus('CONNECTED')
        startHeartbeat()
      },
      onClose: () => {
        // teardown() nulls dc.onclose before calling dc.close(), so this
        // only fires for an unexpected remote-side drop — never for our
        // own explicit leave/teardown. Route it into the same
        // RECONNECTING + countdown path as the ICE 'disconnected'/'failed'
        // handlers below so the overlay/countdown appear immediately
        // instead of waiting on the next heartbeat's CONNECTION_LOSS_MS
        // check.
        console.log('[useRoom] ⚠️ data channel CLOSED')
        pushDiag('⚠️ 데이터 채널 close')
        setDcState('closed')
        setConnectionStatus((prev) => {
          if (prev === 'RECONNECTING') return prev
          setReconnectCountdown(RECONNECT_WINDOW_S)
          return 'RECONNECTING'
        })
      },
      onError: (e) => {
        console.error('[useRoom] ❌ RTC error', e)
        pushDiag('❌ RTC 오류')
      },
      onMessage: dispatchInbound,
      onIceStateChange: (state: RTCIceConnectionState) => {
        console.log(`[useRoom] 🧊 ICE state: ${state}`)
        setIceState(state)
        pushDiag(`🧊 ICE ${state}`)
        if (state === 'failed') {
          console.error('[useRoom] ICE traversal failed — likely no route. TURN or different network required.')
          pushDiag('❌ ICE 실패 (TURN 필요할 수 있음)')
          setConnectionStatus('RECONNECTING')
          setReconnectCountdown(RECONNECT_WINDOW_S)
        } else if (state === 'disconnected') {
          setConnectionStatus('RECONNECTING')
          setReconnectCountdown(RECONNECT_WINDOW_S)
        } else if (state === 'connected' || state === 'completed') {
          setConnectionStatus('CONNECTED')
        }
      },
      onCandidateType: (type) => {
        setCandTypes((prev) => ({ ...prev, [type]: prev[type] + 1 }))
        pushDiag(`🎯 candidate: ${type}`)
      },
    }
  }, [dispatchInbound, startHeartbeat, pushDiag])

  const startAnswerPoll = useCallback((roomId: string) => {
    if (answerPollRef.current) clearInterval(answerPollRef.current)
    const startedAt = Date.now()
    setWaitExpiresAt(startedAt + ANSWER_POLL_MAX_MS)
    setWaitExpired(false)
    console.log('[useRoom] answer poll started for', roomId)
    // Flag prevents concurrent callbacks from applying the same answer
    // twice. setInterval keeps ticking on schedule regardless of the
    // async callback duration, so if pollAnswer is slow the next tick
    // can already be running when the first one finishes clearing the
    // interval — a second applyRemoteAnswer against a `stable` state
    // fails with the "Called in wrong state" error we were seeing.
    let answerApplied = false
    answerPollRef.current = setInterval(async () => {
      if (answerApplied) return
      if (Date.now() - startedAt > ANSWER_POLL_MAX_MS) {
        if (answerPollRef.current) {
          clearInterval(answerPollRef.current)
          answerPollRef.current = null
        }
        setWaitExpired(true)
        setWaitExpiresAt(null)
        console.warn('[useRoom] answer poll window expired')
        return
      }
      const answer = await pollAnswer(roomId)
      if (!answer) return
      if (answerApplied) return  // recheck after await — another tick may have raced
      if (!sessionRef.current) {
        console.warn('[useRoom] answer arrived but session ref is gone')
        return
      }
      answerApplied = true
      if (answerPollRef.current) {
        clearInterval(answerPollRef.current)
        answerPollRef.current = null
      }
      setWaitExpiresAt(null)
      setWaitExpired(false)
      console.log('[useRoom] applying remote answer with', answer.ice?.length ?? 0, 'ice candidates')
      pushDiag(`📥 answer 수신 (ice ${answer.ice?.length ?? 0}개)`)
      try {
        await applyRemoteAnswer(sessionRef.current, answer.sdp, answer.ice)
        pushDiag('🔐 answer 적용 완료')
        const guestName = answer.guestName ?? '상대 피어'
        const updated: PlayerInfo[] = [
          { id: roomId, name: userName, ready: true, isHost: true, location: userLocation || undefined },
          { id: `${roomId}:guest`, name: guestName, ready: false, isHost: false },
        ]
        setPlayers(updated)
        // Queue the initial lobby state — enqueueOut hands it straight to
        // the DC if it's already open, otherwise buffers until CONNECTED
        // fires. Removes the previous fragile onopen chain.
        const flushLobbyState = () => enqueueOut({
          type: 'LOBBY_STATE',
          senderId: peerIdRef.current,
          timestamp: Date.now(),
          // Read from the ref so a host tweak between room creation and
          // the guest answering doesn't silently revert.
          payload: { players: updated, gameSettings: gameSettingsRef.current },
        })
        const dc = sessionRef.current.dc
        if (dc && dc.readyState === 'open') {
          setTimeout(flushLobbyState, 100)
        } else {
          const kickoff = () => {
            flushLobbyState()
            setConnectionStatus('CONNECTED')
          }
          if (dc) {
            const prevOpen = dc.onopen
            dc.onopen = (ev) => {
              if (typeof prevOpen === 'function') prevOpen.call(dc, ev)
              kickoff()
            }
          } else {
            // Guest may not have opened its channel yet on this side; fall
            // back to a short delay so the send happens once the RTC layer
            // finishes negotiating.
            setTimeout(kickoff, 800)
          }
        }
      } catch (e) {
        console.error('[useRoom] applyRemoteAnswer failed', e)
        setError('answer 적용 실패: ' + (e instanceof Error ? e.message : String(e)))
      }
    }, ANSWER_POLL_INTERVAL_MS)
  }, [userName, userLocation, gameSettings, pushDiag])

  // Shared by createRoom (fresh roomId) and restoreHostRoom (cold-restore,
  // same roomId as the pre-reload session) — builds a fresh RTCPeerConnection,
  // publishes an offer under `roomId`, and starts the answer poll. Caller
  // owns teardown()/peerIdRef/setPeerId and its own try/catch.
  const establishHostSession = useCallback(async (roomId: string, gameId: string, opts?: { waitingStatus?: ConnectionStatus; isStale?: () => boolean }) => {
    const iceConfig = await buildIceConfigWithTurn()
    const { session, localDescription } = await createHostSession(iceConfig, eventsProxy)
    if (opts?.isStale?.()) {
      // A newer rebuild superseded us (double-tap of reconnectHostSession's
      // retry button) or the room was left entirely (teardown() bumps the
      // same counter opts.isStale reads) while we were negotiating — the
      // outer caller's own post-await check runs too late to stop the
      // mutations below, so bail here, before this session ever touches
      // sessionRef/answerPollRef or gets published.
      try { session.close() } catch { /* ignore */ }
      return
    }
    sessionRef.current = session
    setIsHost(true)
    isHostRef.current = true
    pushDiag('🔧 host session 생성')

    setPlayers([{ id: roomId, name: userName, ready: true, isHost: true, location: userLocation || undefined }])

    const offer: SignalingPayload = {
      v: 1,
      kind: 'offer',
      roomId,
      sdp: localDescription,
      ice: [],
      createdAt: Date.now(),
      hostName: userName,
      gameId,
      location: userLocation
        ? { lat: userLocation.latitude, lon: userLocation.longitude, acc: userLocation.accuracy }
        : undefined,
    }
    pendingHostOfferRef.current = offer

    const gatheredIce = await session.waitForIceGathering()
    if (opts?.isStale?.()) {
      // Same as above, checked again after the (potentially long) ICE
      // gathering wait — otherwise we'd still start the answer poll and
      // publish the room below on behalf of an attempt nothing points to
      // anymore (e.g. the user already left via leaveRoom()).
      try { session.close() } catch { /* ignore */ }
      if (sessionRef.current === session) sessionRef.current = null
      return
    }
    offer.ice = gatheredIce
    pendingHostOfferRef.current = offer
    pushDiag(`🧊 host ice ${gatheredIce.length}개 · offer 발행`)

    // Kick off the answer poll immediately — /answer just returns 404
    // until the guest posts. Running it in parallel with publishRoom +
    // the offline-QR encode shaves visible latency off "방 만들기".
    startAnswerPoll(roomId)
    setWaitExpiresAt(Date.now() + ANSWER_POLL_MAX_MS)
    setWaitExpired(false)
    // Mid-game rebuild (reconnectHostSession) passes 'RECONNECTING' so the
    // GAME_PLAY overlay (keyed off that status) stays up through the whole
    // republish — 'WAITING' would drop it and expose the raw, opponent-less
    // game screen for the seconds this call takes.
    setConnectionStatus(opts?.waitingStatus ?? 'WAITING')

    // Offline QR encoding is CPU-only, publishRoom is network-bound;
    // fan them out so the slower one gates the UI, not their sum.
    const encodeOfflineTask = encodeSignal(compactPayloadForQr(offer))
      .then((encoded) => setOfflineOffer(encoded))
      .catch((e) => console.warn('offline offer encode failed', e))
    const publishTask = (isSignalingAvailable() && navigator.onLine)
      ? publishRoom(offer).catch((e) => {
          console.warn('publishRoom failed', e)
          setError('방 등록 실패 · 재시도해 주세요.')
        })
      : Promise.resolve()
    await Promise.all([encodeOfflineTask, publishTask])
  }, [eventsProxy, userName, userLocation, startAnswerPoll, pushDiag])

  const createRoom = useCallback(async () => {
    teardown()
    setConnectionStatus('INITIALIZING')
    setIsCodeConnection(false)
    const roomId = generateRoomId()
    peerIdRef.current = roomId
    setPeerId(roomId)
    pushDiag(`🏠 방 ${roomId} 생성`)

    try {
      await establishHostSession(roomId, gameSettingsRef.current.selectedGameId)
    } catch (e) {
      console.error('createRoom failed', e)
      // teardown() resets `error` to null — must run BEFORE setError, or the
      // message set here is immediately wiped by teardown's own reset and
      // the user sees a silent failure back on the CREATE screen.
      teardown()
      setError(e instanceof Error ? e.message : '방 생성 실패')
    }
  }, [teardown, establishHostSession, pushDiag])

  // Cold-restore counterpart to createRoom: the app fully reloaded (session
  // persisted to localStorage, in-memory RTCPeerConnection gone) and the
  // saved session says WE were the host. Unlike createRoom this must reuse
  // the SAME roomId — a guest who also cold-restores calls joinRoom(roomId)
  // expecting to find us there. A fresh RTCPeerConnection + offer is
  // required regardless (the old one died with the reload); deleteRoom
  // first clears the pre-reload room *and* answer records, otherwise the
  // guest's re-submitted answer gets rejected 409 ("이미 참가자가 있는 방")
  // by the stale answer still on file, and our own poll could apply that
  // same stale (mismatched-SDP) answer to the new session.
  const restoreHostRoom = useCallback(async (roomId: string, gameId: string) => {
    teardown()
    setConnectionStatus('INITIALIZING')
    setIsCodeConnection(false)
    peerIdRef.current = roomId
    setPeerId(roomId)
    setGameSettings((prev) => ({ ...prev, selectedGameId: gameId }))
    pushDiag(`🏠 방 ${roomId} 재구성`)

    try {
      await deleteRoom(roomId)
      await establishHostSession(roomId, gameId)
    } catch (e) {
      console.error('restoreHostRoom failed', e)
      teardown()
      setError(e instanceof Error ? e.message : '방 재접속 실패')
      throw e
    }
  }, [teardown, establishHostSession, pushDiag])

  // Host-side mid-game recovery: RECONNECTING fired (ICE/DC died) while
  // GAME_PLAY is still mounted with a live match — unlike restoreHostRoom
  // (cold app reload, clean slate, Lobby waits for a guest who also
  // reloaded) this must NOT reset to a solo roster or the game component
  // would see its opponent vanish mid-match. Rebuilds a fresh
  // RTCPeerConnection under the SAME roomId and republishes an offer so
  // the guest's own reconnect attempt (joinRoom with keepRemoteRoom) has
  // something fresh to fetch and answer.
  const reconnectHostSession = useCallback(async () => {
    if (!isHostRef.current) return
    const roomId = peerIdRef.current
    if (!roomId) return
    // Reuse the file's standard "am I still the latest attempt" guard
    // (see connectAttemptRef's doc comment) — a double-tap of the retry
    // button would otherwise run establishHostSession twice concurrently,
    // each writing sessionRef/answerPollRef out from under the other
    // (orphaned RTCPeerConnection, stomped poll interval).
    connectAttemptRef.current += 1
    const myAttempt = connectAttemptRef.current
    const stillCurrent = () => connectAttemptRef.current === myAttempt
    const preservedPlayers = players
    if (answerPollRef.current) { clearInterval(answerPollRef.current); answerPollRef.current = null }
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null }
    try { sessionRef.current?.close() } catch { /* ignore */ }
    sessionRef.current = null
    pendingHostOfferRef.current = null
    setConnectionStatus('RECONNECTING')
    try {
      await deleteRoom(roomId)
      if (!stillCurrent()) return
      await establishHostSession(roomId, gameSettingsRef.current.selectedGameId, {
        waitingStatus: 'RECONNECTING',
        isStale: () => !stillCurrent(),
      })
      if (!stillCurrent()) return
      // establishHostSession resets players to a host-only roster (correct
      // for a brand-new room) — restore the pre-existing roster so the
      // opponent doesn't disappear from GAME_PLAY while we wait for their
      // answer; mark them not-ready since the handshake is starting over.
      setPlayers(preservedPlayers.map((p) => (p.isHost ? p : { ...p, ready: false })))
    } catch (e) {
      if (!stillCurrent()) return
      console.error('reconnectHostSession failed', e)
      setError(e instanceof Error ? e.message : '재연결 실패')
      // Stay in RECONNECTING (not IDLE) — the countdown/overlay keep
      // offering another attempt instead of stranding the host on a dead
      // screen with no way back in.
    }
  }, [players, establishHostSession])

  const restartWait = useCallback(async () => {
    if (!isHostRef.current) return
    const roomId = peerIdRef.current
    const offer = pendingHostOfferRef.current
    if (!roomId || !offer || !sessionRef.current) {
      await createRoom()
      return
    }
    setError(null)
    setWaitExpired(false)
    setConnectionStatus('WAITING')
    const refreshed = { ...offer, createdAt: Date.now() }
    pendingHostOfferRef.current = refreshed
    setOfflineOffer(await encodeSignal(compactPayloadForQr(refreshed)))
    if (isSignalingAvailable() && navigator.onLine) {
      try {
        await publishRoom(refreshed)
        startAnswerPoll(roomId)
      } catch (e) {
        console.warn('republish failed', e)
        setError('방 재발행 실패')
      }
    } else {
      setWaitExpiresAt(Date.now() + ANSWER_POLL_MAX_MS)
    }
  }, [createRoom, startAnswerPoll])

  const joinRoom = useCallback(async (targetRoomId: string, viaCode?: boolean, keepRemoteRoom?: boolean) => {
    // keepRemoteRoom: this is a live mid-game retry (GAME_PLAY's "재접속
    // 시도" button), not a fresh join — peerIdRef.current already equals
    // targetRoomId, so teardown()'s ordinary deleteRoom would delete the
    // very room we're about to fetch (the host may have just republished
    // it for this exact retry). Skip that delete, and on failure fall back
    // to RECONNECTING (retry-able) instead of IDLE (dead end) — rebuilding
    // the room, if needed at all, is the host's responsibility
    // (reconnectHostSession), not ours.
    const failJoin = (msg: string) => {
      pushDiag(`❌ ${msg}`)
      // teardown() resets `error` to null — must run BEFORE setError, or
      // the message set here is immediately wiped by teardown's own reset
      // and the user sees a silent failure.
      teardown(keepRemoteRoom ? { skipRemoteDelete: true } : undefined)
      setError(msg)
      setConnectionStatus(keepRemoteRoom ? 'RECONNECTING' : 'IDLE')
    }

    teardown(keepRemoteRoom ? { skipRemoteDelete: true } : undefined)
    const myAttempt = connectAttemptRef.current
    const stillCurrent = () => connectAttemptRef.current === myAttempt

    setConnectionStatus(keepRemoteRoom ? 'RECONNECTING' : 'CONNECTING')
    setIsCodeConnection(!!viaCode)
    peerIdRef.current = targetRoomId
    setPeerId(targetRoomId)
    pushDiag(`📡 방 ${targetRoomId} 조회`)

    joinTimeoutRef.current = setTimeout(() => {
      if (!stillCurrent()) return
      failJoin('연결이 지연되고 있어요 · 다시 시도해 주세요.')
    }, JOIN_CONNECT_TIMEOUT_MS)

    try {
      if (!isSignalingAvailable() || !navigator.onLine) {
        // Must clear the watchdog explicitly here — the cleanup effect
        // only fires on a connectionStatus change away from CONNECTING,
        // but keepRemoteRoom keeps status pinned at RECONNECTING the whole
        // time (never changes value), so that effect never re-runs and
        // the timeout would otherwise fire 20s later and clobber this
        // message with a stale "연결이 지연되고 있어요" one.
        if (joinTimeoutRef.current) {
          clearTimeout(joinTimeoutRef.current)
          joinTimeoutRef.current = null
        }
        setError('오프라인 참가는 QR 스캔으로 진행해요.')
        if (!keepRemoteRoom) setConnectionStatus('IDLE')
        return
      }

      const offer = await fetchRoomOffer(targetRoomId)
      if (!stillCurrent()) return
      if (!offer) {
        failJoin('방 정보를 찾을 수 없거나 기간이 만료되었어요.')
        return
      }
      pushDiag(`✅ offer 수신 (ice ${offer.ice?.length ?? 0}개)`)

      if (offer.gameId) {
        setGameSettings(prev => ({ ...prev, selectedGameId: offer.gameId! }))
      }

      const iceConfig = await buildIceConfigWithTurn()
      if (!stillCurrent()) return
      const { session, localDescription } = await createGuestSession(
        iceConfig,
        eventsProxy,
        offer.sdp,
        offer.ice,
      )
      if (!stillCurrent()) {
        // A newer attempt (or "방 나가기") already superseded this one —
        // don't let a late-resolving promise stomp its session/state.
        try { session.close() } catch { /* ignore */ }
        return
      }
      sessionRef.current = session
      pushDiag('🔧 guest session 생성')
      const gatheredIce = await session.waitForIceGathering()
      if (!stillCurrent()) return
      pushDiag(`🧊 ice 수집 ${gatheredIce.length}개`)

      const answer: SignalingPayload = {
        v: 1,
        kind: 'answer',
        roomId: targetRoomId,
        sdp: localDescription,
        ice: gatheredIce,
        createdAt: Date.now(),
        guestName: userName,
      }
      const encodedAnswer = await encodeSignal(compactPayloadForQr(answer))
      if (!stillCurrent()) return
      setOfflineAnswer(encodedAnswer)
      await submitAnswer(answer)
      if (!stillCurrent()) return
      pushDiag('📤 answer 전송')
      setPlayers([
        { id: targetRoomId, name: offer.hostName ?? '호스트', ready: true, isHost: true },
        { id: `${targetRoomId}:me`, name: userName, ready: false, isHost: false, location: userLocation || undefined },
      ])
    } catch (e) {
      if (!stillCurrent()) return
      console.error('joinRoom failed', e)
      failJoin(e instanceof Error ? e.message : '참가 실패')
    }
  }, [teardown, eventsProxy, userName, userLocation, pushDiag])

  const searchNearbyRooms = useCallback(async () => {
    if (!isSignalingAvailable() || !navigator.onLine) {
      setNearbyRooms([])
      return
    }
    if (!userLocation) {
      setError('GPS 좌표 없이 주변 방을 찾을 수 없어요.')
      setNearbyRooms([])
      return
    }
    setError(null)
    const rooms = await fetchRooms()
    const now = Date.now()
    const filtered: NearbyRoom[] = rooms
      .filter((r) => r.expiresAt > now)
      .filter((r) => r.location)
      .map((r) => {
        const loc = r.location!
        const d = getDistance(userLocation.latitude, userLocation.longitude, loc.lat, loc.lon)
        return {
          peerId: r.roomId,
          hostName: r.hostName,
          gameId: r.gameId,
          location: { latitude: loc.lat, longitude: loc.lon, accuracy: loc.acc },
          distance: d,
          timestamp: r.createdAt,
        }
      })
      .filter((r) => r.distance <= NEARBY_RADIUS_M)
      .sort((a, b) => a.distance - b.distance)
    setNearbyRooms(filtered)
  }, [userLocation])

  const toggleReady = useCallback(() => {
    if (isHostRef.current) return
    // Match "self" by role (isHost=false = guest), NOT by id suffix.
    // Once host's LOBBY_STATE arrives it overwrites the local players
    // list with host-side naming (`${roomId}:guest`) — the older
    // ':me' suffix check silently no-op'd afterwards, which was why
    // "준비 완료" appeared to click but never propagated.
    const updated = players.map((p) => (!p.isHost ? { ...p, ready: !p.ready } : p))
    setPlayers(updated)
    enqueueOut({
      type: 'LOBBY_STATE',
      senderId: peerIdRef.current,
      timestamp: Date.now(),
      payload: { players: updated, gameSettings },
    })
  }, [players, gameSettings, enqueueOut])

  const updateGameSettings = useCallback((patch: Partial<GameSettings>) => {
    setGameSettings((prev) => {
      const next = { ...prev, ...patch }
      // Swapping the game type mid-lobby resets every player's ready
      // flag — being marked ready for 모순 shouldn't auto-start you into
      // 틱택토. Match-option changes (e.g. rounds) don't reset.
      const isGameChange = patch.selectedGameId && patch.selectedGameId !== prev.selectedGameId
      let updatedPlayers = players
      if (isGameChange) {
        updatedPlayers = players.map((p) => (p.isHost ? p : { ...p, ready: false }))
        setPlayers(updatedPlayers)
      }
      if (isHostRef.current) {
        enqueueOut({
          type: 'LOBBY_STATE',
          senderId: peerIdRef.current,
          timestamp: Date.now(),
          payload: { players: updatedPlayers, gameSettings: next, isCodeConnection },
        })
      }
      return next
    })
  }, [players, isCodeConnection, enqueueOut])



  const flushOutbound = useCallback(() => {
    const s = sessionRef.current
    if (!s?.dc || s.dc.readyState !== 'open') return
    const queue = outboundQueueRef.current
    if (queue.length === 0) return
    outboundQueueRef.current = []
    for (const msg of queue) s.send(msg)
  }, [])

  // Public sendMessage from games routes through the same queue helper —
  // guarantees a mid-reconnect GAME_ACTION isn't silently dropped.
  const sendMessage = enqueueOut

  // Whenever the channel opens (initial handshake, reconnect) drain the queue.
  useEffect(() => {
    if (connectionStatus === 'CONNECTED') flushOutbound()
  }, [connectionStatus, flushOutbound])

  // Reconnect countdown pump: tick down each second while the connection
  // is impaired. At zero we hand the user a definitive "재접속 실패" state
  // instead of leaving the modal frozen on the initial value.
  useEffect(() => {
    if (connectionStatus !== 'RECONNECTING') return
    if (reconnectCountdown == null) return
    if (reconnectCountdown <= 0) {
      // Full window elapsed without a HEARTBEAT return — treat as lost.
      setError('상대방과 재연결할 수 없어요.')
      setConnectionStatus('IDLE')
      setReconnectCountdown(null)
      return
    }
    const timer = setTimeout(() => {
      // Freeze the countdown while the tab is hidden — a backgrounded
      // browser can't send/receive DC traffic and the user hasn't
      // actually "left" the match yet. On visibilitychange back to
      // visible the timer will resume normally.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      setReconnectCountdown((prev) => (prev == null ? null : prev - 1))
    }, 1000)
    return () => clearTimeout(timer)
  }, [connectionStatus, reconnectCountdown])

  // Visibility bridge — when the user returns to the tab and we're in
  // RECONNECTING, refresh the last-recv timestamp so a stale heartbeat
  // window from time-in-background doesn't insta-fail the peer. If the
  // peer really is gone the next HEARTBEAT_INTERVAL will detect it
  // again; if they're back, the DC will have delivered its own
  // heartbeat by then and status flips to CONNECTED.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      if (connectionStatus === 'RECONNECTING') {
        lastRecvRef.current = Date.now()
        setReconnectCountdown(RECONNECT_WINDOW_S)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [connectionStatus])

  const ingestGuestSignal = useCallback(async (raw: string) => {
    if (!sessionRef.current) throw new Error('세션이 없어요.')
    const payload = await decodeSignal(raw)
    if (payload.kind !== 'answer') throw new Error('answer 코드가 아니에요.')
    await applyRemoteAnswer(sessionRef.current, payload.sdp, payload.ice)
    const guestName = payload.guestName ?? '상대 피어'
    const roomId = peerIdRef.current
    const updated: PlayerInfo[] = [
      { id: roomId, name: userName, ready: true, isHost: true, location: userLocation || undefined },
      { id: `${roomId}:guest`, name: guestName, ready: false, isHost: false },
    ]
    setPlayers(updated)
    setTimeout(() => enqueueOut({
      type: 'LOBBY_STATE',
      senderId: peerIdRef.current,
      timestamp: Date.now(),
      // Same closure-staleness class the answer-poll path had — read
      // via ref so a host tweak after the offline handshake started
      // still ends up in the flushed lobby state.
      payload: { players: updated, gameSettings: gameSettingsRef.current },
    }), 500)
  }, [userName, userLocation, enqueueOut])

  const ingestHostSignal = useCallback(async (raw: string) => {
    teardown()
    const myAttempt = connectAttemptRef.current
    const stillCurrent = () => connectAttemptRef.current === myAttempt

    setPlayers([])
    setError(null)
    setOfflineOffer(null)
    setIsHost(false)
    isHostRef.current = false
    setConnectionStatus('CONNECTING')

    const payload = await decodeSignal(raw)
    if (!stillCurrent()) return
    if (payload.kind !== 'offer') throw new Error('offer 코드가 아니에요.')

    const roomId = payload.roomId
    if (!roomId) throw new Error('잘못된 offer 데이터')
    peerIdRef.current = roomId
    setPeerId(roomId)

    if (payload.gameId) {
      setGameSettings(prev => ({ ...prev, selectedGameId: payload.gameId! }))
    }

    const iceConfig = await buildIceConfigWithTurn()
    if (!stillCurrent()) return
    const { session, localDescription } = await createGuestSession(
      iceConfig,
      eventsProxy,
      payload.sdp,
      payload.ice,
    )
    if (!stillCurrent()) {
      // Superseded mid-handshake ("방 나가기" or a second scan) — don't let
      // a late-resolving session/answer clobber whatever came after it.
      try { session.close() } catch { /* ignore */ }
      return
    }
    sessionRef.current = session
    const ice = await session.waitForIceGathering()
    if (!stillCurrent()) return

    const answer: SignalingPayload = {
      v: 1,
      kind: 'answer',
      roomId,
      sdp: localDescription,
      ice,
      createdAt: Date.now(),
      guestName: userName,
    }
    const answerCode = await encodeSignal(compactPayloadForQr(answer))
    if (!stillCurrent()) return
    setOfflineAnswer(answerCode)
    setConnectionStatus('WAITING')
    setPlayers([
      { id: roomId, name: payload.hostName ?? '호스트', ready: true, isHost: true },
      { id: `${roomId}:me`, name: userName, ready: false, isHost: false, location: userLocation || undefined },
    ])
  }, [teardown, eventsProxy, userName, userLocation])

  return {
    peerId,
    connectionStatus,
    reconnectCountdown,
    players,
    gameSettings,
    nearbyRooms,
    distance,
    rtt,
    error,
    isHost,
    isCodeConnection,
    offlineOffer,
    offlineAnswer,
    waitExpiresAt,
    waitExpired,
    createRoom,
    restartWait,
    restoreHostRoom,
    reconnectHostSession,
    joinRoom,
    searchNearbyRooms,
    toggleReady,
    updateGameSettings,
    handleDisconnect,
    leaveRoom,
    sendMessage,
    ingestGuestSignal,
    ingestHostSignal,
    // On-screen diagnostics — used by Lobby / GAME_PLAY reconnect overlay
    // so mobile users can see what's happening without opening devtools.
    iceState,
    dcState,
    diagLog,
    candTypes,
  }
}
