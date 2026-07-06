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
  offlineOffer: string | null; // JSON payload for QR (host, offline mode)
  offlineAnswer: string | null; // JSON payload for QR (guest, offline mode)
  waitExpiresAt: number | null; // host: 대기 만료 timestamp (ms epoch)
  waitExpired: boolean;         // host: TTL 초과 후 재대기 필요
  createRoom: () => Promise<void>;
  restartWait: () => Promise<void>; // host: 만료 후 재발행 + 재폴링
  joinRoom: (targetRoomId: string) => Promise<void>;
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

  const dispatchInbound = useCallback((raw: unknown) => {
    if (!raw || typeof raw !== 'object') return
    const msg = raw as P2PMessage
    if (!msg.type) return
    lastRecvRef.current = Date.now()
    setConnectionStatus('CONNECTED')
    setReconnectCountdown(null)

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
  }, [userLocation])

  const events = useMemo(() => ({
    onOpen: () => {
      setConnectionStatus('CONNECTED')
      startHeartbeat()
    },
    onClose: () => setConnectionStatus('WAITING'),
    onError: (err: unknown) => {
      console.warn('RTC error', err)
      setError('통신 오류')
      setConnectionStatus('ERROR')
    },
    onMessage: dispatchInbound,
    onIceStateChange: (state: RTCIceConnectionState) => {
      if (state === 'failed' || state === 'disconnected') {
        setConnectionStatus('RECONNECTING')
        setReconnectCountdown(RECONNECT_WINDOW_S)
      } else if (state === 'connected') {
        setConnectionStatus('CONNECTED')
      }
    },
  }), [dispatchInbound, startHeartbeat])

  const startAnswerPoll = useCallback((roomId: string) => {
    if (answerPollRef.current) clearInterval(answerPollRef.current)
    const startedAt = Date.now()
    setWaitExpiresAt(startedAt + ANSWER_POLL_MAX_MS)
    setWaitExpired(false)
    answerPollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > ANSWER_POLL_MAX_MS) {
        if (answerPollRef.current) {
          clearInterval(answerPollRef.current)
          answerPollRef.current = null
        }
        setWaitExpired(true)
        setWaitExpiresAt(null)
        return
      }
      const answer = await pollAnswer(roomId)
      if (!answer || !sessionRef.current) return
      if (answerPollRef.current) {
        clearInterval(answerPollRef.current)
        answerPollRef.current = null
      }
      setWaitExpiresAt(null)
      setWaitExpired(false)
      try {
        await applyRemoteAnswer(sessionRef.current, answer.sdp, answer.ice)
        const guestName = answer.guestName ?? '상대 피어'
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
      } catch (e) {
        console.warn('applyRemoteAnswer failed', e)
        setError('answer 적용 실패')
      }
    }, ANSWER_POLL_INTERVAL_MS)
  }, [userName, userLocation, gameSettings])

  const createRoom = useCallback(async () => {
    teardown()
    setPlayers([])
    setDistance(null)
    setRtt(null)
    setReconnectCountdown(null)
    setError(null)
    setOfflineOffer(null)
    setOfflineAnswer(null)
    setWaitExpiresAt(null)
    setWaitExpired(false)
    setIsHost(true)
    isHostRef.current = true
    setConnectionStatus('INITIALIZING')

    const roomId = generateRoomId()
    peerIdRef.current = roomId
    setPeerId(roomId)

    try {
      const { session, localDescription } = await createHostSession(iceConfig, events)
      sessionRef.current = session
      const ice = await session.waitForIceGathering()

      const offer: SignalingPayload = {
        v: 1,
        kind: 'offer',
        roomId,
        sdp: localDescription,
        ice,
        createdAt: Date.now(),
        hostName: userName,
        gameId: gameSettings.selectedGameId,
        location: userLocation ? {
          lat: userLocation.latitude,
          lon: userLocation.longitude,
          acc: userLocation.accuracy,
        } : undefined,
      }
      pendingHostOfferRef.current = offer
      setOfflineOffer(encodeSignal(offer))
      setPlayers([{ id: roomId, name: userName, ready: true, isHost: true, location: userLocation || undefined }])

      if (isSignalingAvailable() && navigator.onLine) {
        try {
          await publishRoom(offer)
          startAnswerPoll(roomId)
          setConnectionStatus('WAITING')
        } catch (e) {
          console.warn('publishRoom failed, falling back to offline QR', e)
          setConnectionStatus('WAITING')
        }
      } else {
        setConnectionStatus('WAITING')
      }
    } catch (e) {
      console.error('createRoom failed', e)
      setError('방 생성 실패')
      setConnectionStatus('ERROR')
    }
  }, [teardown, events, userName, userLocation, gameSettings, startAnswerPoll])

  const restartWait = useCallback(async () => {
    if (!isHostRef.current) return
    const roomId = peerIdRef.current
    const offer = pendingHostOfferRef.current
    if (!roomId || !offer || !sessionRef.current) {
      // 세션이 없으면 완전 재생성
      await createRoom()
      return
    }
    setError(null)
    setWaitExpired(false)
    setConnectionStatus('WAITING')
    // R2/KV의 방을 재발행 (새 expiresAt으로)
    const refreshed = { ...offer, createdAt: Date.now() }
    pendingHostOfferRef.current = refreshed
    setOfflineOffer(encodeSignal(refreshed))
    if (isSignalingAvailable() && navigator.onLine) {
      try {
        await publishRoom(refreshed)
        startAnswerPoll(roomId)
      } catch (e) {
        console.warn('republish failed', e)
        setError('방 재발행 실패')
      }
    } else {
      // offline: TTL 개념 없음, 단순 재대기 상태
      setWaitExpiresAt(Date.now() + ANSWER_POLL_MAX_MS)
    }
  }, [createRoom, startAnswerPoll])

  const joinRoom = useCallback(async (targetRoomId: string) => {
    teardown()
    setPlayers([])
    setError(null)
    setOfflineOffer(null)
    setOfflineAnswer(null)
    setWaitExpiresAt(null)
    setWaitExpired(false)
    setIsHost(false)
    isHostRef.current = false
    setConnectionStatus('CONNECTING')

    if (targetRoomId === peerIdRef.current) {
      setError('내 방에는 참가할 수 없어요.')
      setConnectionStatus('ERROR')
      return
    }

    if (!isSignalingAvailable() || !navigator.onLine) {
      setError('오프라인 참가는 QR 스캔으로 진행해요.')
      setConnectionStatus('IDLE')
      return
    }

    try {
      const offer = await fetchRoomOffer(targetRoomId)
      if (!offer) {
        setError('방 정보를 가져올 수 없어요.')
        setConnectionStatus('ERROR')
        return
      }
      const { session, localDescription } = await createGuestSession(iceConfig, events, offer.sdp, offer.ice)
      sessionRef.current = session
      const ice = await session.waitForIceGathering()

      const roomId = offer.roomId
      peerIdRef.current = roomId
      setPeerId(roomId)

      const answer: SignalingPayload = {
        v: 1,
        kind: 'answer',
        roomId,
        sdp: localDescription,
        ice,
        createdAt: Date.now(),
        guestName: userName,
      }
      setOfflineAnswer(encodeSignal(answer))
      await submitAnswer(answer)
      setPlayers([
        { id: roomId, name: offer.hostName ?? '방장', ready: true, isHost: true },
        { id: `${roomId}:me`, name: userName, ready: false, isHost: false, location: userLocation || undefined },
      ])
    } catch (e) {
      console.error('joinRoom failed', e)
      setError('방 참가 실패')
      setConnectionStatus('ERROR')
    }
  }, [teardown, events, userName, userLocation])

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
    if (!isHostRef.current) return
    const next = { ...gameSettings, ...patch }
    setGameSettings(next)
    const s = sessionRef.current
    if (s) s.send({
      type: 'LOBBY_STATE',
      senderId: peerIdRef.current,
      timestamp: Date.now(),
      payload: { players, gameSettings: next },
    })
  }, [gameSettings, players])

  const handleDisconnect = useCallback(() => {
    teardown()
    setPlayers([])
    setDistance(null)
    setRtt(null)
    setReconnectCountdown(null)
    setIsHost(false)
    isHostRef.current = false
    setConnectionStatus('WAITING')
  }, [teardown])

  const sendMessage = useCallback((msg: P2PMessage) => {
    sessionRef.current?.send(msg)
  }, [])

  // Offline signaling ingestion (host scans guest QR, guest scans host QR)
  const ingestGuestSignal = useCallback(async (raw: string) => {
    if (!sessionRef.current) throw new Error('세션이 없어요.')
    const payload = decodeSignal(raw)
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

    const payload = decodeSignal(raw)
    if (payload.kind !== 'offer') throw new Error('offer 코드가 아니에요.')

    const { session, localDescription } = await createGuestSession(iceConfig, events, payload.sdp, payload.ice)
    sessionRef.current = session
    const ice = await session.waitForIceGathering()
    const roomId = payload.roomId
    peerIdRef.current = roomId
    setPeerId(roomId)

    const answer: SignalingPayload = {
      v: 1,
      kind: 'answer',
      roomId,
      sdp: localDescription,
      ice,
      createdAt: Date.now(),
      guestName: userName,
    }
    setOfflineAnswer(encodeSignal(answer))
    setPlayers([
      { id: roomId, name: payload.hostName ?? '방장', ready: true, isHost: true },
      { id: `${roomId}:me`, name: userName, ready: false, isHost: false, location: userLocation || undefined },
    ])
  }, [teardown, events, userName, userLocation])

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
