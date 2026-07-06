import { useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import type { ConnectionStatus, PlayerInfo, GameSettings, NearbyRoom } from '../../hooks/usePeer'
import type { UserLocation, LocationPermission } from '../../hooks/useLocation'

interface LobbyProps {
  userLocation: UserLocation | null;
  locationPermission: LocationPermission;
  requestLocationPermission: () => void;
  connectionStatus: ConnectionStatus;
  players: PlayerInfo[];
  gameSettings: GameSettings;
  nearbyRooms: NearbyRoom[];
  isHost: boolean;
  hostPeerId: string;
  error: string | null;
  createRoom: () => void;
  joinRoom: (id: string) => void;
  searchNearbyRooms: () => void;
  toggleReady: () => void;
  updateGameSettings: (s: Partial<GameSettings>) => void;
  onBack: () => void;
  onStartGame?: () => void;
  mode: 'CREATE' | 'JOIN';
}

const ROUNDS_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: '단판제' },
  { value: 3, label: '3판 2선승' },
  { value: 5, label: '5판 3선승' },
]

const GAME_TITLES: Record<string, string> = {
  tictactoe: '틱택토',
  pingpong: '미니 탁구',
}

const SEARCH_INTERVAL_MS = 3000
const SCAN_TICK_MS = 100

function gameTitle(gameId: string): string {
  return GAME_TITLES[gameId] ?? gameId
}

function buildShareUrl(peerId: string): string {
  const url = new URL(window.location.href)
  url.searchParams.delete('room')
  url.hash = ''
  url.searchParams.set('room', peerId)
  return url.toString()
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
    // fallback
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.style.position = 'absolute'
    el.style.left = '-9999px'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}

