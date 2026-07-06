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
  waitExpiresAt: number | null;
  waitExpired: boolean;
  restartWait: () => Promise<void>;
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
const MAX_SCAN_MS = 60_000

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
  waitExpiresAt,
  waitExpired,
  restartWait,
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
  const [fullScreenQr, setFullScreenQr] = useState<string | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanExhausted, setScanExhausted] = useState<boolean>(false)
  const [scanStartedAt, setScanStartedAt] = useState<number>(0)
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
        }
        setInitError(null)
      } catch (e) {
        setInitError(e instanceof Error ? e.message : '초기화 실패')
      }
    })()
  }, [mode, createRoom])

  const canScan =
    mode === 'JOIN' &&
    useSignalingLobby &&
    !!userLocation &&
    !scanExhausted &&
    (connectionStatus === 'IDLE' || connectionStatus === 'INITIALIZING' || connectionStatus === 'WAITING')

  const restartScan = () => {
    setScanExhausted(false)
    setScanCount(0)
    setScanStartedAt(Date.now())
    nextScanAtRef.current = Date.now() + SEARCH_INTERVAL_MS
    searchNearbyRooms().catch(() => undefined)
  }

  useEffect(() => {
    if (!canScan) return
    if (scanStartedAt === 0) setScanStartedAt(Date.now())
    // 첫 스캔 즉시 실행
    searchNearbyRooms().catch(() => undefined)
    setScanCount((n) => n + 1)
    nextScanAtRef.current = Date.now() + SEARCH_INTERVAL_MS
    const timer = setInterval(() => {
      searchNearbyRooms().catch(() => undefined)
      setScanCount((n) => n + 1)
      nextScanAtRef.current = Date.now() + SEARCH_INTERVAL_MS
    }, SEARCH_INTERVAL_MS)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canScan])

  useEffect(() => {
    if (!canScan) return
    const tick = setInterval(() => {
      setNextScanIn(Math.max(0, nextScanAtRef.current - Date.now()))
      if (scanStartedAt > 0 && Date.now() - scanStartedAt >= MAX_SCAN_MS) {
        setScanExhausted(true)
      }
    }, SCAN_TICK_MS)
    return () => clearInterval(tick)
  }, [canScan, scanStartedAt])

  const guestPlayer = useMemo(() => players.find((p) => !p.isHost) ?? null, [players])
  const isGuestReady = guestPlayer?.ready ?? false
  const hasGuestJoined = players.length >= 2

  const shareUrl = useMemo(() => (hostPeerId ? buildShareUrl(hostPeerId) : ''), [hostPeerId])

  const [waitRemainingMs, setWaitRemainingMs] = useState<number>(0)
  useEffect(() => {
    if (!waitExpiresAt) {
      setWaitRemainingMs(0)
      return
    }
    setWaitRemainingMs(Math.max(0, waitExpiresAt - Date.now()))
    const tick = setInterval(() => {
      setWaitRemainingMs(Math.max(0, waitExpiresAt - Date.now()))
    }, 200)
    return () => clearInterval(tick)
  }, [waitExpiresAt])

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

  const scannerModeRef = useRef<'off' | 'ingest-host' | 'ingest-guest'>('off')
  useEffect(() => {
    scannerModeRef.current = scannerMode
  }, [scannerMode])

  const handleScanResult = async (raw: string) => {
    const mode = scannerModeRef.current
    setScannerMode('off')
    if (mode === 'off') return
    const trimmed = raw.trim()
    try {
      if (mode === 'ingest-guest') {
        await ingestGuestSignal(trimmed)
      } else {
        // ingest-host: 오프라인 SDP or 온라인 공유 URL / 방 ID 자동 판별
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
          const parsed = new URL(trimmed)
          const roomId = parsed.searchParams.get('room')
          if (!roomId) throw new Error('URL에 room 파라미터가 없어요.')
          await joinRoom(roomId)
        } else if (/^[0-9a-z]{8,16}$/i.test(trimmed)) {
          await joinRoom(trimmed)
        } else {
          await ingestHostSignal(trimmed)
        }
      }
      setScanError(null)
    } catch (e) {
      console.error('scan ingest failed', e)
      setScanError(e instanceof Error ? e.message : 'QR 처리 실패')
    }
  }

  const isJoinSearching =
    mode === 'JOIN' &&
    (connectionStatus === 'IDLE' || connectionStatus === 'ERROR')

  const gpsLabel = userLocation
    ? `GPS 획득 · 정밀도 ${Math.round(userLocation.accuracy)}m`
    : locationPermission === 'denied'
      ? 'GPS 권한 거부됨'
      : locationPermission === 'unsupported'
        ? 'GPS 미지원 브라우저'
        : 'GPS 좌표 수집 중…'
  const gpsVariant = userLocation
    ? 'gps-card--ok'
    : locationPermission === 'denied'
      ? 'gps-card--denied'
      : 'gps-card--waiting'
  const showGpsRequest = !userLocation && (locationPermission === 'denied' || locationPermission === 'prompt')

  const renderGpsCard = () => (
    <div className={`gps-card ${gpsVariant}`}>
      <div className="gps-card-row">
        <span className="gps-card-label">{gpsLabel}</span>
      </div>
      {showGpsRequest && (
        <button
          type="button"
          className="pixel-btn pixel-btn--primary gps-card-cta"
          onClick={requestLocationPermission}
        >
          위치 권한 요청
        </button>
      )}
    </div>
  )

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

  const lobbyQrModal = fullScreenQr && (
    <div className="qr-zoom-overlay" onClick={() => setFullScreenQr(null)}>
      <div className="qr-zoom-card" onClick={(e) => e.stopPropagation()}>
        <span className="qr-zoom-title">QR 코드 확대</span>
        <div className="qr-zoom-frame">
          <QRCodeSVG value={fullScreenQr} size={320} bgColor="#ffffff" fgColor="#000000" level="L" />
        </div>
        <div className="qr-zoom-hint">상대 카메라에 정면으로 화면을 비춰 주세요</div>
        <button
          type="button"
          className="pixel-btn pixel-btn--ghost qr-zoom-close"
          onClick={() => setFullScreenQr(null)}
        >
          닫기
        </button>
      </div>
    </div>
  )

  if (connectionStatus === 'INITIALIZING' || connectionStatus === 'CONNECTING') {
    return (
      <div className="lobby-container">
        <div className="lobby-top-bar">
          <button type="button" className="pixel-arrow" onClick={onBack} aria-label="뒤로">◀</button>
          <span className="lobby-title">방 접속 중</span>
        </div>
        <div className="scan-status" style={{ marginTop: 'var(--space-6)' }}>
          <div className="scan-status-row">
            <span className="scan-dot" aria-hidden="true" style={{ animation: 'blink 1s infinite' }} />
            <span className="scan-status-label">보안 연결 설정 중...</span>
            <span className="scan-status-sub">P2P 터널링</span>
          </div>
          <div className="scan-progress" aria-hidden="true" style={{ position: 'relative', overflow: 'hidden' }}>
            <div
              className="scan-progress-bar"
              style={{ width: '100%', animation: 'scan-bar 1.5s infinite ease-in-out', transformOrigin: 'left' }}
            />
          </div>
          <div className="scan-status-hint">
            피어 데이터 채널을 동기화하고 있습니다
          </div>
        </div>
      </div>
    )
  }

  if (isJoinSearching) {
    return (
      <div className="lobby-container">
        {scannerOverlay}
        <div className="lobby-top-bar">
          <button type="button" className="pixel-arrow" onClick={onBack} aria-label="뒤로">◀</button>
          <span className="lobby-title">방 찾기</span>
        </div>

        {combinedError && <div className="lobby-error" style={{ margin: '0 var(--space-4)' }}>{combinedError}</div>}

        {useSignalingLobby && renderGpsCard()}

        {useSignalingLobby && userLocation && !scanExhausted && (
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
            <div className="scan-status-hint">
              반경 20m 이내 스캔 · 최대 {MAX_SCAN_MS / 1000}초
            </div>
          </div>
        )}

        {useSignalingLobby && userLocation && scanExhausted && (
          <div className="scan-exhausted">
            <div className="scan-exhausted-title">스캔 종료</div>
            <div className="scan-exhausted-desc">
              {MAX_SCAN_MS / 1000}초 동안 근처 방을 찾지 못했어요
            </div>
            <button type="button" className="pixel-btn pixel-btn--primary" onClick={restartScan}>
              다시 스캔
            </button>
          </div>
        )}

        {useSignalingLobby && !userLocation && (
          <div className="scan-status scan-status--paused">
            GPS 좌표가 없어서 스캔을 시작하지 않아요
          </div>
        )}

        {useSignalingLobby && (
          <>
            <div className="section-heading">온라인 참가</div>
            <div className="nearby-list">
              {nearbyRooms.length === 0 ? (
                <div className="nearby-empty">
                  {userLocation ? '주변 방 없음' : 'GPS 획득 대기 중'}
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
          </>
        )}

        <div className="section-heading">오프라인 참가</div>
        <div className="offline-flow">
          <div className="offline-step">
            <div className="offline-step-num">1</div>
            <div className="offline-step-body">
              <div className="offline-step-title">방장 QR 스캔</div>
              <div className="offline-step-desc">방장 화면의 QR을 카메라로 읽어 주세요.</div>
              <button
                type="button"
                className="pixel-btn pixel-btn--primary offline-step-cta"
                onClick={() => setScannerMode('ingest-host')}
              >
                카메라 열기
              </button>
            </div>
          </div>

          {offlineAnswer && (
            <div className="offline-step">
              <div className="offline-step-num">2</div>
              <div className="offline-step-body">
                <div className="offline-step-title">내 응답 QR</div>
                <div className="offline-step-desc">이 QR을 방장 카메라에 비춰 주세요.</div>
                <div
                  className="qr-tile"
                  role="button"
                  tabIndex={0}
                  onClick={() => setFullScreenQr(offlineAnswer)}
                >
                  <QRCodeSVG value={offlineAnswer} size={240} bgColor="#ffffff" fgColor="#000000" level="L" />
                  <div className="qr-tile-hint">탭하면 확대</div>
                </div>
              </div>
            </div>
          )}
        </div>

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
      {lobbyQrModal}
      <div className="lobby-top-bar">
        <span className="lobby-title">{currentGameTitle} 대기방</span>
        <span className={`pixel-badge pixel-badge--pixel-font ${isHost ? 'pixel-badge--inverse' : 'pixel-badge--muted'}`}>
          {isHost ? 'HOST' : 'GUEST'}
        </span>
      </div>

      {combinedError && <div className="lobby-error" style={{ margin: '0 var(--space-4)' }}>{combinedError}</div>}

      <p className="lobby-subtitle">
        {hasGuestJoined && connectionStatus === 'CONNECTED'
          ? '상대방과 P2P 연결 완료!'
          : '참가자 연결 대기 중...'}
      </p>

      {isHost && !hasGuestJoined && useSignalingLobby && renderGpsCard()}

      {isHost && !hasGuestJoined && (waitExpiresAt || waitExpired) && (
        <div className={`wait-timer-card ${waitExpired ? 'wait-timer-card--expired' : ''}`}>
          {waitExpired ? (
            <>
              <div className="wait-timer-title">입장 대기 만료</div>
              <div className="wait-timer-desc">
                60초 동안 참가자가 없었어요. 다시 대기를 시작할 수 있어요.
              </div>
              <button
                type="button"
                className="pixel-btn pixel-btn--primary"
                onClick={() => { restartWait().catch(() => undefined) }}
              >
                다시 대기하기
              </button>
            </>
          ) : (
            <>
              <div className="wait-timer-title">입장 대기 중</div>
              <div className="wait-timer-count">
                {Math.ceil(waitRemainingMs / 1000)}초
              </div>
              <div className="wait-timer-progress" aria-hidden="true">
                <div
                  className="wait-timer-bar"
                  style={{ width: `${(waitRemainingMs / (60 * 1000)) * 100}%` }}
                />
              </div>
              <div className="wait-timer-desc">
                이 시간 안에 참가자가 QR/코드로 들어와야 해요
              </div>
            </>
          )}
        </div>
      )}

      {showOnlineHostCode && (
        <>
          <div className="section-heading">온라인 코드</div>
          <div className="host-code-card">
            <div className="online-code-body">
              <div
                className="qr-tile"
                role="button"
                tabIndex={0}
                onClick={() => setFullScreenQr(shareUrl)}
              >
                <QRCodeSVG value={shareUrl} size={220} bgColor="#ffffff" fgColor="#000000" level="M" />
                <div className="qr-tile-hint">탭하면 확대</div>
              </div>
              <div className="online-code-info">
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
                <div className="host-code-hint">QR 스캔 또는 URL 열기로 자동 참가</div>
              </div>
            </div>
          </div>
        </>
      )}

      {showOfflineHostQr && (
        <>
          <div className="section-heading">오프라인 코드</div>
          <div className="offline-flow">
            <div className="offline-step">
              <div className="offline-step-num">1</div>
              <div className="offline-step-body">
                <div className="offline-step-title">내 방 QR</div>
                <div className="offline-step-desc">게스트가 이 QR을 스캔하도록 화면을 보여 주세요.</div>
                <div
                  className="qr-tile"
                  role="button"
                  tabIndex={0}
                  onClick={() => setFullScreenQr(offlineOffer)}
                >
                  <QRCodeSVG value={offlineOffer!} size={240} bgColor="#ffffff" fgColor="#000000" level="L" />
                  <div className="qr-tile-hint">탭하면 확대</div>
                </div>
              </div>
            </div>

            <div className="offline-step">
              <div className="offline-step-num">2</div>
              <div className="offline-step-body">
                <div className="offline-step-title">게스트 응답 QR 스캔</div>
                <div className="offline-step-desc">게스트 화면에 나온 응답 QR을 카메라로 읽어 연결을 마무리해 주세요.</div>
                <button
                  type="button"
                  className="pixel-btn pixel-btn--primary offline-step-cta"
                  onClick={() => setScannerMode('ingest-guest')}
                >
                  카메라 열기
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="section-heading">참가자</div>
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

      {copyMsg && <div className="lobby-toast">{copyMsg}</div>}

      <div className="lobby-actions">
        {isHost ? (
          <button
            type="button"
            className="pixel-btn pixel-btn--primary"
            disabled={!isGuestReady || !hasGuestJoined || connectionStatus !== 'CONNECTED'}
            onClick={onStartGame}
          >
            {connectionStatus !== 'CONNECTED' ? '상대 연결 중…' : !hasGuestJoined ? '참가자 대기 중' : !isGuestReady ? '상대 준비 대기' : '게임 시작'}
          </button>
        ) : (
          <button
            type="button"
            className={`pixel-btn ${isGuestReady ? 'pixel-btn--ghost' : 'pixel-btn--primary'}`}
            disabled={connectionStatus !== 'CONNECTED'}
            onClick={toggleReady}
          >
            {connectionStatus !== 'CONNECTED' ? '상대 연결 중…' : isGuestReady ? '준비 취소' : '준비 완료'}
          </button>
        )}
        <button type="button" className="pixel-btn pixel-btn--ghost" onClick={onBack}>
          방 나가기
        </button>
      </div>
    </div>
  )
}
