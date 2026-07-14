import { useEffect, useMemo, useState } from 'react'
import { Splash } from './components/common/Splash'
import { Home } from './features/home/Home'
import { Lobby } from './features/lobby/Lobby'
import { findGame } from './games/registry'
import { PWAPrompt } from './components/common/PWAPrompt'
import { ConfirmModal } from './components/common/ConfirmModal'
import { OfflineBanner } from './components/common/OfflineBanner'
import { useLocation } from './hooks/useLocation'
import { useRoom } from './hooks/useRoom'
import type { P2PMessage } from './hooks/useRoom'
import { useNetwork } from './hooks/useNetwork'
import { useAppNavigation } from './hooks/useAppNavigation'
import { generateNick } from './services/nickPool'
import { ChatProvider } from './chat/ChatProvider'
import { ChatDrawer } from './chat/ChatDrawer'
import { DiagPanel } from './components/common/DiagPanel'
import { DiagProvider, DiagDrawer } from './components/common/DiagButton'
import { TestMode } from './features/test/TestMode'

const USER_NAME_STORAGE_KEY = 'minidamo_user_name'

function readTestParam(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.get('test') === '1'
}

function clearTestParam(): void {
  const url = new URL(window.location.href)
  url.searchParams.delete('test')
  url.searchParams.delete('game')
  window.history.replaceState({}, '', url.toString())
}

