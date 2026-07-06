import { useState, useEffect } from 'react'
import { Splash } from './components/common/Splash'
import { Home } from './features/home/Home'
import { Lobby } from './features/lobby/Lobby'
import { TicTacToe } from './features/games/tictactoe/TicTacToe'
import { PingPong } from './features/games/pingpong/PingPong'
import { PWAPrompt } from './components/common/PWAPrompt'
import { useLocation } from './hooks/useLocation'
import { useRoom } from './hooks/useRoom'
import type { P2PMessage } from './hooks/useRoom'
import { useNetwork } from './hooks/useNetwork'
import { OfflineBanner } from './components/common/OfflineBanner'
import { generateNick } from './services/nickPool'

const USER_NAME_STORAGE_KEY = 'minidamo_user_name'
const SESSION_STATE_KEY = 'minidamo:session-state:v1'
const SESSION_MAX_STALE_MS = 3 * 60 * 1000

interface PersistedSession {
  roomId: string;
  isHost: boolean;
  gameId: string;
  screen: 'LOBBY' | 'GAME_PLAY';
  savedAt: number;
}

function loadSession(): PersistedSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STATE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedSession
    if (!parsed || !parsed.roomId) return null
    if (Date.now() - parsed.savedAt > SESSION_MAX_STALE_MS) return null
    return parsed
  } catch {
    return null
  }
}

