import { useEffect, useState } from 'react'
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
  mode
}: LobbyProps) {
  const [manualId, setManualId] = useState('')

  // 1. 호스트 방 생성 또는 게스트 주변 방 검색 최초 기동
  useEffect(() => {
    if (mode === 'CREATE') {
      createRoom()
    } else {
      searchNearbyRooms()
    }
  }, [mode, createRoom, searchNearbyRooms])

  // 게스트 주변 검색용 3초 타이머 작동
  useEffect(() => {
    if (mode === 'JOIN' && connectionStatus === 'IDLE') {
      const interval = setInterval(searchNearbyRooms, 3000)
      return () => clearInterval(interval)
    }
  }, [mode, connectionStatus, searchNearbyRooms])

  // 게스트 준비 상태 확인
  const isGuestReady = players.find((p) => !p.isHost)?.ready ?? false
  const hasGuestJoined = players.length >= 2

  const handleManualJoin = () => {
    if (manualId.trim()) {
      joinRoom(manualId.trim())
    }
  }

  // --- 화면 1: 게스트 주변 방 검색 및 참여 화면 ---
  if (mode === 'JOIN' && (connectionStatus === 'IDLE' || connectionStatus === 'CONNECTING' || connectionStatus === 'INITIALIZING')) {
    return (
      <div className="lobby-container">
        <div className="lobby-main-card">
          <div>
            <span style={{ fontFamily: 'var(--font-title)', fontSize: '1.4rem', fontWeight: 600, color: 'white' }}>
              주변 게임 대기방 탐색
            </span>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              반경 20m 이내에 열려있는 방을 검색합니다.
            </p>
            
            {userLocation ? (
              <span style={{ fontSize: '0.65rem', color: 'var(--success)' }}>
                📍 GPS 획득 완료 (정밀도: {Math.round(userLocation.accuracy)}m)
              </span>
            ) : (
              <span style={{ fontSize: '0.65rem', color: 'var(--danger)' }}>
                📍 GPS 정보를 수집 중입니다...
              </span>
            )}

            <div className="room-search-box">
              {nearbyRooms.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  주변에 개설된 게임방이 없습니다.<br />
                  (3초 간격으로 자동 스캔 중)
                </div>
              ) : (
                nearbyRooms.map((room) => (
                  <div
                    key={room.peerId}
                    className="room-item-row"
                    onClick={() => joinRoom(room.peerId)}
                  >
                    <div>
                      <div style={{ color: 'white', fontWeight: 600, fontSize: '0.85rem' }}>
                        {room.hostName}의 게임방
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        게임: {room.gameId === 'tictactoe' ? '틱택토' : '미니 탁구'}
                      </div>
                    </div>
                    <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: '0.75rem' }}>
                      {Math.round(room.distance)}m 근처
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            {/* 수동 주소 연결 백업 지원 */}
            <div style={{ margin: '1rem 0', borderTop: '1px solid var(--border-glass)', paddingTop: '1rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>연결 에러가 있나요? 수동 코드로 직접 입장</span>
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                <input
                  type="text"
                  className="input-field"
                  style={{ margin: 0, padding: '0.5rem', fontSize: '0.75rem', flex: 1 }}
                  placeholder="방장 Peer ID 코드 입력"
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                />
                <button
                  className="btn-primary"
                  style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.75rem' }}
                  onClick={handleManualJoin}
                >
                  참가
                </button>
              </div>
            </div>

            {error && (
              <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginBottom: '8px', textAlign: 'center' }}>
                {error}
              </div>
            )}
            
            <button className="btn-secondary" onClick={onBack}>
              메인으로 가기
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- 화면 2: 대기방 입장 완료 상태 (호스트/게스트 공통) ---
  return (
    <div className="lobby-container">
      <div className="lobby-main-card">
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-title)', fontSize: '1.4rem', fontWeight: 600, color: 'white' }}>
              {gameSettings.selectedGameId === 'tictactoe' ? '틱택토' : '미니 탁구'} 대기방
            </span>
            <span style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', fontSize: '0.65rem', padding: '2px 8px', borderRadius: '4px' }}>
              {isHost ? '방장' : '참가자'}
            </span>
          </div>
          
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            {hasGuestJoined ? '상대방과 P2P 연결 수립!' : '근접 매칭 및 연결 대기 중...'}
          </p>

          {/* 플레이어 목록 */}
          <div className="player-list">
            {players.map((player) => (
              <div key={player.id} className="player-card">
                <div>
                  <span style={{ fontWeight: 600 }}>{player.name}</span>
                  {player.isHost && <span style={{ fontSize: '0.65rem', color: 'var(--primary)', marginLeft: '6px' }}>(방장)</span>}
                </div>
                <span
                  style={{
                    fontSize: '0.7rem',
                    color: player.ready ? 'var(--success)' : 'var(--warning)',
                    background: player.ready ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontWeight: 600
                  }}
                >
                  {player.ready ? '준비 완료' : '준비 대기'}
                </span>
              </div>
            ))}
            {!hasGuestJoined && (
              <div style={{ textAlign: 'center', padding: '1rem', border: '1px dashed var(--border-glass)', borderRadius: '12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                상대방이 GPS 리스트에서 이 방을 터치하거나,<br />
                직접 접속해주어야 합니다.
              </div>
            )}
          </div>

          {/* 게임 옵션 설정 (방장만 활성화) */}
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-glass)', paddingTop: '1rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'white' }}>게임 옵션 설정</span>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>게임 승리 판수</span>
              {isHost ? (
                <select
                  value={gameSettings.rounds}
                  onChange={(e) => updateGameSettings({ rounds: Number(e.target.value) })}
                  style={{ background: 'var(--bg-dark)', color: 'white', border: '1px solid var(--border-glass)', padding: '4px 8px', borderRadius: '4px', outline: 'none' }}
                >
                  <option value={1}>단판제 (1점승)</option>
                  <option value={3}>3판 2선승제</option>
                  <option value={5}>5판 3선승제</option>
                </select>
              ) : (
                <span style={{ fontSize: '0.75rem', color: 'white', fontWeight: 600 }}>{gameSettings.rounds}판 세트</span>
              )}
            </div>
          </div>
        </div>

        <div>
          {error && (
            <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginBottom: '8px', textAlign: 'center' }}>
              {error}
            </div>
          )}

          {isHost ? (
            <button
              className="btn-primary"
              disabled={!isGuestReady || !hasGuestJoined}
              onClick={() => {
                if (onStartGame) onStartGame()
              }}
            >
              {!hasGuestJoined ? '참가자 대기 중' : !isGuestReady ? '상대방 준비 대기 중' : '게임 시작하기'}
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={toggleReady}
              style={{ background: players.find(p => p.id === players.find(x => !x.isHost)?.id)?.ready ? 'var(--danger)' : 'linear-gradient(135deg, var(--primary), var(--secondary))' }}
            >
              {players.find(p => p.id === players.find(x => !x.isHost)?.id)?.ready ? '준비 취소' : '준비 완료'}
            </button>
          )}

          <button className="btn-secondary" style={{ marginTop: '8px' }} onClick={onBack}>
            방 나가기
          </button>
        </div>
      </div>
    </div>
  )
}
