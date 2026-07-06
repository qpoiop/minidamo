import { useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import type { ConnectionStatus, PlayerInfo, GameSettings, NearbyRoom } from '../../hooks/useRoom'
import type { UserLocation, LocationPermission } from '../../hooks/useLocation'
import { QrScanner } from '../../components/common/QrScanner'

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
  offlineOffer: string | null;
  offlineAnswer: string | null;
  networkOnline: boolean;
  signalingConfigured: boolean;
  ingestGuestSignal: (raw: string) => Promise<void>;
  ingestHostSignal: (raw: string) => Promise<void>;
  error: string | null;
  createRoom: () => Promise<void>;
  joinRoom: (id: string) => Promise<void>;
  searchNearbyRooms: () => Promise<void>;
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

function buildShareUrl(roomId: string): string {
  const url = new URL(window.location.href)
  url.searchParams.delete('room')
  url.hash = ''
  url.searchParams.set('room', roomId)
  return url.toString()
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
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
  offlineOffer,
  offlineAnswer,
  networkOnline,
  signalingConfigured,
  ingestGuestSignal,
  ingestHostSignal,
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
  const [scannerMode, setScannerMode] = useState<'off' | 'ingest-host' | 'ingest-guest'>('off')
  const [scanError, setScanError] = useState<string | null>(null)
  const nextScanAtRef = useRef<number>(Date.now() + SEARCH_INTERVAL_MS)
  const bootRef = useRef(false)

  const useSignalingLobby = networkOnline && signalingConfigured
  const offlineMode = !useSignalingLobby

  useEffect(() => {
    if (bootRef.current) return
    bootRef.current = true
    ;(async () => {
      try {
        if (mode === 'CREATE') {
          await createRoom()
        } else if (useSignalingLobby) {
          await searchNearbyRooms()
          setScanCount(1)
          nextScanAtRef.current = Date.now() + SEARCH_INTERVAL_MS
        }
        setInitError(null)
      } catch (e) {
        setInitError(e instanceof Error ? e.message : '초기화 실패')
      }
    })()
  }, [mode, createRoom, searchNearbyRooms, useSignalingLobby])

  useEffect(() => {
    if (mode !== 'JOIN' || !useSignalingLobby) return
    if (connectionStatus !== 'IDLE' && connectionStatus !== 'INITIALIZING' && connectionStatus !== 'WAITING') return
    const timer = setInterval(() => {
      searchNearbyRooms().catch(() => undefined)
      setScanCount((n) => n + 1)
      nextScanAtRef.current = Date.now() + SEARCH_INTERVAL_MS
    }, SEARCH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [mode, useSignalingLobby, connectionStatus, searchNearbyRooms])

  useEffect(() => {
    if (mode !== 'JOIN' || !useSignalingLobby) return
    const tick = setInterval(() => {
      setNextScanIn(Math.max(0, nextScanAtRef.current - Date.now()))
    }, SCAN_TICK_MS)
    return () => clearInterval(tick)
  }, [mode, useSignalingLobby])

  const guestPlayer = useMemo(() => players.find((p) => !p.isHost) ?? null, [players])
  const isGuestReady = guestPlayer?.ready ?? false
  const hasGuestJoined = players.length >= 2

  const shareUrl = useMemo(() => (hostPeerId ? buildShareUrl(hostPeerId) : ''), [hostPeerId])

  const handleManualJoin = async () => {
    const id = manualId.trim()
    if (!id) return
    if (id.length < 6) {
      setInitError('코드가 너무 짧아요.')
      return
    }
    setInitError(null)
    try { await joinRoom(id) } catch (e) {
      setInitError(e instanceof Error ? e.message : '참가 실패')
    }
  }

  const handleCopy = async (payload: string, label: string) => {
    const ok = await copyToClipboard(payload)
    setCopyMsg(ok ? `${label} 복사됨` : '복사 실패')
    setTimeout(() => setCopyMsg(null), 1600)
  }

  const combinedError = error ?? initError ?? scanError

  const handleScanResult = async (raw: string) => {
    setScannerMode('off')
    try {
      if (scannerMode === 'ingest-host') {
        await ingestHostSignal(raw)
      } else if (scannerMode === 'ingest-guest') {
        await ingestGuestSignal(raw)
      }
      setScanError(null)
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'QR 처리 실패')
    }
  }

  const isJoinSearching =
    mode === 'JOIN' &&
    (connectionStatus === 'IDLE' ||
      connectionStatus === 'CONNECTING' ||
      connectionStatus === 'INITIALIZING' ||
      connectionStatus === 'WAITING')

  // Common scanner overlay
  const scannerOverlay = scannerMode !== 'off' && (
    <QrScanner
      title={scannerMode === 'ingest-host' ? '호스트 QR 스캔' : '게스트 QR 스캔'}
      hint={scannerMode === 'ingest-host'
        ? '방장 화면에 표시된 offer QR을 스캔해 주세요'
        : '게스트 화면에 표시된 answer QR을 스캔해 주세요'}
      onResult={handleScanResult}
      onError={(e) => setScanError(e instanceof Error ? e.message : '카메라 오류')}
      onClose={() => setScannerMode('off')}
    />
  )

  if (isJoinSearching) {
    return (
      <div className="lobby-container">
        {scannerOverlay}
        <div className="lobby-top-bar">
          <button type="button" className="pixel-arrow" onClick={onBack} aria-label="뒤로">◀</button>
          <span className="lobby-title">주변 대기방</span>
        </div>

        {useSignalingLobby ? (
          <>
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
          </>
        ) : (
          <p className="lobby-subtitle">
            {networkOnline
              ? '시그널링 서버가 설정돼있지 않아요 · QR 스캔 모드'
              : '오프라인 · QR 스캔으로만 참가할 수 있어요'}
          </p>
        )}

        {useSignalingLobby && (
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
        )}

        {useSignalingLobby ? (
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
                  onClick={() => joinRoom(room.peerId).catch(() => undefined)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="nearby-item-body">
                    <div className="nearby-item-title">{room.hostName} 의 방</div>
                    <div className="nearby-item-sub">{gameTitle(room.gameId)}</div>
                  </div>
                  <span className="pixel-badge pixel-badge--pixel-font pixel-badge--inverse">
                    {Math.round(room.distance)}m
                  </span>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="offline-join-card">
            <div className="offline-join-title">오프라인 QR 참가</div>
            <p className="offline-join-desc">
              방장 화면의 QR을 카메라로 스캔하면 offer/answer 교환이 자동 진행돼요.
            </p>
            <button
              type="button"
              className="pixel-btn pixel-btn--primary"
              onClick={() => setScannerMode('ingest-host')}
            >
              방장 QR 스캔 시작
            </button>
            {offlineAnswer && (
              <div className="offline-answer-block">
                <div className="offline-answer-label">
                  내 응답 QR — 방장에게 보여 주세요
                </div>
                <div className="offline-qr-wrap">
                  <QRCodeSVG value={offlineAnswer} size={200} bgColor="transparent" fgColor="currentColor" />
                </div>
              </div>
            )}
          </div>
        )}

        {useSignalingLobby && (
          <div className="manual-join-row">
            <input
              type="text"
              className="pixel-input"
              placeholder="수동 코드"
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
            />
            <button
              type="button"
              className="pixel-btn pixel-btn--primary"
              onClick={handleManualJoin}
            >
              참가
            </button>
          </div>
        )}

        {combinedError && <div className="lobby-error">{combinedError}</div>}
        {copyMsg && <div className="lobby-toast">{copyMsg}</div>}
      </div>
    )
  }

  const currentGameTitle = gameTitle(gameSettings.selectedGameId)
  const showOfflineHostQr = isHost && offlineOffer && (offlineMode || players.length < 2)
  const showOnlineHostCode = isHost && hostPeerId && useSignalingLobby && players.length < 2

  return (
    <div className="lobby-container">
      {scannerOverlay}
      <div className="lobby-top-bar">
        <span className="lobby-title">{currentGameTitle} 대기방</span>
        <span className={`pixel-badge pixel-badge--pixel-font ${isHost ? 'pixel-badge--inverse' : 'pixel-badge--muted'}`}>
          {isHost ? 'HOST' : 'GUEST'}
        </span>
      </div>

      <p className="lobby-subtitle">
        {hasGuestJoined
          ? '상대방과 P2P 연결 완료!'
          : offlineMode
            ? '오프라인 모드 · QR 코드로 서로 교환해요'
            : '근접 매칭 및 연결 대기 중…'}
      </p>

      {showOnlineHostCode && (
        <div className="host-code-card">
          <div className="host-code-title">방 코드 공유</div>
          <div className="host-code-body">
            <div className="host-code-qr">
              <QRCodeSVG value={shareUrl} size={112} bgColor="transparent" fgColor="currentColor" />
            </div>
            <div className="host-code-info">
              <div className="host-code-label">방 ID</div>
              <div className="host-code-id">{hostPeerId}</div>
              <div className="host-code-actions">
                <button type="button" className="pixel-btn pixel-btn--primary host-code-btn" onClick={() => handleCopy(hostPeerId, '코드')}>
                  코드 복사
                </button>
                <button type="button" className="pixel-btn pixel-btn--secondary host-code-btn" onClick={() => handleCopy(shareUrl, 'URL')}>
                  URL 복사
                </button>
              </div>
              <div className="host-code-hint">상대가 QR/URL로 접근 → 자동 참가</div>
            </div>
          </div>
        </div>
      )}

      {showOfflineHostQr && (
        <div className="host-code-card">
          <div className="host-code-title">오프라인 QR (Offer)</div>
          <div className="offline-qr-wrap">
            <QRCodeSVG value={offlineOffer!} size={220} bgColor="transparent" fgColor="currentColor" />
          </div>
          <div className="host-code-hint">
            게스트가 위 QR을 스캔하면 그 응답 QR을 보여줍니다.<br />
            아래 스캐너로 게스트 QR을 읽어 연결을 완료해 주세요.
          </div>
          <button
            type="button"
            className="pixel-btn pixel-btn--primary"
            onClick={() => setScannerMode('ingest-guest')}
          >
            게스트 QR 스캔
          </button>
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
        {!hasGuestJoined && !showOfflineHostQr && (
          <div className="lobby-empty-slot">
            상대가 QR 스캔 or 링크로<br />이 방을 참가할 때까지 대기해요
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