export default function App() {
  const [userName, setUserName] = useState<string>('')
  const [testMode, setTestMode] = useState<boolean>(() => readTestParam())

  const {
    location: userLocation,
    error: locationError,
    permission: locationPermission,
    requestPermission: requestLocationPermission,
  } = useLocation()

  const peerState = useRoom(userName, userLocation)
  const network = useNetwork()

  const navigationOpts = useMemo(() => ({
    onExit: peerState.leaveRoom,
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
    onRestoreHost: (roomId: string, gameId: string) => peerState.restoreHostRoom(roomId, gameId),
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
      if (msg.type === 'GAME_START') {
        // Authoritative gameId — the host's GAME_START carries the game to
        // launch. Apply it before transitioning so both sides always agree
        // even if the LOBBY_STATE that set gameSettings hasn't committed
        // yet (that was the root cause of "모순으로 방 만들었는데 틱택토가
        // 시작됨" — the receiver defaulted to the stale 'tictactoe' setting).
        const gid = msg.payload?.gameId
        if (typeof gid === 'string') peerState.updateGameSettings({ selectedGameId: gid })
        nav.applyRemoteGameStart()
      }
      else if (msg.type === 'DISCONNECT') nav.applyRemoteDisconnect()
      else if (msg.type === 'GAME_RESET' && msg.payload?.action === 'LOBBY') nav.applyRemoteReturnToLobby()
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

  // Solo test mode short-circuit — skip splash / home / lobby / P2P.
  // Still wrap in ChatProvider (with the same no-op send) so games that
  // reach for useChat() in their header don't throw.
  if (testMode) {
    // Test-mode chat: echo my messages back as if from the "봇" so the
    // spec-matched drawer is visible + usable for design review. No
    // real network — the ChatProvider handler picks up the echoed
    // p2p_message event and shows it as an incoming reply.
    const testEcho = (msg: P2PMessage) => {
      if (msg.type !== 'CHAT') return
      const echo: P2PMessage = {
        ...msg,
        senderId: 'test-bot',
        payload: {
          ...(msg.payload as object),
          text: msg.payload?.text as string,
          senderName: '봇',
        },
      }
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('p2p_message', { detail: echo }))
      }, 600)
    }
    return (
      <DiagProvider
        status="CONNECTED"
      >
      <ChatProvider
        myId="test-self"
        myName={userName || '나(테스트)'}
        sendMessage={testEcho}
        available
        canSend
      >
        <div className="app-container">
          <TestMode
            myName={userName}
            onExit={() => {
              clearTestParam()
              setTestMode(false)
              // Nav's initial screen is 'SPLASH'. When the user boots
              // straight into test mode (via ?test=1 query) they
              // never triggered `finishSplash`, so returning to the
              // normal path would re-render the intro splash. Force
              // it forward so exiting test mode always lands on HOME.
              if (nav.screen === 'SPLASH') nav.finishSplash()
            }}
          />
          <ChatDrawer />
          <DiagDrawer />
        </div>
      </ChatProvider>
      </DiagProvider>
    )
  }

  const bannerReason = !network.online
    ? 'offline'
    : !network.signalingConfigured
      ? 'no-signaling'
      : null

  // Chat becomes available the moment we have a session context — i.e.
  // the host has created a room (WAITING) or either side is mid-flow.
  // Host wants to see the icon even before a guest joins so the feature
  // is discoverable; drawer will show "peer not connected" hint.
  const chatAvailable = peerState.connectionStatus !== 'IDLE'

  return (
    <DiagProvider
      status={peerState.connectionStatus}
      iceState={peerState.iceState}
      dcState={peerState.dcState}
      diagLog={peerState.diagLog}
      candTypes={peerState.candTypes}
    >
    <ChatProvider
      myId={peerState.peerId}
      myName={userName}
      sendMessage={peerState.sendMessage}
      available={chatAvailable}
      canSend={peerState.connectionStatus === 'CONNECTED'}
    >
    <div className="app-container">
      {bannerReason && nav.screen !== 'SPLASH' && <OfflineBanner reason={bannerReason} />}

      {nav.screen === 'SPLASH' && <Splash onFinish={nav.finishSplash} />}

      {nav.restorePrompt && nav.screen === 'HOME' && (
        <div className="name-edit-modal-overlay" onClick={nav.cancelRestore}>
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
              <button type="button" className="pixel-btn pixel-btn--ghost" onClick={nav.cancelRestore}>
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
          skipAutoCreate={nav.skipLobbyAutoCreate}
          iceState={peerState.iceState}
          dcState={peerState.dcState}
          diagLog={peerState.diagLog}
          candTypes={peerState.candTypes}
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
                {peerState.reconnectCountdown !== null ? `${peerState.reconnectCountdown}s` : '—'}
              </div>
              <DiagPanel
                status={peerState.connectionStatus}
                iceState={peerState.iceState}
                dcState={peerState.dcState}
                diagLog={peerState.diagLog}
                candTypes={peerState.candTypes}
              />
              {/* DiagButton in header opens the same info in a drawer. */}
              <div className="reconnect-actions">
                {!peerState.isHost && (
                  <button
                    type="button"
                    className="pixel-btn pixel-btn--primary"
                    disabled={!navigator.onLine || !peerState.peerId}
                    onClick={() => { void peerState.joinRoom(peerState.peerId, true) }}
                  >
                    재접속 시도
                  </button>
                )}
                {/* Host has no working mid-game re-handshake path yet —
                    `restartWait()` only republishes the original SDP over
                    the SAME already-negotiated RTCPeerConnection, whose
                    signalingState is already 'stable'; applying a fresh
                    guest answer against it throws. `joinRoom` is even
                    worse here since peerState.peerId IS the host's own
                    room — it would delete it out from under itself
                    (self-sabotage, same class as the already-fixed
                    Lobby.tsx CREATE bug). Until a proper mid-game
                    session-recreation path exists (see ROADMAP), only
                    offer the guest an active retry; host can leave. */}
                <button
                  type="button"
                  className="pixel-btn pixel-btn--ghost"
                  onClick={nav.exitToHome}
                >
                  방 나가기
                </button>
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
                reconnecting={peerState.connectionStatus === 'RECONNECTING'}
                matchOption={peerState.gameSettings.rounds}
                matchOption2={peerState.gameSettings.rounds2}
              />
            )
          })()}
        </div>
      )}

      <ChatDrawer />
      <DiagDrawer />
      <PWAPrompt />
      <ConfirmModal
        open={!!nav.backConfirm}
        message={nav.backConfirm?.message ?? ''}
        tone={nav.backConfirm?.tone}
        okLabel={nav.backConfirm?.okLabel}
        onOk={() => nav.backConfirm?.onConfirm()}
        onCancel={() => nav.backConfirm?.onCancel()}
      />
    </div>
    </ChatProvider>
    </DiagProvider>
  )
}
