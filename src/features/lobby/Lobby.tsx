import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConnectionStatus, PlayerInfo, GameSettings, NearbyRoom } from '../../hooks/useRoom'
import type { UserLocation, LocationPermission } from '../../hooks/useLocation'
import { QrScanner } from '../../components/common/QrScanner'
import { GpsCard } from './parts/GpsCard'
import { WaitTimer } from './parts/WaitTimer'
import { ScanStatus } from './parts/ScanStatus'
import { ScanRadar } from './parts/ScanRadar'
import { QrZoomModal } from './parts/QrZoomModal'
import { InviteCard } from './parts/InviteCard'
import { ChatButton } from '../../chat/ChatButton'
import { DiagButton } from '../../components/common/DiagButton'
import { RegistryGuide } from '../games/common/RegistryGuide'
import { findGame, GAMES } from '../../games/registry'
import { useLobbyScanner } from './hooks/useLobbyScanner'

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
  iceState?: RTCIceConnectionState | null;
  dcState?: RTCDataChannelState | null;
  diagLog?: Array<{ ts: number; text: string }>;
  candTypes?: Record<'host' | 'srflx' | 'prflx' | 'relay', number>;
}

// Legacy fallback used when a room references a gameId not in the local
// registry (e.g. schema drift between clients on different builds).
const FALLBACK_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 3, label: '3판 2선승' },
]

// Per-game label for the option row. Keeps copy accurate for pingpong
// (points), breaker (attempts), escape (time), etc.
const OPTION_LABELS: Record<string, string> = {
  tictactoe: '승리 판수',
  pingpong: '승리 점수',
  memory: '보드 크기',
  bombhunt: '방식',
  breaker: '시도 횟수',
  runner: '모드',
  escape: '제한 시간',
}

const SEARCH_INTERVAL_MS = 3000
const SCAN_TICK_MS = 100
const MAX_SCAN_MS = 60_000
const COPY_TOAST_MS = 1600
const MANUAL_ID_LEN = 4

