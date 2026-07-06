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

type ScreenType = 'SPLASH' | 'HOME' | 'LOBBY' | 'GAME_PLAY'


export default function App() {
  const [screen, setScreen] = useState<ScreenType>('SPLASH')
  const [lobbyMode, setLobbyMode] = useState<'CREATE' | 'JOIN'>('CREATE')
  const [userName, setUserName] = useState<string>('')

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
      return
    }
    const generated = generateNick()
    localStorage.setItem(USER_NAME_STORAGE_KEY, generated)
    setUserName(generated)
  }, [])

  // URL 파라미터로 자동 참가 (?room=<peerId> 또는 #room=<peerId>)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const hashMatch = window.location.hash.match(/room=([^&]+)/)
    const roomId = params.get('room') || (hashMatch ? hashMatch[1] : null)
    if (!roomId || !userName) return
    setLobbyMode('JOIN')
    setScreen('LOBBY')
    setTimeout(() => peerState.joinRoom(roomId), 200)
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

  // 대기방/게임 진행 중 뒤로가기 가로채기 — history 상태 항상 유지
  useEffect(() => {
    if (screen !== 'LOBBY' && screen !== 'GAME_PLAY') return
    const stateMark = { minidamo: true, screen }
    window.history.pushState(stateMark, '')
    const handlePop = (e: PopStateEvent) => {
      e.preventDefault?.()
      const confirmed = window.confirm(
        screen === 'GAME_PLAY'
          ? '게임을 나가시겠어요? 상대방과의 연결이 끊어져요.'
          : '대기방을 나가시겠어요?',
      )
      if (confirmed) {
        handleExit()
      } else {
        // 사용자 취소 시 history 다시 밀어 넣기
        window.history.pushState(stateMark, '')
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
          {peerState.distance !== null && peerState.distance > 25 && (
            <div className="distance-alert-bar">
              상대방과 거리가 너무 멉니다 · {Math.round(peerState.distance)}m
            </div>
          )}

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
