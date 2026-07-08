import { useEffect, useRef, useState } from 'react'
import './TurnTransitionToast.css'

interface TurnTransitionToastProps {
  isMyTurn: boolean;
  opponentName: string;
  /** Blank the toast on match end so the "다음 턴 · 대기" message doesn't
   * flash while the game-over layer is animating in. */
  suppress?: boolean;
  /** Optional per-role copy overrides. Defaults are the shared arcade
   * phrasing "내 턴" / "{opp} 턴". */
  mineText?: string;
  oppText?: (opp: string) => string;
}

/**
 * Ephemeral center-top toast shown whenever the caller's `isMyTurn`
 * bool flips. Same slide-in pattern the Mosun pass toast uses so it
 * reads as one visual family across all turn-based games.
 */
export function TurnTransitionToast({
  isMyTurn,
  opponentName,
  suppress,
  mineText,
  oppText,
}: TurnTransitionToastProps) {
  const [toast, setToast] = useState<{ mine: boolean; ts: number } | null>(null)
  const prevRef = useRef(isMyTurn)

  useEffect(() => {
    if (prevRef.current === isMyTurn) return
    prevRef.current = isMyTurn
    if (suppress) return
    setToast({ mine: isMyTurn, ts: Date.now() })
    const t = setTimeout(() => setToast(null), 1500)
    return () => clearTimeout(t)
  }, [isMyTurn, suppress])

  // Board halo — data attribute on the closest `.game-screen` ancestor
  // so the caller doesn't have to plumb a prop through every game.
  // Applied whenever the caller's `isMyTurn` is true and not suppressed
  // (game-over etc.).
  useEffect(() => {
    const root = document.querySelector('.game-screen')
    if (!root) return
    root.setAttribute('data-my-turn', isMyTurn && !suppress ? '1' : '0')
    return () => { root.setAttribute('data-my-turn', '0') }
  }, [isMyTurn, suppress])

  if (!toast) return null
  const text = toast.mine
    ? (mineText ?? '내 턴')
    : (oppText ? oppText(opponentName) : `${opponentName} 턴`)
  return (
    <div
      className={`turn-toast ${toast.mine ? 'turn-toast--mine' : 'turn-toast--opp'}`}
      key={toast.ts}
      role="status"
    >
      {text}
    </div>
  )
}
