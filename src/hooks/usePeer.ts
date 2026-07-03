import { useState, useEffect, useRef, useCallback } from 'react'
import Peer from 'peerjs'
import type { DataConnection } from 'peerjs'
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
  peerId: string;
  hostName: string;
  gameId: string;
  location: UserLocation;
  distance: number;
  timestamp: number;
}

export interface P2PMessage {
  type: 'LOBBY_STATE' | 'GAME_START' | 'GAME_ACTION' | 'GAME_RESET' | 'HEARTBEAT' | 'HEARTBEAT_ACK' | 'GPS_UPDATE' | 'DISCONNECT';
  senderId: string;
  timestamp: number;
  payload: any;
}

// 로컬 테스트용 공유 레지스트리 키 (같은 브라우저 탭 간 테스트 지원)
const MOCK_REGISTRY_KEY = 'minidamo_mock_signaling_rooms'

export function usePeer(userName: string, userLocation: UserLocation | null) {
  const [peer, setPeer] = useState<Peer | null>(null)
  const [peerId, setPeerId] = useState<string>('')
  const [, setConnection] = useState<DataConnection | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('IDLE')
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [gameSettings, setGameSettings] = useState<GameSettings>({ selectedGameId: 'tictactoe', rounds: 3 })
  const [nearbyRooms, setNearbyRooms] = useState<NearbyRoom[]>([])
  
  // 상태 모니터링 변수
  const [distance, setDistance] = useState<number | null>(null)
  const [rtt, setRtt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Ref로 관리할 상태
  const connectionRef = useRef<DataConnection | null>(null)
  const peerIdRef = useRef<string>('')
  const lastHeartbeatTime = useRef<number>(0)
  const reconnectTimeoutRef = useRef<any>(null)
  const heartbeatIntervalRef = useRef<any>(null)
  
  const isHost = players.find(p => p.id === peerIdRef.current)?.isHost ?? false

  // PeerJS 인스턴스 초기화
  const initPeer = useCallback(() => {
    if (peer) return peer

    setConnectionStatus('INITIALIZING')
    setError(null)

    // 구글 퍼블릭 STUN 서버 설정 반영
    const newPeer = new Peer({
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    })

    newPeer.on('open', (id) => {
      setPeerId(id)
      peerIdRef.current = id
      setConnectionStatus('WAITING')
    })

    newPeer.on('error', (err) => {
      console.error('PeerJS error:', err)
      setError(`통신사 방화벽 혹은 Peer 에러: ${err.type}`)
      setConnectionStatus('ERROR')
    })

    setPeer(newPeer)
    return newPeer
  }, [peer])

  // 하트비트 주기적 송수신 (지연시간 RTT 계산)
  const startHeartbeat = useCallback((conn: DataConnection) => {
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current)

    heartbeatIntervalRef.current = setInterval(() => {
      if (conn.open) {
        lastHeartbeatTime.current = Date.now()
        conn.send({
          type: 'HEARTBEAT',
          senderId: peerIdRef.current,
          timestamp: lastHeartbeatTime.current,
          payload: { location: userLocation }
        })
      }
    }, 2000)
  }, [userLocation])

  // GPS 위치 정보 파트너로 실시간 갱신 전송
  useEffect(() => {
    if (connectionRef.current && connectionRef.current.open && userLocation) {
      connectionRef.current.send({
        type: 'GPS_UPDATE',
        senderId: peerIdRef.current,
        timestamp: Date.now(),
        payload: { location: userLocation }
      })
    }
  }, [userLocation])

  // 데이터 수신 리스너 처리
  const setupDataListener = useCallback((conn: DataConnection) => {
    conn.on('data', (raw: any) => {
      const msg = raw as P2PMessage
      if (!msg || !msg.type) return

      window.dispatchEvent(new CustomEvent('p2p_message', { detail: msg }))

      switch (msg.type) {
        case 'HEARTBEAT':
          // 하트비트 응답 반송
          conn.send({
            type: 'HEARTBEAT_ACK',
            senderId: peerIdRef.current,
            timestamp: Date.now(),
            payload: { originalTime: msg.timestamp }
          })
          // 상대방 GPS 정보 파싱 및 거리 업데이트
          if (msg.payload?.location && userLocation) {
            const d = getDistance(
              userLocation.latitude,
              userLocation.longitude,
              msg.payload.location.latitude,
              msg.payload.location.longitude
            )
            setDistance(d)
          }
          break

        case 'HEARTBEAT_ACK':
          // RTT 계산
          if (msg.payload?.originalTime) {
            setRtt(Date.now() - msg.payload.originalTime)
          }
          break

        case 'GPS_UPDATE':
          if (msg.payload?.location && userLocation) {
            const d = getDistance(
              userLocation.latitude,
              userLocation.longitude,
              msg.payload.location.latitude,
              msg.payload.location.longitude
            )
            setDistance(d)
          }
          break

        case 'LOBBY_STATE':
          if (msg.payload?.players) {
            setPlayers(msg.payload.players)
          }
          if (msg.payload?.gameSettings) {
            setGameSettings(msg.payload.gameSettings)
          }
          break

        case 'DISCONNECT':
          handleDisconnect()
          break
      }
    })

    conn.on('close', () => {
      console.log('Connection closed.')
      handleConnectionLoss()
    })
  }, [userLocation])

  // 연결 해제 처리
  const handleDisconnect = useCallback(() => {
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current)
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)

    if (connectionRef.current) {
      try {
        connectionRef.current.send({
          type: 'DISCONNECT',
          senderId: peerIdRef.current,
          timestamp: Date.now(),
          payload: null
        })
        connectionRef.current.close()
      } catch {}
    }

    // 모의 시그널링 서버에서 방 제거
    removeRoomFromRegistry(peerIdRef.current)

    setConnection(null)
    connectionRef.current = null
    setPlayers([])
    setDistance(null)
    setRtt(null)
    setConnectionStatus('WAITING')
  }, [])

  // 연결 일시 단절 시 재연결 시도
  const handleConnectionLoss = useCallback(() => {
    if (connectionStatus === 'RECONNECTING') return

    setConnectionStatus('RECONNECTING')
    let attempts = 0

    const tryReconnect = () => {
      if (attempts >= 5) {
        // 5회 시도(5초) 초과 시 영구 차단
        setError('상대방과 연결이 영구히 끊어졌습니다.')
        handleDisconnect()
        return
      }

      attempts++
      console.log(`Reconnection attempt ${attempts}...`)

      if (connectionRef.current && peerIdRef.current) {
        // 호스트나 게스트 롤에 맞게 다시 수동 호출 시도
        const targetId = connectionRef.current.peer
        const newConn = peer?.connect(targetId)

        if (newConn) {
          newConn.on('open', () => {
            console.log('Reconnection successful!')
            setConnection(newConn)
            connectionRef.current = newConn
            setConnectionStatus('CONNECTED')
            setupDataListener(newConn)
            startHeartbeat(newConn)
          })
        }
      }

      reconnectTimeoutRef.current = setTimeout(tryReconnect, 1000)
    }

    tryReconnect()
  }, [peer, connectionStatus, handleDisconnect, setupDataListener, startHeartbeat])

  // 방 개설 (Host)
  const createRoom = useCallback(() => {
    const p = initPeer()
    
    // 호스트 플레이어 기본 등록
    setPlayers([
      { id: 'pending-id', name: userName, ready: true, isHost: true, location: userLocation || undefined }
    ])

    p.on('open', (id) => {
      setPlayers([
        { id: id, name: userName, ready: true, isHost: true, location: userLocation || undefined }
      ])
      
      // 모의 시그널링 서버(LocalStorage)에 방 등록
      if (userLocation) {
        registerRoomToRegistry({
          peerId: id,
          hostName: userName,
          gameId: gameSettings.selectedGameId,
          location: userLocation,
          timestamp: Date.now()
        })
      }
    })

    // 게스트로부터 들어오는 연결 대기
    p.on('connection', (conn) => {
      setConnection(conn)
      connectionRef.current = conn
      setConnectionStatus('CONNECTED')
      setupDataListener(conn)
      startHeartbeat(conn)

      // 입장 완료 시 플레이어 목록 갱신 및 전송
      const updatedPlayers: PlayerInfo[] = [
        { id: peerIdRef.current, name: userName, ready: true, isHost: true, location: userLocation || undefined },
        { id: conn.peer, name: '상대 피어', ready: false, isHost: false }
      ]
      setPlayers(updatedPlayers)

      // 게스트에게 현재 상태 동기화 패킷 전달
      setTimeout(() => {
        conn.send({
          type: 'LOBBY_STATE',
          senderId: peerIdRef.current,
          timestamp: Date.now(),
          payload: { players: updatedPlayers, gameSettings }
        })
      }, 500)
    })
  }, [initPeer, userName, userLocation, gameSettings, setupDataListener, startHeartbeat])

  // 주변 방 찾기 (GPS 기준 반경 20m 검색)
  const searchNearbyRooms = useCallback(() => {
    if (!userLocation) {
      setError('GPS 좌표 수집 전에는 주변 방을 찾을 수 없습니다.')
      return
    }

    setError(null)
    
    // 모의 레지스트리 조회
    const raw = localStorage.getItem(MOCK_REGISTRY_KEY)
    if (!raw) {
      setNearbyRooms([])
      return
    }

    try {
      const allRooms: any[] = JSON.parse(raw)
      const now = Date.now()
      
      // 1분 이상 지난 오래된 방 필터 및 거리 계산
      const activeRooms: NearbyRoom[] = allRooms
        .filter((r) => now - r.timestamp < 60000)
        .map((r) => {
          const d = getDistance(
            userLocation.latitude,
            userLocation.longitude,
            r.location.latitude,
            r.location.longitude
          )
          return { ...r, distance: d }
        })
        // 20미터 이내 방만 필터링
        .filter((r) => r.distance <= 20)
        .sort((a, b) => a.distance - b.distance)

      setNearbyRooms(activeRooms)
    } catch {
      setNearbyRooms([])
    }
  }, [userLocation])

  // 방 참가 (Guest)
  const joinRoom = useCallback((targetPeerId: string) => {
    const p = initPeer()
    setConnectionStatus('CONNECTING')

    p.on('open', (id) => {
      const conn = p.connect(targetPeerId)
      setConnection(conn)
      connectionRef.current = conn

      conn.on('open', () => {
        setConnectionStatus('CONNECTED')
        setupDataListener(conn)
        startHeartbeat(conn)

        // 내 정보를 임시 상태로 업데이트
        setPlayers([
          { id: targetPeerId, name: '방장', ready: true, isHost: true },
          { id: id, name: userName, ready: false, isHost: false, location: userLocation || undefined }
        ])
      })

      conn.on('error', (err) => {
        console.error('Connection error:', err)
        setError('방 연결 시도 중 에러가 발생했습니다.')
        setConnectionStatus('ERROR')
      })
    })
  }, [initPeer, userName, userLocation, setupDataListener, startHeartbeat])

  // 준비 토글 (Guest전용)
  const toggleReady = useCallback(() => {
    if (!connectionRef.current || isHost) return

    const updated = players.map(p => {
      if (p.id === peerId) {
        return { ...p, ready: !p.ready }
      }
      return p
    })
    setPlayers(updated)

    connectionRef.current.send({
      type: 'LOBBY_STATE',
      senderId: peerId,
      timestamp: Date.now(),
      payload: { players: updated, gameSettings }
    })
  }, [peerId, players, gameSettings, isHost])

  // 게임 설정 업데이트 (Host전용)
  const updateGameSettings = useCallback((settings: Partial<GameSettings>) => {
    if (!isHost) return

    const newSettings = { ...gameSettings, ...settings }
    setGameSettings(newSettings)

    // 로컬 레지스트리도 업데이트
    updateRoomInRegistry(peerId, { gameId: newSettings.selectedGameId })

    if (connectionRef.current && connectionRef.current.open) {
      connectionRef.current.send({
        type: 'LOBBY_STATE',
        senderId: peerId,
        timestamp: Date.now(),
        payload: { players, gameSettings: newSettings }
      })
    }
  }, [peerId, players, gameSettings, isHost])

  // 클린업 리소스 정리
  useEffect(() => {
    return () => {
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current)
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      if (peer) {
        removeRoomFromRegistry(peerIdRef.current)
        peer.destroy()
      }
    }
  }, [peer])

  return {
    peerId,
    connectionStatus,
    players,
    gameSettings,
    nearbyRooms,
    distance,
    rtt,
    error,
    isHost,
    createRoom,
    joinRoom,
    searchNearbyRooms,
    toggleReady,
    updateGameSettings,
    handleDisconnect,
    sendMessage: (msg: any) => connectionRef.current?.send(msg)
  }
}

