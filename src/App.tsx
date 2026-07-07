import { useEffect, useMemo, useState } from 'react'
import { Splash } from './components/common/Splash'
import { Home } from './features/home/Home'
import { Lobby } from './features/lobby/Lobby'
import { findGame } from './games/registry'
import { PWAPrompt } from './components/common/PWAPrompt'
import { OfflineBanner } from './components/common/OfflineBanner'
import { useLocation } from './hooks/useLocation'
import { useRoom } from './hooks/useRoom'
import type { P2PMessage } from './hooks/useRoom'
import { useNetwork } from './hooks/useNetwork'
import { useAppNavigation } from './hooks/useAppNavigation'
import { generateNick } from './services/nickPool'
import { ChatProvider } from './chat/ChatProvider'
import { ChatDrawer } from './chat/ChatDrawer'

const USER_NAME_STORAGE_KEY = 'minidamo_user_name'

export default function App() {
  const [userName, setUserName] = useState<string>('')

  const {
    location: userLocation,
    error: locationError,
    permission: locationPermission,
    requestPermission: requestLocationPermission,
  } = useLocation()

  const peerState = useRoom(userName, userLocation)
  const network = useNetwork()

  const navigationOpts = useMemo(() => ({
    onExit: peerState.handleDisconnect,
    onGameStartSend: () =>
      peerState.sendMessage({
        type: 'GAME_START',
        senderId: peerState.peerId,
        timestamp: Date.now(),
        payload: { gameId: peerState.gameSettings.selectedGameId },
      }),
    onReturnToLobbySend: () =>
      peerState.sendMessage({
        type: 'GAME_RESET',
        senderId: peerState.peerId,
        timestamp: Date.now(),
        payload: { action: 'LOBBY' },
      }),
    onJoinRoom: (roomId: string) => peerState.joinRoom(roomId, true),
  }), [peerState])

  const nav = useAppNavigation(navigationOpts)

  // Nickname bootstrap
  useEffect(() => {
    const saved = localStorage.getItem(USER_NAME_STORAGE_KEY)
    if (saved) {
      setUserName(saved)
    } else {
      const generated = generateNick()
      localStorage.setItem(USER_NAME_STORAGE_KEY, generated)
      setUserName(generated)
    }
  }, [])

  // URL param auto-join (?room=<id>) — routes through the navigation hook.
  useEffect(() => {
    if (!userName) return
    const params = new URLSearchParams(window.location.search)
    const hashMatch = window.location.hash.match(/room=([^&]+)/)
    const roomId = params.get('room') || (hashMatch ? hashMatch[1] : null)
    if (!roomId) return
    nav.enterJoin()
    setTimeout(() => peerState.joinRoom(roomId, true), 200)
    const url = new URL(window.location.href)
    url.searchParams.delete('room')
    url.hash = ''
    window.history.replaceState({}, '', url.toString())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userName])

  // Persist current room across screens for cold-reload recovery.
  useEffect(() => {
    if (!peerState.peerId) return
    nav.persistRoom({
      roomId: peerState.peerId,
      isHost: peerState.isHost,
      gameId: peerState.gameSettings.selectedGameId,
    })
  }, [nav, peerState.peerId, peerState.isHost, peerState.gameSettings.selectedGameId])

  // Global P2P → screen mapping.
  useEffect(() => {
    const onMsg = (e: Event) => {
      const msg = (e as CustomEvent<P2PMessage>).detail
      if (msg.type === 'GAME_START') nav.startGame()
      else if (msg.type === 'DISCONNECT') nav.exitToHome()
      else if (msg.type === 'GAME_RESET' && msg.payload?.action === 'LOBBY') nav.returnToLobby()
    }
    window.addEventListener('p2p_message', onMsg)
    return () => window.removeEventListener('p2p_message', onMsg)
  }, [nav])

  const updateUserName = (name: string) => {
    setUserName(name)
    localStorage.setItem(USER_NAME_STORAGE_KEY, name)
  }

  const handleCreateRoom = (gameId: string) => {
    peerState.updateGameSettings({ selectedGameId: gameId })
    nav.enterCreate(gameId)
  }

  const bannerReason = !network.online
    ? 'offline'
    : !network.signalingConfigured
      ? 'no-signaling'
      : null

  const chatAvailable = peerState.connectionStatus === 'CONNECTED' || peerState.connectionStatus === 'RECONNECTING'

  return (
    <ChatProvider
      myId={peerState.peerId}
      myName={userName}
      sendMessage={peerState.sendMessage}
      available={chatAvailable}
    >
    <div className="app-container">
      {bannerReason && nav.screen !== 'SPLASH' && <OfflineBanner reason={bannerReason} />}

      {nav.screen === 'SPLASH' && <Splash onFinish={nav.finishSplash} />}

      {nav.restorePrompt && nav.screen === 'HOME' && (
        <div className="name-edit-modal-overlay" onClick={nav.dismissRestore}>
          <div className="name-edit-card" onClick={(e) => e.stopPropagation()}>
            <span className="name-edit-title">이전 방에 재접속</span>
            <p className="section-desc" style={{ marginTop: 'var(--space-2)' }}>
              최근에 참가하던 방이 있어요. 다시 이어서 진행할까요?
            </p>
            <div className="name-edit-actions">
              <button
                type="button"
                className="pixel-btn pixel-btn--primary"
                disabled={nav.restoreState === 'restoring'}
                onClick={() => { void nav.acceptRestore() }}
              >
                {nav.restoreState === 'restoring' ? '재접속 중…' : '재접속'}
              </button>
              <button type="button" className="pixel-btn pixel-btn--ghost" onClick={nav.dismissRestore}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {nav.screen === 'HOME' && (
        <Home
          userName={userName}
          setUserName={updateUserName}
          onCreateRoom={handleCreateRoom}
          onJoinNearby={nav.enterJoin}
        />
      )}

      {nav.screen === 'LOBBY' && (
        <Lobby
          mode={nav.lobbyMode}
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
          onBack={nav.exitToHome}
          onStartGame={nav.startGame}
        />
      )}

      {nav.screen === 'GAME_PLAY' && (
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

          {(() => {
            const def = findGame(peerState.gameSettings.selectedGameId)
            if (!def) return null
            const GameComp = def.Component
            return (
              <GameComp
                players={peerState.players}
                peerId={peerState.peerId}
                isHost={peerState.isHost}
                sendMessage={peerState.sendMessage}
                onLobby={nav.returnToLobby}
                onChooseOther={nav.chooseOtherGame}
                onExit={nav.exitToHome}
                isOpponentOnline={peerState.connectionStatus === 'CONNECTED'}
                matchOption={peerState.gameSettings.rounds}
              />
            )
          })()}
        </div>
      )}

      <ChatDrawer />
      <PWAPrompt />
    </div>
    </ChatProvider>
  )
}
