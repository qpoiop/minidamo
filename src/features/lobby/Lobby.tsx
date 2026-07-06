import { useEffect, useMemo, useState } from 'react'
import type { ConnectionStatus, PlayerInfo, GameSettings, NearbyRoom } from '../../hooks/usePeer'
import type { UserLocation } from '../../hooks/useLocation'

interface LobbyProps {
  userLocation: UserLocation | null;
  connectionStatus: ConnectionStatus;
  players: PlayerInfo[];
  gameSettings: GameSettings;
  nearbyRooms: NearbyRoom[];
  isHost: boolean;
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

function gameTitle(gameId: string): string {
  return GAME_TITLES[gameId] ?? gameId
}

export function Lobby({
  userLocation,
  connectionStatus,
  players,
  gameSettings,
  nearbyRooms,
  isHost,
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

  useEffect(() => {
    try {
      if (mode === 'CREATE') createRoom()
      else searchNearbyRooms()
      setInitError(null)
    } catch (e) {
      setInitError(e instanceof Error ? e.message : '초기화 실패')
    }
  }, [mode, createRoom, searchNearbyRooms])

  useEffect(() => {
    if (mode !== 'JOIN') return
    if (connectionStatus !== 'IDLE' && connectionStatus !== 'INITIALIZING' && connectionStatus !== 'WAITING') return
    const timer = setInterval(searchNearbyRooms, SEARCH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [mode, connectionStatus, searchNearbyRooms])

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

        <div className={`gps-status ${userLocation ? 'gps-status--ok' : 'gps-status--waiting'}`}>
          {userLocation
            ? `GPS 획득 · 정밀도 ${Math.round(userLocation.accuracy)}m`
            : 'GPS 좌표 수집 중…'}
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
      </div>
    )
  }

  const currentGameTitle = gameTitle(gameSettings.selectedGameId)

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