export function Lobby({
  userLocation,
  locationPermission,
  requestLocationPermission,
  connectionStatus,
  players,
  gameSettings,
  nearbyRooms,
  isHost,
  hostPeerId,
  error,
  createRoom,
  joinRoom,
  searchNearbyRooms,
  toggleReady,
  updateGameSettings,
  onBack,
  onStartGame,
  mode,
}: LobbyProps) {
  const [manualId, setManualId] = useState('')
  const [initError, setInitError] = useState<string | null>(null)
  const [scanCount, setScanCount] = useState<number>(0)
  const [nextScanIn, setNextScanIn] = useState<number>(SEARCH_INTERVAL_MS)
  const [copyMsg, setCopyMsg] = useState<string | null>(null)
  const nextScanAtRef = useRef<number>(Date.now() + SEARCH_INTERVAL_MS)

  const shareUrl = useMemo(() => (hostPeerId ? buildShareUrl(hostPeerId) : ''), [hostPeerId])

  const handleCopy = async (payload: string, label: string) => {
    const ok = await copyToClipboard(payload)
    setCopyMsg(ok ? `${label} 복사됨` : '복사 실패')
    setTimeout(() => setCopyMsg(null), 1600)
  }

  useEffect(() => {
    try {
      if (mode === 'CREATE') createRoom()
      else {
        searchNearbyRooms()
        setScanCount(1)
        nextScanAtRef.current = Date.now() + SEARCH_INTERVAL_MS
      }
      setInitError(null)
    } catch (e) {
      setInitError(e instanceof Error ? e.message : '초기화 실패')
    }
  }, [mode, createRoom, searchNearbyRooms])

  useEffect(() => {
    if (mode !== 'JOIN') return
    if (connectionStatus !== 'IDLE' && connectionStatus !== 'INITIALIZING' && connectionStatus !== 'WAITING') return
    const timer = setInterval(() => {
      searchNearbyRooms()
      setScanCount((n) => n + 1)
      nextScanAtRef.current = Date.now() + SEARCH_INTERVAL_MS
    }, SEARCH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [mode, connectionStatus, searchNearbyRooms])

  useEffect(() => {
    if (mode !== 'JOIN') return
    const tick = setInterval(() => {
      const remaining = Math.max(0, nextScanAtRef.current - Date.now())
      setNextScanIn(remaining)
    }, SCAN_TICK_MS)
    return () => clearInterval(tick)
  }, [mode])

  const guestPlayer = useMemo(() => players.find((p) => !p.isHost) ?? null, [players])
  const isGuestReady = guestPlayer?.ready ?? false
  const hasGuestJoined = players.length >= 2

  const handleManualJoin = () => {
    const id = manualId.trim()
    if (!id) return
    if (id.length < 8) {
      setInitError('Peer ID가 너무 짧아요.')
      return
    }
    setInitError(null)
    joinRoom(id)
  }

  const combinedError = error ?? initError

  const isJoinSearching =
    mode === 'JOIN' &&
    (connectionStatus === 'IDLE' ||
      connectionStatus === 'CONNECTING' ||
      connectionStatus === 'INITIALIZING' ||
      connectionStatus === 'WAITING')

  if (isJoinSearching) {
    return (
      <div className="lobby-container">
        <div className="lobby-top-bar">
          <button type="button" className="pixel-arrow" onClick={onBack} aria-label="뒤로">◀</button>
          <span className="lobby-title">주변 대기방</span>
        </div>

        <p className="lobby-subtitle">반경 20m 이내 방 스캔 중</p>

        <div className="scan-status">
          <div className="scan-status-row">
            <span className="scan-dot" aria-hidden="true" />
            <span className="scan-status-label">스캔 #{scanCount}</span>
            <span className="scan-status-sub">
              다음 스캔 {(nextScanIn / 1000).toFixed(1)}초
            </span>
          </div>
          <div className="scan-progress" aria-hidden="true">
            <div
              className="scan-progress-bar"
              style={{ width: `${100 - (nextScanIn / SEARCH_INTERVAL_MS) * 100}%` }}
            />
          </div>
        </div>

        <div className="gps-radar" aria-hidden="true">
          <span className="gps-ring gps-ring--lg" />
          <span className="gps-ring gps-ring--md" />
          <span className="gps-ring gps-ring--sm" />
          <span className="gps-pin gps-pin--center" />
          {nearbyRooms.slice(0, 4).map((room, i) => (
            <span
              key={room.peerId}
              className="gps-pin gps-pin--room"
              style={{
                top: `${15 + (i * 25)}%`,
                left: `${25 + (i * 20)}%`,
              }}
            />
          ))}
        </div>

        <div className={`gps-status ${userLocation ? 'gps-status--ok' : locationPermission === 'denied' ? 'gps-status--denied' : 'gps-status--waiting'}`}>
          {userLocation
            ? `GPS 획득 · 정밀도 ${Math.round(userLocation.accuracy)}m`
            : locationPermission === 'denied'
              ? 'GPS 권한 거부됨'
              : locationPermission === 'unsupported'
                ? 'GPS 미지원 브라우저'
                : 'GPS 좌표 수집 중…'}
          {(locationPermission === 'denied' || locationPermission === 'prompt') && (
            <button
              type="button"
              className="pixel-btn pixel-btn--ghost gps-request-btn"
              onClick={requestLocationPermission}
            >
              권한 요청
            </button>
          )}
        </div>

        <div className="signaling-note">
          근접 매칭은 같은 브라우저 탭에서만 자동 감지됩니다.<br />
          다른 기기와 붙으려면 아래 수동 코드/QR 공유가 확실해요.
        </div>

        <div className="nearby-list">
          {nearbyRooms.length === 0 ? (
            <div className="nearby-empty">
              주변 방 없음<br />
              <span className="nearby-empty-sub">3초 간격 자동 재스캔</span>
            </div>
          ) : (
            nearbyRooms.map((room) => (
              <div
                key={room.peerId}
                className="nearby-item"
                onClick={() => joinRoom(room.peerId)}
                role="button"
                tabIndex={0}
              >
                <div className="nearby-item-body">
                  <div className="nearby-item-title">{room.hostName} 의 방</div>
                  <div className="nearby-item-sub">
                    {gameTitle(room.gameId)}
                  </div>
                </div>
                <span className="pixel-badge pixel-badge--pixel-font pixel-badge--inverse">
                  {Math.round(room.distance)}m
                </span>
              </div>
            ))
          )}
        </div>

        <div className="manual-join-row">
          <input
            type="text"
            className="pixel-input"
            placeholder="수동 코드"
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
          />
          <button type="button" className="pixel-btn pixel-btn--primary" onClick={handleManualJoin}>
            참가
          </button>
        </div>

        {combinedError && <div className="lobby-error">{combinedError}</div>}
        {copyMsg && <div className="lobby-toast">{copyMsg}</div>}
      </div>
    )
  }

  const currentGameTitle = gameTitle(gameSettings.selectedGameId)
  const showHostCode = isHost && hostPeerId && players.length < 2

  return (
    <div className="lobby-container">
      <div className="lobby-top-bar">
        <span className="lobby-title">{currentGameTitle} 대기방</span>
        <span className={`pixel-badge pixel-badge--pixel-font ${isHost ? 'pixel-badge--inverse' : 'pixel-badge--muted'}`}>
          {isHost ? 'HOST' : 'GUEST'}
        </span>
      </div>

      <p className="lobby-subtitle">
        {hasGuestJoined ? '상대방과 P2P 연결 완료!' : '근접 매칭 및 연결 대기 중…'}
      </p>

      {showHostCode && (
        <div className="host-code-card">
          <div className="host-code-title">방 코드 공유</div>
          <div className="host-code-body">
            <div className="host-code-qr">
              <QRCodeSVG value={shareUrl} size={112} bgColor="transparent" fgColor="currentColor" />
            </div>
            <div className="host-code-info">
              <div className="host-code-label">Peer ID</div>
              <div className="host-code-id">{hostPeerId}</div>
              <div className="host-code-actions">
                <button
                  type="button"
                  className="pixel-btn pixel-btn--primary host-code-btn"
                  onClick={() => handleCopy(hostPeerId, '코드')}
                >
                  코드 복사
                </button>
                <button
                  type="button"
                  className="pixel-btn pixel-btn--secondary host-code-btn"
                  onClick={() => handleCopy(shareUrl, 'URL')}
                >
                  URL 복사
                </button>
              </div>
              <div className="host-code-hint">
                상대가 QR 스캔 or URL 열면 자동 참가
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="lobby-players">
        {players.map((player) => (
          <div
            key={player.id}
            className={`lobby-player ${player.isHost ? 'lobby-player--host' : 'lobby-player--guest'}`}
          >
            <div className="lobby-player-info">
              <span className="lobby-player-avatar" aria-hidden="true">◉</span>
              <span className="lobby-player-name">
                {player.name}
                <span className="lobby-player-role">{player.isHost ? '방장' : '참가자'}</span>
              </span>
            </div>
            <span
              className={`pixel-badge pixel-badge--pixel-font ${player.ready ? 'pixel-badge--inverse' : 'pixel-badge--muted'}`}
            >
              {player.ready ? 'READY' : 'WAIT'}
            </span>
          </div>
        ))}
        {!hasGuestJoined && (
          <div className="lobby-empty-slot">
            상대가 주변 리스트에서<br />이 방을 터치할 때까지 기다려요
          </div>
        )}
      </div>

      <div className="lobby-options">
        <div className="lobby-options-title">게임 옵션</div>
        <div className="lobby-options-row">
          <span className="lobby-options-label">승리 판수</span>
          {isHost ? (
            <select
              className="pixel-select"
              value={gameSettings.rounds}
              onChange={(e) => updateGameSettings({ rounds: Number(e.target.value) })}
            >
              {ROUNDS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : (
            <span className="lobby-options-value">
              {ROUNDS_OPTIONS.find((o) => o.value === gameSettings.rounds)?.label ?? `${gameSettings.rounds}판`}
            </span>
          )}
        </div>
      </div>

      {combinedError && <div className="lobby-error">{combinedError}</div>}
      {copyMsg && <div className="lobby-toast">{copyMsg}</div>}

      <div className="lobby-actions">
        {isHost ? (
          <button
            type="button"
            className="pixel-btn pixel-btn--primary"
            disabled={!isGuestReady || !hasGuestJoined}
            onClick={onStartGame}
          >
            {!hasGuestJoined ? '참가자 대기 중' : !isGuestReady ? '상대 준비 대기' : '게임 시작'}
          </button>
        ) : (
          <button
            type="button"
            className={`pixel-btn ${isGuestReady ? 'pixel-btn--ghost' : 'pixel-btn--primary'}`}
            onClick={toggleReady}
          >
            {isGuestReady ? '준비 취소' : '준비 완료'}
          </button>
        )}
        <button type="button" className="pixel-btn pixel-btn--ghost" onClick={onBack}>
          방 나가기
        </button>
      </div>
    </div>
  )
}