function gameTitle(gameId: string): string {
  return findGame(gameId)?.title ?? gameId
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

export function Lobby(props: LobbyProps) {
  const {
    userLocation, locationPermission, requestLocationPermission,
    connectionStatus, players, gameSettings, nearbyRooms,
    isHost, hostPeerId, offlineOffer, offlineAnswer,
    waitExpiresAt, waitExpired, restartWait,
    networkOnline, signalingConfigured,
    ingestGuestSignal, ingestHostSignal,
    error, createRoom, joinRoom, searchNearbyRooms,
    toggleReady, updateGameSettings,
    onBack, onStartGame, mode,
    // Diag state moved into DiagProvider — Lobby no longer surfaces it inline.
  } = props

  const scanner = useLobbyScanner({ ingestHostSignal, ingestGuestSignal, joinRoom })

  const [manualId, setManualId] = useState('')
  const [guideOpen, setGuideOpen] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const [scanCount, setScanCount] = useState<number>(0)
  const [nextScanIn, setNextScanIn] = useState<number>(SEARCH_INTERVAL_MS)
  const [copyMsg, setCopyMsg] = useState<string | null>(null)
  const [fullScreenQr, setFullScreenQr] = useState<string | null>(null)
  const [scanExhausted, setScanExhausted] = useState<boolean>(false)
  const [scanStartedAt, setScanStartedAt] = useState<number>(0)
  const nextScanAtRef = useRef<number>(Date.now() + SEARCH_INTERVAL_MS)
  const bootRef = useRef(false)

  const useSignalingLobby = networkOnline && signalingConfigured

  // Host CREATE: kick off room creation exactly once per mount.
  useEffect(() => {
    if (bootRef.current) return
    bootRef.current = true
    ;(async () => {
      try {
        if (mode === 'CREATE') await createRoom()
        setInitError(null)
      } catch (e) {
        setInitError(e instanceof Error ? e.message : '초기화 실패')
      }
    })()
  }, [mode, createRoom])

  // Nearby scan loop (JOIN only, needs GPS + signaling + fresh window).
  const canScan =
    mode === 'JOIN' &&
    useSignalingLobby &&
    !!userLocation &&
    !scanExhausted &&
    (connectionStatus === 'IDLE' ||
      connectionStatus === 'INITIALIZING' ||
      connectionStatus === 'WAITING')

  useEffect(() => {
    if (!canScan) return
    if (scanStartedAt === 0) setScanStartedAt(Date.now())
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

  const restartScan = () => {
    setScanExhausted(false)
    setScanCount(0)
    setScanStartedAt(Date.now())
    nextScanAtRef.current = Date.now() + SEARCH_INTERVAL_MS
    searchNearbyRooms().catch(() => undefined)
  }

  const guestPlayer = useMemo(() => players.find((p) => !p.isHost) ?? null, [players])
  const isGuestReady = guestPlayer?.ready ?? false
  const hasGuestJoined = players.length >= 2
  const shareUrl = useMemo(() => (hostPeerId ? buildShareUrl(hostPeerId) : ''), [hostPeerId])

  const handleManualJoin = async () => {
    const id = manualId.trim()
    if (!id) return
    if (!/^\d{4}$/.test(id)) {
      setInitError(`방 코드는 ${MANUAL_ID_LEN}자리 숫자예요.`)
      return
    }
    setInitError(null)
    try { await joinRoom(id) } catch (e) {
      setInitError(e instanceof Error ? e.message : '참가 실패')
    }
  }

  const showCopyToast = (label: string, ok: boolean) => {
    setCopyMsg(ok ? `${label} 복사됨` : '복사 실패')
    setTimeout(() => setCopyMsg(null), COPY_TOAST_MS)
  }

  const handleCopy = async (payload: string, label: string) => {
    const ok = await copyToClipboard(payload)
    showCopyToast(label, ok)
  }

  const combinedError = error ?? initError ?? scanner.error

  const scannerOverlay = scanner.mode !== 'off' && (
    <QrScanner
      title={scanner.mode === 'ingest-host' ? '호스트 QR 스캔' : '게스트 QR 스캔'}
      hint={
        scanner.mode === 'ingest-host'
          ? '호스트 화면에 표시된 QR을 스캔해 주세요'
          : '게스트 화면에 표시된 응답 QR을 스캔해 주세요'
      }
      onResult={scanner.handleResult}
      onError={scanner.handleError}
      onClose={scanner.close}
    />
  )

  const zoomModal = fullScreenQr && (
    <QrZoomModal value={fullScreenQr} onClose={() => setFullScreenQr(null)} />
  )

  const isJoinSearching =
    mode === 'JOIN' &&
    (connectionStatus === 'IDLE' || connectionStatus === 'ERROR')

  // ---- Transient: signaling handshake in flight -------------------------
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
            <span className="scan-status-label">보안 연결 설정 중…</span>
            <span className="scan-status-sub">P2P 터널링</span>
          </div>
          <div className="scan-progress" aria-hidden="true" style={{ position: 'relative', overflow: 'hidden' }}>
            <div className="scan-progress-bar" style={{ width: '100%', animation: 'scan-bar 1.5s infinite ease-in-out', transformOrigin: 'left' }} />
          </div>
          <div className="scan-status-hint">피어 데이터 채널을 동기화하고 있습니다</div>
        </div>

        {/* Inline DiagPanel moved into the header DiagButton drawer. */}

        <div className="lobby-diag-actions">
          <button type="button" className="pixel-btn pixel-btn--ghost" onClick={onBack}>
            방 나가기
          </button>
        </div>
      </div>
    )
  }

  // ---- JOIN searching screen --------------------------------------------
  if (isJoinSearching) {
    return (
      <div className="lobby-container">
        {scannerOverlay}
        {zoomModal}

        <div className="lobby-top-bar">
          <button type="button" className="pixel-arrow" onClick={onBack} aria-label="뒤로">◀</button>
          <span className="lobby-title">방 찾기</span>
        </div>

        {combinedError && <div className="lobby-error" style={{ margin: '0 var(--space-4)' }}>{combinedError}</div>}

        {useSignalingLobby && (
          <GpsCard
            userLocation={userLocation}
            permission={locationPermission}
            onRequestPermission={requestLocationPermission}
          />
        )}

        {useSignalingLobby && userLocation && !scanExhausted && (
          <>
            <ScanRadar
              pings={nearbyRooms.slice(0, 4).map((_r, i) => ({
                distance: nearbyRooms[i]?.distance ?? 0,
                angle: (i * (2 * Math.PI) / Math.max(1, nearbyRooms.length)) - Math.PI / 2,
              }))}
            />
            <ScanStatus
              scanCount={scanCount}
              nextScanInMs={nextScanIn}
              intervalMs={SEARCH_INTERVAL_MS}
              maxWindowMs={MAX_SCAN_MS}
            />
          </>
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
                type="tel"
                inputMode="numeric"
                pattern="\d*"
                maxLength={MANUAL_ID_LEN}
                className="pixel-input"
                placeholder={`${MANUAL_ID_LEN}자리 방 코드`}
                value={manualId}
                onChange={(e) => setManualId(e.target.value.replace(/\D/g, '').slice(0, MANUAL_ID_LEN))}
              />
              <button type="button" className="pixel-btn pixel-btn--primary" onClick={handleManualJoin}>
                참가
              </button>
            </div>
          </>
        )}

        <div className="section-heading">QR로 참가</div>
        <div className="host-code-card invite-card">
          <div className="section-desc" style={{ marginBottom: 'var(--space-2)' }}>
            호스트가 공유한 QR을 스캔하면 자동으로 참가돼요. 온라인/오프라인 QR 모두 인식돼요.
          </div>
          <div className="invite-actions invite-actions--dual">
            <button
              type="button"
              className="pixel-btn pixel-btn--primary host-code-btn"
              onClick={() => scanner.open('ingest-host')}
            >
              호스트 QR 스캔
            </button>
            {offlineAnswer && (
              <button
                type="button"
                className="pixel-btn pixel-btn--secondary host-code-btn"
                onClick={() => setFullScreenQr(offlineAnswer)}
              >
                내 응답 QR 보기
              </button>
            )}
          </div>
          {offlineAnswer && (
            <div className="host-code-hint">
              호스트가 내 응답 QR을 스캔하면 자동 연결돼요.
            </div>
          )}
        </div>

        {copyMsg && <div className="lobby-toast">{copyMsg}</div>}
      </div>
    )
  }

  // ---- Room screen (host waiting + connected room) ----------------------
  const currentGameTitle = gameTitle(gameSettings.selectedGameId)
  // Host keeps the invite card visible even after the current guest has
  // joined — the peer may drop and re-join, and hosts asked to be able
  // to re-share the code from the room screen.
  const showOfflineHostQr = isHost && !!offlineOffer
  const showOnlineHostCode = isHost && !!hostPeerId && useSignalingLobby

  return (
    <div className="lobby-container">
      {scannerOverlay}
      {zoomModal}

      <div className="lobby-top-bar">
        <span className="lobby-title">{currentGameTitle} 대기방</span>
        <div className="lobby-top-bar-actions">
          <span className={`pixel-badge pixel-badge--pixel-font ${isHost ? 'pixel-badge--inverse' : 'pixel-badge--muted'}`}>
            {isHost ? 'HOST' : 'GUEST'}
          </span>
          <ChatButton />
          <DiagButton />
          <button
            type="button"
            className="lobby-guide-btn"
            onClick={() => setGuideOpen(true)}
            aria-label="게임 가이드"
          >?</button>
        </div>
      </div>

      {combinedError && <div className="lobby-error" style={{ margin: '0 var(--space-4)' }}>{combinedError}</div>}

      <p className="lobby-subtitle">
        {hasGuestJoined && connectionStatus === 'CONNECTED'
          ? '상대방과 P2P 연결 완료!'
          : '참가자 연결 대기 중...'}
      </p>

      {isHost && !hasGuestJoined && useSignalingLobby && (
        <GpsCard
          userLocation={userLocation}
          permission={locationPermission}
          onRequestPermission={requestLocationPermission}
        />
      )}

      {isHost && !hasGuestJoined && (
        <WaitTimer
          waitExpiresAt={waitExpiresAt}
          waitExpired={waitExpired}
          onRestartWait={() => { restartWait().catch(() => undefined) }}
        />
      )}

      <InviteCard
        hostPeerId={hostPeerId}
        shareUrl={shareUrl}
        offlineOffer={offlineOffer}
        showOnline={showOnlineHostCode}
        showOffline={showOfflineHostQr}
        onCopy={handleCopy}
        onZoomOnline={() => setFullScreenQr(shareUrl)}
        onZoomOffline={() => { if (offlineOffer) setFullScreenQr(offlineOffer) }}
        onScanAnswer={() => scanner.open('ingest-guest')}
      />

      <div className="section-heading">참가자</div>
      <div className="lobby-players">
        {players.map((player) => (
          <div key={player.id} className={`lobby-player ${player.isHost ? 'lobby-player--host' : 'lobby-player--guest'}`}>
            <div className="lobby-player-info">
              <span className="lobby-player-avatar" aria-hidden="true">◉</span>
              <span className="lobby-player-name">
                {player.name}
                <span className="lobby-player-role">{player.isHost ? '호스트' : '참가자'}</span>
              </span>
            </div>
            <span className={`pixel-badge pixel-badge--pixel-font ${player.ready ? 'pixel-badge--inverse' : 'pixel-badge--muted'}`}>
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

      {(() => {
        const def = findGame(gameSettings.selectedGameId)
        const options = def?.matchOptions ?? FALLBACK_OPTIONS
        const label = OPTION_LABELS[gameSettings.selectedGameId] ?? '옵션'
        // Fallback to the first supported option's label when the
        // stored `rounds` value doesn't correspond to any of the
        // current game's matchOptions. Prevents "방식 3" style raw
        // numbers when a stale rounds value carries over.
        const currentLabel = options.find((o) => o.value === gameSettings.rounds)?.label
          ?? options[0]?.label
          ?? `${gameSettings.rounds}`
        return (
          <div className="lobby-options">
            <div className="lobby-options-title">게임 옵션</div>
            {/* Host game-type picker — swap the room's game without
                leaving the lobby. Broadcasts LOBBY_STATE so the guest
                lands on the same game. Guest sees a static label. */}
            <div className="lobby-options-row">
              <span className="lobby-options-label">게임</span>
              {isHost ? (
                <select
                  className="pixel-select"
                  value={gameSettings.selectedGameId}
                  onChange={(e) => {
                    const nextId = e.target.value
                    const nextDef = findGame(nextId)
                    // Snap `rounds` to the first supported option so the
                    // dropdown doesn't display a stale value that the
                    // new game doesn't understand.
                    const nextRounds = nextDef?.matchOptions[0]?.value ?? gameSettings.rounds
                    // Also reset the second axis so a stale wavelength
                    // 승리 점수 doesn't leak into a game that doesn't
                    // even expose the axis.
                    const nextRounds2 = nextDef?.matchOptions2?.[0]?.value
                    updateGameSettings({ selectedGameId: nextId, rounds: nextRounds, rounds2: nextRounds2 })
                  }}
                >
                  {GAMES.map((g) => (
                    <option key={g.id} value={g.id}>{g.title}</option>
                  ))}
                </select>
              ) : (
                <span className="lobby-options-value">{def?.title ?? currentGameTitle}</span>
              )}
            </div>
            {/* v3 시안 반영 — 옵션이 ≤ 4개면 chip-tab 로우, 그 이상이면
                기존 dropdown 유지. Guest 는 항상 값만 표시. 모든 선택
                이벤트는 기존 updateGameSettings 를 그대로 호출해서 하위
                게임 컴포넌트에 아무 영향도 안 감. */}
            <div className={`lobby-options-row ${isHost && options.length > 1 && options.length <= 4 ? 'lobby-options-row--chips' : ''}`}>
              <span className="lobby-options-label">{def?.matchOptionsLabel ?? label}</span>
              {isHost && options.length > 1 && options.length <= 4 ? (
                <div className="lobby-options-chipset">
                  {options.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`lobby-options-chip ${gameSettings.rounds === opt.value ? 'is-active' : ''}`}
                      onClick={() => updateGameSettings({ rounds: opt.value })}
                    >{opt.label}</button>
                  ))}
                </div>
              ) : isHost && options.length > 1 ? (
                <select
                  className="pixel-select"
                  value={gameSettings.rounds}
                  onChange={(e) => updateGameSettings({ rounds: Number(e.target.value) })}
                >
                  {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <span className="lobby-options-value">{currentLabel}</span>
              )}
            </div>
            {/* Second-axis (Wavelength 승리 점수 등). Same chip vs dropdown
                heuristic. */}
            {def?.matchOptions2 && def.matchOptions2.length > 0 && (() => {
              const opts2 = def.matchOptions2
              const useChips = isHost && opts2.length <= 4
              return (
                <div className={`lobby-options-row ${useChips ? 'lobby-options-row--chips' : ''}`}>
                  <span className="lobby-options-label">{def.matchOption2Label ?? '옵션 2'}</span>
                  {useChips ? (
                    <div className="lobby-options-chipset">
                      {opts2.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`lobby-options-chip ${(gameSettings.rounds2 ?? opts2[0].value) === opt.value ? 'is-active' : ''}`}
                          onClick={() => updateGameSettings({ rounds2: opt.value })}
                        >{opt.label}</button>
                      ))}
                    </div>
                  ) : isHost ? (
                    <select
                      className="pixel-select"
                      value={gameSettings.rounds2 ?? opts2[0].value}
                      onChange={(e) => updateGameSettings({ rounds2: Number(e.target.value) })}
                    >
                      {opts2.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="lobby-options-value">
                      {opts2.find((o) => o.value === (gameSettings.rounds2 ?? opts2[0].value))?.label ?? opts2[0].label}
                    </span>
                  )}
                </div>
              )
            })()}
            {def && (
              <div className="lobby-options-row">
                <span className="lobby-options-label">장르</span>
                <span className="lobby-options-value">{def.genre}</span>
              </div>
            )}
            {def && (
              <div className="lobby-options-row">
                <span className="lobby-options-label">인원</span>
                <span className="lobby-options-value">{def.playerCount}인</span>
              </div>
            )}
          </div>
        )
      })()}

      {copyMsg && <div className="lobby-toast">{copyMsg}</div>}

      <div className="lobby-actions">
        {isHost ? (
          <button
            type="button"
            className="pixel-btn pixel-btn--primary"
            disabled={!isGuestReady || !hasGuestJoined || connectionStatus !== 'CONNECTED'}
            onClick={onStartGame}
          >
            {connectionStatus !== 'CONNECTED'
              ? '상대 연결 중…'
              : !hasGuestJoined
                ? '참가자 대기 중'
                : !isGuestReady
                  ? '상대 준비 대기'
                  : '게임 시작'}
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

      {connectionStatus !== 'CONNECTED' && (
        <>
          {!isHost && hostPeerId && (
            <div className="lobby-diag-actions">
              <button
                type="button"
                className="pixel-btn pixel-btn--primary"
                disabled={!networkOnline}
                onClick={() => { void joinRoom(hostPeerId) }}
              >
                재연결 시도
              </button>
            </div>
          )}
          {isHost && (
            <div className="lobby-diag-actions">
              <button
                type="button"
                className="pixel-btn pixel-btn--primary"
                disabled={!networkOnline}
                onClick={() => { void restartWait() }}
              >
                방 재발행
              </button>
            </div>
          )}
        </>
      )}

      <RegistryGuide gameId={gameSettings.selectedGameId} open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  )
}