// --- LocalStorage 기반 모의 시그널링 레지스트리 유틸 함수 ---

function registerRoomToRegistry(room: Omit<NearbyRoom, 'distance'>) {
  try {
    const raw = localStorage.getItem(MOCK_REGISTRY_KEY)
    const list = raw ? JSON.parse(raw) : []
    // 기존 동일 PeerID 방 필터링 후 추가
    const updated = list.filter((r: any) => r.peerId !== room.peerId)
    updated.push(room)
    localStorage.setItem(MOCK_REGISTRY_KEY, JSON.stringify(updated))
  } catch (e) {
    console.error('Failed to register room to mock registry:', e)
  }
}

function updateRoomInRegistry(peerId: string, update: Partial<Omit<NearbyRoom, 'distance'>>) {
  try {
    const raw = localStorage.getItem(MOCK_REGISTRY_KEY)
    if (!raw) return
    const list: any[] = JSON.parse(raw)
    const updated = list.map((r) => {
      if (r.peerId === peerId) {
        return { ...r, ...update, timestamp: Date.now() }
      }
      return r
    })
    localStorage.setItem(MOCK_REGISTRY_KEY, JSON.stringify(updated))
  } catch (e) {
    console.error('Failed to update room in mock registry:', e)
  }
}

function removeRoomFromRegistry(peerId: string) {
  try {
    const raw = localStorage.getItem(MOCK_REGISTRY_KEY)
    if (!raw) return
    const list = JSON.parse(raw)
    const updated = list.filter((r: any) => r.peerId !== peerId)
    localStorage.setItem(MOCK_REGISTRY_KEY, JSON.stringify(updated))
  } catch (e) {
    console.error('Failed to remove room from mock registry:', e)
  }
}
