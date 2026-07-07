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
  type: 'LOBBY_STATE' | 'GAME_START' | 'GAME_ACTION' | 'GAME_RESET' | 'HEARTBEAT' | 'HEARTBEAT_ACK' | 'GPS_UPDATE' | 'DISCONNECT';
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
    x?: number;
    ballX?: number;
    ballY?: number;
    hostScore?: number;
    guestScore?: number;
    winner?: string | null;
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
  joinRoom: (targetRoomId: string, viaCode?: boolean) => Promise<void>;
  searchNearbyRooms: () => Promise<void>;
  toggleReady: () => void;
  updateGameSettings: (s: Partial<GameSettings>) => void;
  handleDisconnect: () => void;
  sendMessage: (msg: P2PMessage) => void;
  ingestGuestSignal: (rawText: string) => Promise<void>; // host absorbs guest QR
  ingestHostSignal: (rawText: string) => Promise<void>;  // guest absorbs host QR
}

const ANSWER_POLL_INTERVAL_MS = 3000
const ANSWER_POLL_MAX_MS = 60_000
const HEARTBEAT_INTERVAL_MS = 2000
const CONNECTION_LOSS_MS = 6500
const RECONNECT_WINDOW_S = 5
const NEARBY_RADIUS_M = 20

const iceConfig = {
  iceServers: buildIceServers({
    turnUrl: import.meta.env.VITE_TURN_URL,
    turnUsername: import.meta.env.VITE_TURN_USERNAME,
    turnCredential: import.meta.env.VITE_TURN_CREDENTIAL,
  }),
}

