/*
 * App-level navigation state machine.
 *
 * Owns:
 *   - which top-level screen is visible (splash / home / lobby / game)
 *   - which lobby mode we entered (create / join)
 *   - back-gesture confirmation (browser popstate) per screen
 *   - session persistence + restoration offer (for cold reloads)
 *
 * Encapsulates all the imperative screen transitions so callers only
 * describe intent: enterCreate(gameId), enterJoin(), startGame(),
 * returnToLobby(), chooseOtherGame(), exitToHome(). The hook writes
 * sessionStorage on room entry and clears it on explicit exit — no
 * caller needs to know that layer exists.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export type Screen = 'SPLASH' | 'HOME' | 'LOBBY' | 'GAME_PLAY'
export type LobbyMode = 'CREATE' | 'JOIN'

export interface PersistedSession {
  roomId: string;
  isHost: boolean;
  gameId: string;
  screen: 'LOBBY' | 'GAME_PLAY';
  savedAt: number;
}

interface NavigationOptions {
  onExit: () => void;             // called when user commits to leaving room / game
  onGameStartSend: () => void;    // send GAME_START P2P
  onReturnToLobbySend: () => void;// send GAME_RESET(LOBBY)
  onJoinRoom: (roomId: string) => Promise<void>;
}

// localStorage so session survives tab close / browser restart. User
// closing the tab within 3 minutes should get a "재접속" prompt when they
// open the app again — sessionStorage was per-tab and evaporated on
// close, which broke the "reconnected within 60s but nothing appears"
// case reported by the user.
const SESSION_KEY = 'minidamo:session-state:v1'
const SESSION_MAX_STALE_MS = 3 * 60 * 1000

function readSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as PersistedSession
    if (!p?.roomId) return null
    if (Date.now() - p.savedAt > SESSION_MAX_STALE_MS) return null
    return p
  } catch {
    return null
  }
}

function writeSession(s: PersistedSession): void {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

function clearSession(): void {
  try { localStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
}

const BACK_CONFIRM_MSG: Record<Screen, string | null> = {
  SPLASH: null,
  HOME: '앱을 종료하시겠어요?',
  LOBBY: '대기방을 나가시겠어요?',
  GAME_PLAY: '게임을 나가시겠어요? 상대방과의 연결이 끊어져요.',
}

/** Pending back-gesture confirm — App reads this to render a custom
 * modal instead of the browser's native window.confirm popup. */
export interface PendingBackConfirm {
  screen: Screen;
  message: string;
  tone: 'default' | 'danger';
  okLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function useAppNavigation(opts: NavigationOptions) {
  const [screen, setScreen] = useState<Screen>('SPLASH')
  const [lobbyMode, setLobbyMode] = useState<LobbyMode>('CREATE')
  const [restorePrompt, setRestorePrompt] = useState<PersistedSession | null>(null)
  const [restoreState, setRestoreState] = useState<'idle' | 'restoring' | 'failed'>('idle')
  const [backConfirm, setBackConfirm] = useState<PendingBackConfirm | null>(null)

  // Refs so callbacks captured by event listeners always see the latest
  // action fns — the hook is called by App on every render.
  const optsRef = useRef(opts)
  useEffect(() => { optsRef.current = opts }, [opts])

  // Boot: check for a saved room and surface the restore prompt.
  useEffect(() => {
    const saved = readSession()
    if (saved) setRestorePrompt(saved)
  }, [])

  // Back-gesture handling per screen. Push a sentinel entry so the
  // browser back-button triggers popstate instead of navigating away.
  // Instead of window.confirm (OS chrome), we surface a pending
  // BackConfirm object; App renders the custom ConfirmModal against it.
  useEffect(() => {
    if (screen === 'SPLASH') return
    const stateMark = { minidamo: true, screen }
    window.history.pushState(stateMark, '')
    const handlePop = () => {
      const msg = BACK_CONFIRM_MSG[screen]
      if (!msg) return
      const currentScreen = screen
      setBackConfirm({
        screen: currentScreen,
        message: msg,
        tone: currentScreen === 'GAME_PLAY' ? 'danger' : 'default',
        okLabel:
          currentScreen === 'HOME' ? '앱 종료'
          : currentScreen === 'GAME_PLAY' ? '게임 나가기'
          : '방 나가기',
        onConfirm: () => {
          setBackConfirm(null)
          if (currentScreen === 'HOME') {
            // 종료 시도 · silent. sentinel 재-push 안 함 → confirm 루프
            // 해소. PWA 는 close 가능하면 close, 아니면 back 이 페이지 이탈
            // 시도. 실패 시 사용자가 다시 back → 이번엔 sentinel 없어
            // 네이티브 back 이 실제로 나감.
            try { window.close() } catch { /* ignore */ }
            window.history.back()
          } else {
            optsRef.current.onExit()
            setScreen('HOME')
          }
        },
        onCancel: () => {
          setBackConfirm(null)
          window.history.pushState(stateMark, '')
        },
      })
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [screen])

  // ---- Transitions ------------------------------------------------------

  const finishSplash = useCallback(() => setScreen('HOME'), [])

  const enterCreate = useCallback((_gameId: string) => {
    setLobbyMode('CREATE')
    setScreen('LOBBY')
  }, [])

  const enterJoin = useCallback(() => {
    setLobbyMode('JOIN')
    setScreen('LOBBY')
  }, [])

  const startGame = useCallback(() => {
    optsRef.current.onGameStartSend()
    setScreen('GAME_PLAY')
  }, [])

  const returnToLobby = useCallback(() => {
    optsRef.current.onReturnToLobbySend()
    setScreen('LOBBY')
  }, [])

  const chooseOtherGame = useCallback(() => {
    optsRef.current.onReturnToLobbySend()
    setScreen('LOBBY')
  }, [])

  const exitToHome = useCallback(() => {
    optsRef.current.onExit()
    setScreen('HOME')
  }, [])

  // ---- Session persistence -----------------------------------------------

  const persistRoom = useCallback(
    (s: Omit<PersistedSession, 'savedAt' | 'screen'>) => {
      if (screen !== 'LOBBY' && screen !== 'GAME_PLAY') return
      writeSession({ ...s, screen, savedAt: Date.now() })
    },
    [screen],
  )

  useEffect(() => {
    if (screen === 'HOME' || screen === 'SPLASH') {
      if (restoreState !== 'restoring') clearSession()
    }
  }, [screen, restoreState])

  // ---- Restore actions ---------------------------------------------------

  const dismissRestore = useCallback(() => {
    clearSession()
    setRestorePrompt(null)
    setRestoreState('idle')
  }, [])

  const acceptRestore = useCallback(async () => {
    if (!restorePrompt) return
    setRestoreState('restoring')
    setLobbyMode('JOIN')
    setScreen('LOBBY')
    try {
      await optsRef.current.onJoinRoom(restorePrompt.roomId)
      setRestorePrompt(null)
      setRestoreState('idle')
    } catch {
      setRestoreState('failed')
      setScreen('HOME')
      clearSession()
    }
  }, [restorePrompt])

  return {
    screen,
    lobbyMode,
    restorePrompt,
    restoreState,
    backConfirm,
    finishSplash,
    enterCreate,
    enterJoin,
    startGame,
    returnToLobby,
    chooseOtherGame,
    exitToHome,
    persistRoom,
    dismissRestore,
    acceptRestore,
  }
}