function saveSession(s: PersistedSession): void {
  try { sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

function clearSession(): void {
  try { sessionStorage.removeItem(SESSION_STATE_KEY) } catch { /* ignore */ }
}

type ScreenType = 'SPLASH' | 'HOME' | 'LOBBY' | 'GAME_PLAY'


export default function App() {
  const [screen, setScreen] = useState<ScreenType>('SPLASH')
  const [lobbyMode, setLobbyMode] = useState<'CREATE' | 'JOIN'>('CREATE')
  const [userName, setUserName] = useState<string>('')
  const [restorePrompt, setRestorePrompt] = useState<PersistedSession | null>(null)
  const [restoreState, setRestoreState] = useState<'idle' | 'restoring' | 'failed'>('idle')

  const {
    location: userLocation,
    error: locationError,
    permission: locationPermission,
    requestPermission: requestLocationPermission,
  } = useLocation()

  const peerState = useRoom(userName, userLocation)
  const network = useNetwork()

  useEffect(() => {
    const saved = localStorage.getItem(USER_NAME_STORAGE_KEY)
    if (saved) {
      setUserName(saved)
    } else {
      const generated = generateNick()
      localStorage.setItem(USER_NAME_STORAGE_KEY, generated)
      setUserName(generated)
    }
    // 스플래시가 끝난 뒤에도 대기 방/게임 세션이 남아있는지 확인.
    const session = loadSession()
    if (session) setRestorePrompt(session)
  }, [])

  // Save session whenever we're in a live room screen so a background kill /
  // accidental reload can offer to rejoin.
  useEffect(() => {
    if ((screen === 'LOBBY' || screen === 'GAME_PLAY') && peerState.peerId) {
      saveSession({
        roomId: peerState.peerId,
        isHost: peerState.isHost,
        gameId: peerState.gameSettings.selectedGameId,
        screen,
        savedAt: Date.now(),
      })
    } else if (screen === 'HOME' || screen === 'SPLASH') {
      // Only clear once we've actually left the room flow.
      if (restoreState !== 'restoring') clearSession()
    }
  }, [screen, peerState.peerId, peerState.isHost, peerState.gameSettings.selectedGameId, restoreState])

  const dismissRestorePrompt = () => {
    clearSession()
    setRestorePrompt(null)
  }

  const acceptRestore = async () => {
    if (!restorePrompt) return
    setRestoreState('restoring')
    setLobbyMode('JOIN')
    setScreen('LOBBY')
    try {
      // Host can't re-attach to the old peer connection cleanly, so route
      // everyone through the guest path — worker still knows the room while
      // the host is polling for answers.
      await peerState.joinRoom(restorePrompt.roomId, true)
      setRestorePrompt(null)
      setRestoreState('idle')
    } catch {
      setRestoreState('failed')
      setScreen('HOME')
      clearSession()
    }
  }

  // URL 파라미터로 자동 참가 (?room=<peerId> 또는 #room=<peerId>)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const hashMatch = window.location.hash.match(/room=([^&]+)/)
    const roomId = params.get('room') || (hashMatch ? hashMatch[1] : null)
    if (!roomId || !userName) return
    setLobbyMode('JOIN')
    setScreen('LOBBY')
    setTimeout(() => peerState.joinRoom(roomId, true), 200)
    // URL 정리
    const url = new URL(window.location.href)
    url.searchParams.delete('room')
    url.hash = ''
    window.history.replaceState({}, '', url.toString())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userName])

  const updateUserName = (name: string) => {
    setUserName(name)
    localStorage.setItem(USER_NAME_STORAGE_KEY, name)
  }

  // 뒤로가기 가로채기 — HOME/LOBBY/GAME_PLAY 각각 다른 확인 다이얼로그
  useEffect(() => {
    if (screen === 'SPLASH') return
    const stateMark = { minidamo: true, screen }
    window.history.pushState(stateMark, '')
    const handlePop = () => {
      const message =
        screen === 'GAME_PLAY'
          ? '게임을 나가시겠어요? 상대방과의 연결이 끊어져요.'
          : screen === 'LOBBY'
            ? '대기방을 나가시겠어요?'
            : '앱을 종료하시겠어요?'
      const confirmed = window.confirm(message)
      if (!confirmed) {
        // 사용자 취소 → history 재삽입
        window.history.pushState(stateMark, '')
        return
      }
      if (screen === 'HOME') {
        // 홈에서 확인 시 실제 종료 시도 (한 단계 뒤로)
        window.history.back()
      } else {
        handleExit()
      }
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen])

  useEffect(() => {
    const handleGlobalP2P = (e: Event) => {
      const msg = (e as CustomEvent<P2PMessage>).detail
      
      if (msg.type === 'GAME_START') {
        setScreen('GAME_PLAY')
      } else if (msg.type === 'DISCONNECT') {
        setScreen('HOME')
      } else if (msg.type === 'GAME_RESET' && msg.payload?.action === 'LOBBY') {
        setScreen('LOBBY')
      }
    }

    window.addEventListener('p2p_message', handleGlobalP2P)
    return () => window.removeEventListener('p2p_message', handleGlobalP2P)
  }, [])

  const handleCreateRoom = (gameId: string) => {
    setLobbyMode('CREATE')
    peerState.updateGameSettings({ selectedGameId: gameId })
    setScreen('LOBBY')
  }

  // 주변 방 참가 트리거
  const handleJoinNearby = () => {
    setLobbyMode('JOIN')
    setScreen('LOBBY')
  }

  // 호스트가 게임 시작 단추를 눌렀을 때의 트리거
  const handleStartGame = () => {
    peerState.sendMessage({
      type: 'GAME_START',
      senderId: peerState.peerId,
      timestamp: Date.now(),
      payload: { gameId: peerState.gameSettings.selectedGameId }
    })
    setScreen('GAME_PLAY')
  }

  // 게임 종료 후 루프 액션 핸들러들
  const handleGoLobby = () => {
    setScreen('LOBBY')
    peerState.sendMessage({
      type: 'GAME_RESET',
      senderId: peerState.peerId,
      timestamp: Date.now(),
      payload: { action: 'LOBBY' }
    })
  }

  const handleChooseOther = () => {
    // 세션 유지 상태로 대기방 복귀 후 게임 옵션 선택창 유도
    setScreen('LOBBY')
    peerState.sendMessage({
      type: 'GAME_RESET',
      senderId: peerState.peerId,
      timestamp: Date.now(),
      payload: { action: 'LOBBY' }
    })
  }

  const handleExit = () => {
    peerState.handleDisconnect()
    setScreen('HOME')
  }

  const bannerReason = !network.online ? 'offline' : !network.signalingConfigured ? 'no-signaling' : null

  return (
    <div className="app-container">
      {bannerReason && screen !== 'SPLASH' && <OfflineBanner reason={bannerReason} />}
      {screen === 'SPLASH' && <Splash onFinish={() => setScreen('HOME')} />}

      {restorePrompt && screen === 'HOME' && (
        <div className="name-edit-modal-overlay" onClick={dismissRestorePrompt}>
          <div className="name-edit-card" onClick={(e) => e.stopPropagation()}>
            <span className="name-edit-title">이전 방에 재접속</span>
            <p className="section-desc" style={{ marginTop: 'var(--space-2)' }}>
              최근에 참가하던 방이 있어요. 다시 이어서 진행할까요?
            </p>
            <div className="name-edit-actions">
              <button
                type="button"
                className="pixel-btn pixel-btn--primary"
                disabled={restoreState === 'restoring'}
                onClick={() => { void acceptRestore() }}
              >
                {restoreState === 'restoring' ? '재접속 중…' : '재접속'}
              </button>
              <button
                type="button"
                className="pixel-btn pixel-btn--ghost"
                onClick={dismissRestorePrompt}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. 메인 홈 화면 */}
      {screen === 'HOME' && (
        <Home
          userName={userName}
          setUserName={updateUserName}
          onCreateRoom={handleCreateRoom}
          onJoinNearby={handleJoinNearby}
        />
      )}

      {/* 3. 대기방 화면 */}
      {screen === 'LOBBY' && (
        <Lobby
          mode={lobbyMode}
          userLocation={userLocation}
          locationPermission={locationPermission}
          requestLocationPermission={requestLocationPermission}
          connectionStatus={peerState.connectionStatus}
          players={peerState.players}
          gameSettings={peerState.gameSettings}
          nearbyRooms={peerState.nearbyRooms}
          isHost={peerState.isHost}
          hostPeerId={peerState.peerId}
          offlineOffer={peerState.offlineOffer}
          offlineAnswer={peerState.offlineAnswer}
          waitExpiresAt={peerState.waitExpiresAt}
          waitExpired={peerState.waitExpired}
          restartWait={peerState.restartWait}
          ingestGuestSignal={peerState.ingestGuestSignal}
          ingestHostSignal={peerState.ingestHostSignal}
          networkOnline={network.online}
          signalingConfigured={network.signalingConfigured}
          error={peerState.error || locationError}
          createRoom={peerState.createRoom}
          joinRoom={peerState.joinRoom}
          searchNearbyRooms={peerState.searchNearbyRooms}
          toggleReady={peerState.toggleReady}
          updateGameSettings={peerState.updateGameSettings}
          onBack={handleExit}
          onStartGame={handleStartGame}
        />
      )}

      {/* 4. 실시간 게임 플레이 화면 */}
      {screen === 'GAME_PLAY' && (
        <div className="game-play-container">
          {peerState.connectionStatus === 'RECONNECTING' && (
            <div className="reconnect-popup-overlay">
              <div className="spin-loader" />
              {navigator.onLine ? (
                <>
                  <div className="reconnect-title">상대방 연결 끊김</div>
                  <div className="reconnect-desc">
                    상대방 기기의 네트워크 이탈을 감지했어요.<br />재입장 대기 및 재연결 중…
                  </div>
                </>
              ) : (
                <>
                  <div className="reconnect-title reconnect-title--self">네트워크 연결 끊김</div>
                  <div className="reconnect-desc">
                    내 기기의 인터넷 연결이 해제되었어요.<br />네트워크 상태를 확인해 주세요.
                  </div>
                </>
              )}
              <div className="reconnect-timer">
                {peerState.reconnectCountdown !== null ? `${peerState.reconnectCountdown}s` : '5s'}
              </div>
            </div>
          )}

          {peerState.gameSettings.selectedGameId === 'tictactoe' && (
            <TicTacToe
              players={peerState.players}
              peerId={peerState.peerId}
              isHost={peerState.isHost}
              sendMessage={peerState.sendMessage}
              onLobby={handleGoLobby}
              onChooseOther={handleChooseOther}
              onExit={handleExit}
              maxRounds={peerState.gameSettings.rounds}
              isOpponentOnline={peerState.connectionStatus === 'CONNECTED'}
            />
          )}

          {peerState.gameSettings.selectedGameId === 'pingpong' && (
            <PingPong
              players={peerState.players}
              peerId={peerState.peerId}
              isHost={peerState.isHost}
              sendMessage={peerState.sendMessage}
              onLobby={handleGoLobby}
              onChooseOther={handleChooseOther}
              onExit={handleExit}
              maxPoints={peerState.gameSettings.rounds}
              isOpponentOnline={peerState.connectionStatus === 'CONNECTED'}
            />
          )}
        </div>
      )}

      {/* PWA 설치 유도 및 무중단 업데이트 팝업 */}
      <PWAPrompt />
    </div>
  )
}
