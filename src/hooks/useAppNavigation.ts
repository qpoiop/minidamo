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
import { CONFIRM_EXIT_GAME, CONFIRM_EXIT_LOBBY } from '../features/games/common/confirmCopy'

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

// Same copy the on-screen back/exit buttons use (Lobby, GameHeader) —
// confirmCopy.ts is the single source so a hardware-back confirm never
// drifts from its on-screen equivalent.
const BACK_CONFIRM: Partial<Record<Screen, { message: string; okLabel: string; tone: 'default' | 'danger' }>> = {
  // SPLASH, HOME: 사용자 지적 "종료가 안 되잖아 · 컨펌을 없애줘".
  // 브라우저/PWA 특성상 스크립트가 실제 종료를 강제할 수 없어 confirm 을
  // 유지하는 의미가 없음. 네이티브 back 이 알아서 처리 (PWA 는 OS,
  // 탭은 이전 URL/탭 닫기).
  LOBBY: CONFIRM_EXIT_LOBBY,
  GAME_PLAY: CONFIRM_EXIT_GAME,
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

  // Tracks whether a sentinel history entry (see below) is currently
  // live. LOBBY, GAME_PLAY and HOME-with-restore-prompt all sit at the
  // same "depth 1" — moving between them replaces the sentinel instead
  // of pushing another, so at most one ever exists. Without this, every
  // lateral transition (LOBBY <-> GAME_PLAY, HOME-restore -> LOBBY)
  // pushed a fresh entry that no explicit exit path ever popped, so a
  // long session buried the real "leave the app" entry under a growing
  // stack of dead ones — each needing its own silent back-press before
  // back visibly did anything.
  const sentinelPushedRef = useRef(false)
  // Set right before a programmatic history.go(-1) (see consumeSentinel)
  // so the synthetic popstate it fires isn't mistaken for a real
  // back-gesture by the screen-specific listeners below.
  const ignorePopRef = useRef(false)

  useEffect(() => {
    const guard = (e: PopStateEvent) => {
      if (!ignorePopRef.current) return
      ignorePopRef.current = false
      e.stopImmediatePropagation()
    }
    // Registered once on mount so it always runs before the
    // screen-specific listeners re-registered below (same-target
    // listeners fire in registration order).
    window.addEventListener('popstate', guard)
    return () => window.removeEventListener('popstate', guard)
  }, [])

  const pushOrReplaceSentinel = useCallback((stateMark: { minidamo: true; screen: Screen }) => {
    if (sentinelPushedRef.current) {
      window.history.replaceState(stateMark, '')
    } else {
      window.history.pushState(stateMark, '')
      sentinelPushedRef.current = true
    }
  }, [])

  // Pop the live sentinel for an explicit (non-back-gesture) exit down
  // to depth 0 (HOME/SPLASH) — e.g. the exit button, not the hardware
  // back gesture, which already removes it as part of firing popstate.
  //
  // Callers must only invoke this when the transition is a genuine
  // depth-1 -> depth-0 drop. If a restore-prompt join is still in
  // flight (restorePrompt set, screen already optimistically LOBBY),
  // returning to HOME is actually LATERAL — the restore-prompt effect
  // below is about to replace this same sentinel with its own HOME
  // marker regardless — so callers reachable during that window
  // (exitToHome, applyRemoteDisconnect) guard on `!restorePrompt`
  // before calling this. cancelRestore is the one caller that's safe
  // unconditionally: it pairs this with dismissRestore() clearing
  // restorePrompt in the same tick, which flips the restore-prompt
  // effect's condition to its early-return branch (no re-push), so
  // there's nothing for this call's async history.go(-1) to race.
  const consumeSentinel = useCallback(() => {
    if (!sentinelPushedRef.current) return
    sentinelPushedRef.current = false
    ignorePopRef.current = true
    window.history.go(-1)
  }, [])

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
    // SPLASH, HOME: sentinel + confirm 등록 안 함. HOME back 은 브라우저
    // 네이티브 back 그대로 통과.
    if (screen === 'SPLASH' || screen === 'HOME') return
    const stateMark = { minidamo: true as const, screen }
    pushOrReplaceSentinel(stateMark)
    const handlePop = () => {
      const cfg = BACK_CONFIRM[screen]
      if (!cfg) return
      const currentScreen = screen
      setBackConfirm({
        screen: currentScreen,
        message: cfg.message,
        tone: cfg.tone,
        okLabel: cfg.okLabel,
        onConfirm: () => {
          setBackConfirm(null)
          sentinelPushedRef.current = false
          optsRef.current.onExit()
          setScreen('HOME')
        },
        onCancel: () => {
          setBackConfirm(null)
          sentinelPushedRef.current = false
          pushOrReplaceSentinel(stateMark)
        },
      })
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [screen, pushOrReplaceSentinel])

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

  // startGame/returnToLobby broadcast + navigate — for the LOCAL click
  // only. Applying an INBOUND GAME_START/GAME_RESET(LOBBY) must use the
  // apply* variants below (navigate only): reusing these send-and-
  // navigate versions on receipt would have each side's message handler
  // re-broadcast right back to the other, bouncing the same message
  // forever for as long as the data channel stays open.
  const startGame = useCallback(() => {
    optsRef.current.onGameStartSend()
    setScreen('GAME_PLAY')
  }, [])

  const applyRemoteGameStart = useCallback(() => {
    setScreen('GAME_PLAY')
  }, [])

  const returnToLobby = useCallback(() => {
    optsRef.current.onReturnToLobbySend()
    setScreen('LOBBY')
  }, [])

  const applyRemoteReturnToLobby = useCallback(() => {
    setScreen('LOBBY')
  }, [])

  // '다른 게임' historically routes to the same LOBBY screen as '대기방'
  // (GameOverModal already collapsed the two buttons into one) — kept
  // as a distinct export only so callers still passing onChooseOther
  // compile against the same function.
  const chooseOtherGame = returnToLobby

  // Reachable while a restore-prompt join is still in flight (screen
  // already optimistically LOBBY, restorePrompt still set — e.g. the
  // Lobby back/exit button during the CONNECTING state acceptRestore's
  // await produces) — see consumeSentinel's doc comment for why that
  // case must skip the consume.
  const exitToHome = useCallback(() => {
    if (!restorePrompt) consumeSentinel()
    optsRef.current.onExit()
    setScreen('HOME')
  }, [restorePrompt])

  // Navigate-only counterpart to exitToHome, for an INBOUND DISCONNECT.
  // exitToHome calls onExit (peerState.leaveRoom), which sends its own
  // DISCONNECT — reusing it here would bounce a DISCONNECT back at a
  // peer who just told us they're leaving, the same ping-pong class of
  // bug fixed for GAME_START/GAME_RESET(LOBBY) (see applyRemote* above).
  // Same in-flight-restore caveat as exitToHome above.
  const applyRemoteDisconnect = useCallback(() => {
    if (!restorePrompt) consumeSentinel()
    setScreen('HOME')
  }, [restorePrompt])

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

  // Explicit (non-back-gesture) dismissal — the "취소" button or tapping
  // the overlay backdrop — must also pop the sentinel the effect below
  // pushed. A real back-gesture already removes it as part of firing
  // popstate (see handlePop below), so dismissRestore itself stays
  // history-agnostic and is reused for both paths.
  const cancelRestore = useCallback(() => {
    consumeSentinel()
    dismissRestore()
  }, [dismissRestore])

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
      // restorePrompt stays set (offers a retry) and screen returns to
      // HOME — a lateral depth-1 -> depth-1 move, same as the accept
      // path above, so no consumeSentinel here: the restore-prompt
      // effect below replaces the sentinel in place. Calling
      // consumeSentinel would race its synchronous re-push against this
      // catch's own async history.go(-1).
      setRestoreState('failed')
      setScreen('HOME')
      clearSession()
    }
  }, [restorePrompt])

  // HOME itself skips popstate handling (native back passes through, see
  // the main back-gesture effect above) — but while the restore prompt is
  // open, back must close the prompt instead of passing through and
  // leaving the app. Same outcome as clicking "취소".
  useEffect(() => {
    if (screen !== 'HOME' || !restorePrompt) return
    pushOrReplaceSentinel({ minidamo: true, screen: 'HOME' })
    const handlePop = () => {
      sentinelPushedRef.current = false
      dismissRestore()
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [screen, restorePrompt, dismissRestore, pushOrReplaceSentinel])

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
    applyRemoteGameStart,
    returnToLobby,
    applyRemoteReturnToLobby,
    chooseOtherGame,
    exitToHome,
    applyRemoteDisconnect,
    persistRoom,
    cancelRestore,
    acceptRestore,
  }
}
