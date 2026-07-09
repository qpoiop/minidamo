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
  /**
   * 호스트 재시작 시 옵션 조정 라우팅. 지정되면 호스트 클릭은 즉시
   * 재시작 대신 이 콜백으로 위임 (보통 `onLobby`) — 호스트가 로비에서
   * 게임/옵션을 확인·조정 후 GAME_START 를 다시 보낸다. Guest 는 여전히
   * inbound GAME_RESET 로 리셋되므로 호스트-only 옵션 조정이 안전하게
   * 동작. Undefined 면 기존 즉시 재시작(RESTART broadcast).
   */
  hostRestartRoute?: () => void;
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
  hostRestartRoute,
}: MatchRestartArgs<T>) {
  const handleRestartMatch = useCallback(() => {
    // 호스트가 옵션 조정 라우팅을 원하면 즉시 재시작을 건너뜀. 로비에서
    // 옵션 확인 후 GAME_START 로 재개 → 사용자 요구: "재시작할 때 옵션도
    // 선택할 수 있게".
    if (isHost && hostRestartRoute) {
      hostRestartRoute()
      return
    }
    const ret = applyMatchReset()
    sendMessage({
      type: 'GAME_RESET',
      senderId: peerId,
      timestamp: Date.now(),
      payload: { action: 'RESTART' },
    })
    if (isHost && onHostPostReset) onHostPostReset(ret)
  }, [applyMatchReset, sendMessage, peerId, isHost, onHostPostReset, hostRestartRoute])

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