export function useRoom(userName: string, userLocation: UserLocation | null): RoomState {
  const [peerId, setPeerId] = useState<string>('')
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('IDLE')
  const [reconnectCountdown, setReconnectCountdown] = useState<number | null>(null)
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [gameSettings, setGameSettings] = useState<GameSettings>({ selectedGameId: 'tictactoe', rounds: 3 })
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

  const sessionRef = useRef<RtcSession | null>(null)
  const peerIdRef = useRef<string>('')
  const isHostRef = useRef<boolean>(false)
  const pendingHostOfferRef = useRef<SignalingPayload | null>(null)
  const answerPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastRecvRef = useRef<number>(Date.now())
  const lastSentTsRef = useRef<number>(0)
  const outboundQueueRef = useRef<P2PMessage[]>([])

  const teardown = useCallback(() => {
    if (answerPollRef.current) {
      clearInterval(answerPollRef.current)
      answerPollRef.current = null
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
    try { sessionRef.current?.close() } catch { /* ignore */ }
    sessionRef.current = null
    pendingHostOfferRef.current = null
    if (peerIdRef.current) void deleteRoom(peerIdRef.current)

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
        setConnectionStatus('RECONNECTING')
        setReconnectCountdown(RECONNECT_WINDOW_S)
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
  }), [])

  useEffect(() => {
    eventsRef.current = {
      onOpen: () => {
        console.log('[useRoom] data channel open')
        setConnectionStatus('CONNECTED')
        startHeartbeat()
      },
      onClose: () => {
        console.log('[useRoom] data channel closed')
        setConnectionStatus('WAITING')
      },
      onError: (e) => console.error('[useRoom] RTC error', e),
      onMessage: dispatchInbound,
      onIceStateChange: (state: RTCIceConnectionState) => {
        console.log('[useRoom] ICE state', state)
        if (state === 'failed' || state === 'disconnected') {
          setConnectionStatus('RECONNECTING')
          setReconnectCountdown(RECONNECT_WINDOW_S)
        } else if (state === 'connected' || state === 'completed') {
          setConnectionStatus('CONNECTED')
        }
      },
    }
  }, [dispatchInbound, startHeartbeat])

  const startAnswerPoll = useCallback((roomId: string) => {
    if (answerPollRef.current) clearInterval(answerPollRef.current)
    const startedAt = Date.now()
    setWaitExpiresAt(startedAt + ANSWER_POLL_MAX_MS)
    setWaitExpired(false)
    console.log('[useRoom] answer poll started for', roomId)
    answerPollRef.current = setInterval(async () => {
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
      if (!sessionRef.current) {
        console.warn('[useRoom] answer arrived but session ref is gone')
        return
      }
      if (answerPollRef.current) {
        clearInterval(answerPollRef.current)
        answerPollRef.current = null
      }
      setWaitExpiresAt(null)
      setWaitExpired(false)
      console.log('[useRoom] applying remote answer with', answer.ice?.length ?? 0, 'ice candidates')
      try {
        await applyRemoteAnswer(sessionRef.current, answer.sdp, answer.ice)
        const guestName = answer.guestName ?? '상대 피어'
        const updated: PlayerInfo[] = [
          { id: roomId, name: userName, ready: true, isHost: true, location: userLocation || undefined },
          { id: `${roomId}:guest`, name: guestName, ready: false, isHost: false },
        ]
        setPlayers(updated)
        // Wait for the data channel to actually open before broadcasting the
        // initial lobby state — sending against readyState !== 'open' is a
        // silent no-op inside rtc.send.
        const flushLobbyState = () => sessionRef.current?.send({
          type: 'LOBBY_STATE',
          senderId: peerIdRef.current,
          timestamp: Date.now(),
          payload: { players: updated, gameSettings },
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
  }, [userName, userLocation, gameSettings])

  const createRoom = useCallback(async () => {
    teardown()
    setConnectionStatus('INITIALIZING')
    setIsCodeConnection(false)
    const roomId = generateRoomId()
    peerIdRef.current = roomId
    setPeerId(roomId)

    try {
      const { session, localDescription } = await createHostSession(iceConfig, eventsProxy)
      sessionRef.current = session
      setIsHost(true)
      isHostRef.current = true

      setPlayers([{ id: roomId, name: userName, ready: true, isHost: true, location: userLocation || undefined }])

      const offer: SignalingPayload = {
        v: 1,
        kind: 'offer',
        roomId,
        sdp: localDescription,
        ice: [],
        createdAt: Date.now(),
        hostName: userName,
        gameId: gameSettings.selectedGameId,
        location: userLocation
          ? { lat: userLocation.latitude, lon: userLocation.longitude, acc: userLocation.accuracy }
          : undefined,
      }
      pendingHostOfferRef.current = offer

      const gatheredIce = await session.waitForIceGathering()
      offer.ice = gatheredIce
      pendingHostOfferRef.current = offer

      // Kick off the answer poll immediately — /answer just returns 404
      // until the guest posts. Running it in parallel with publishRoom +
      // the offline-QR encode shaves visible latency off "방 만들기".
      startAnswerPoll(roomId)
      setWaitExpiresAt(Date.now() + ANSWER_POLL_MAX_MS)
      setWaitExpired(false)
      setConnectionStatus('WAITING')

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
    } catch (e) {
      console.error('createRoom failed', e)
      setError(e instanceof Error ? e.message : '방 생성 실패')
      teardown()
    }
  }, [teardown, eventsProxy, userName, userLocation, startAnswerPoll, gameSettings.selectedGameId])

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

  const joinRoom = useCallback(async (targetRoomId: string, viaCode?: boolean) => {
    teardown()
    setConnectionStatus('CONNECTING')
    setIsCodeConnection(!!viaCode)
    peerIdRef.current = targetRoomId
    setPeerId(targetRoomId)

    try {
      if (!isSignalingAvailable() || !navigator.onLine) {
        setError('오프라인 참가는 QR 스캔으로 진행해요.')
        setConnectionStatus('IDLE')
        return
      }

      const offer = await fetchRoomOffer(targetRoomId)
      if (!offer) {
        setError('방 정보를 찾을 수 없거나 기간이 만료되었어요.')
        setConnectionStatus('IDLE')
        return
      }

      if (offer.gameId) {
        setGameSettings(prev => ({ ...prev, selectedGameId: offer.gameId! }))
      }

      const { session, localDescription } = await createGuestSession(
        iceConfig,
        eventsProxy,
        offer.sdp,
        offer.ice,
      )
      sessionRef.current = session
      const gatheredIce = await session.waitForIceGathering()

      const answer: SignalingPayload = {
        v: 1,
        kind: 'answer',
        roomId: targetRoomId,
        sdp: localDescription,
        ice: gatheredIce,
        createdAt: Date.now(),
        guestName: userName,
      }
      setOfflineAnswer(await encodeSignal(compactPayloadForQr(answer)))
      await submitAnswer(answer)
      setPlayers([
        { id: targetRoomId, name: offer.hostName ?? '방장', ready: true, isHost: true },
        { id: `${targetRoomId}:me`, name: userName, ready: false, isHost: false, location: userLocation || undefined },
      ])
    } catch (e) {
      console.error('joinRoom failed', e)
      setError(e instanceof Error ? e.message : '참가 실패')
      teardown()
    }
  }, [teardown, eventsProxy, userName, userLocation])

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
    const s = sessionRef.current
    if (!s) return
    const updated = players.map((p) => (p.id.endsWith(':me') ? { ...p, ready: !p.ready } : p))
    setPlayers(updated)
    s.send({
      type: 'LOBBY_STATE',
      senderId: peerIdRef.current,
      timestamp: Date.now(),
      payload: { players: updated, gameSettings },
    })
  }, [players, gameSettings])

  const updateGameSettings = useCallback((patch: Partial<GameSettings>) => {
    // Room creation happens after the user picks a game on Home. At that
    // point isHostRef is still false, so gating this by host would drop the
    // 게임 선택 patch and the room would fall back to the default game.
    // Broadcast only when we actually have a P2P channel + host role.
    setGameSettings((prev) => {
      const next = { ...prev, ...patch }
      const s = sessionRef.current
      if (isHostRef.current && s) {
        s.send({
          type: 'LOBBY_STATE',
          senderId: peerIdRef.current,
          timestamp: Date.now(),
          payload: { players, gameSettings: next, isCodeConnection },
        })
      }
      return next
    })
  }, [players, isCodeConnection])



  // Outbound queue lives on outboundQueueRef declared above. Buffer the
  // most recent messages while the channel is briefly closed (mid-reconnect,
  // before onopen fires) so a hiccup doesn't drop game actions.
  const MAX_QUEUE = 32

  const flushOutbound = useCallback(() => {
    const s = sessionRef.current
    if (!s?.dc || s.dc.readyState !== 'open') return
    const queue = outboundQueueRef.current
    if (queue.length === 0) return
    outboundQueueRef.current = []
    for (const msg of queue) s.send(msg)
  }, [])

  const sendMessage = useCallback((msg: P2PMessage) => {
    const s = sessionRef.current
    const dc = s?.dc
    if (s && dc && dc.readyState === 'open') {
      s.send(msg)
    } else {
      const queue = outboundQueueRef.current
      queue.push(msg)
      if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE)
    }
  }, [])

  // Whenever the channel opens (initial handshake, reconnect) drain the queue.
  useEffect(() => {
    if (connectionStatus === 'CONNECTED') flushOutbound()
  }, [connectionStatus, flushOutbound])

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
    setTimeout(() => sessionRef.current?.send({
      type: 'LOBBY_STATE',
      senderId: peerIdRef.current,
      timestamp: Date.now(),
      payload: { players: updated, gameSettings },
    }), 500)
  }, [userName, userLocation, gameSettings])

  const ingestHostSignal = useCallback(async (raw: string) => {
    teardown()
    setPlayers([])
    setError(null)
    setOfflineOffer(null)
    setIsHost(false)
    isHostRef.current = false
    setConnectionStatus('CONNECTING')

    const payload = await decodeSignal(raw)
    if (payload.kind !== 'offer') throw new Error('offer 코드가 아니에요.')

    const roomId = payload.roomId
    if (!roomId) throw new Error('잘못된 offer 데이터')
    peerIdRef.current = roomId
    setPeerId(roomId)

    if (payload.gameId) {
      setGameSettings(prev => ({ ...prev, selectedGameId: payload.gameId! }))
    }

    const { session, localDescription } = await createGuestSession(
      iceConfig,
      eventsProxy,
      payload.sdp,
      payload.ice,
    )
    sessionRef.current = session
    const ice = await session.waitForIceGathering()

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
    setOfflineAnswer(answerCode)
    setConnectionStatus('WAITING')
    setPlayers([
      { id: roomId, name: payload.hostName ?? '방장', ready: true, isHost: true },
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
    joinRoom,
    searchNearbyRooms,
    toggleReady,
    updateGameSettings,
    handleDisconnect,
    sendMessage,
    ingestGuestSignal,
    ingestHostSignal,
  }
}
