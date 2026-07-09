import { useCallback, useEffect } from 'react'
import type { P2PMessage } from '../../../hooks/useRoom'

interface MatchRestartArgs<T> {
  /** Local reset callback. Return value is forwarded to `onHostPostReset`
   *  when it exists — most games return the fresh seed so the host-only
   *  post-reset step can rebroadcast it. Games without a return value
   *  can use `void`. */
  applyMatchReset: () => T;
  sendMessage: (msg: P2PMessage) => void;
  peerId: string;
  /** Only the host runs `onHostPostReset` — usually to re-broadcast the
   *  fresh seed so the guest can rebuild the board. Optional; games
   *  whose reset is purely local (e.g. TicTacToe) omit this. */
  isHost?: boolean;
  /** Called ONLY on the host, ONLY when handleRestartMatch fires (not
   *  on inbound RESTART receipt — the guest gets a fresh seed via
   *  whatever custom broadcast the caller wires here). Receives the
   *  return value of `applyMatchReset` verbatim. */
  onHostPostReset?: (resetReturn: T) => void;
}

/**
 * Shared restart plumbing used by every game that supports "같은 게임
 * 다시" from the game-over screen.
 *
 * Pattern that lived duplicated in nine game components:
 *   1. Host clicks 다시 → local `applyMatchReset()` runs.
 *   2. Same call broadcasts `GAME_RESET { action: 'RESTART' }` so the
 *      peer resets in lockstep.
 *   3. Host optionally re-broadcasts the fresh seed / initial state
 *      (memory board hello, bombhunt seed, etc.).
 *   4. Both sides listen for the inbound restart message and call
 *      `applyMatchReset()` when it arrives.
 *
 * Returns `handleRestartMatch` to bind on the button. The inbound
 * listener is attached as a side-effect of calling this hook so
 * every consumer gets step 4 for free.
 */
export function useMatchRestart<T = void>({
  applyMatchReset,
  sendMessage,
  peerId,
  isHost = false,
  onHostPostReset,
}: MatchRestartArgs<T>) {
  const handleRestartMatch = useCallback(() => {
    const ret = applyMatchReset()
    sendMessage({
      type: 'GAME_RESET',
      senderId: peerId,
      timestamp: Date.now(),
      payload: { action: 'RESTART' },
    })
    if (isHost && onHostPostReset) onHostPostReset(ret)
  }, [applyMatchReset, sendMessage, peerId, isHost, onHostPostReset])

  useEffect(() => {
    const onMsg = (ev: Event) => {
      const detail = (ev as CustomEvent<P2PMessage>).detail
      if (!detail) return
      if (detail.type === 'GAME_RESET' && detail.payload?.action === 'RESTART') {
        applyMatchReset()
      }
    }
    window.addEventListener('p2p_message', onMsg)
    return () => window.removeEventListener('p2p_message', onMsg)
  }, [applyMatchReset])

  return { handleRestartMatch }
}
