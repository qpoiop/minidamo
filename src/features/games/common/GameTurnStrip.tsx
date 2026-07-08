interface GameTurnStripProps {
  turnText: string;                   // "내 턴 · O" / "SERVE 2초"
  connectionLabel: string;            // "연결됨 · 1 : 0" / "14ms"
  variant?: 'default' | 'serve' | 'idle';
  isMyTurn?: boolean;                 // when true, strip gets loud accent + pulse
}

/**
 * Top-of-screen turn / status strip. Highlighted (accent-primary bg,
 * dark ink, pulsing chevron) when `isMyTurn` is true so the player
 * doesn't have to hunt the label for whose turn it is.
 */
export function GameTurnStrip({ turnText, connectionLabel, variant = 'default', isMyTurn = false }: GameTurnStripProps) {
  const stripClass = `game-turn-strip game-turn-strip--${variant} ${isMyTurn ? 'game-turn-strip--my-turn' : ''}`.trim()
  return (
    <div className={stripClass}>
      <span className="game-turn-strip-turn">
        {isMyTurn && <span className="game-turn-strip-chevron" aria-hidden="true">▶</span>}
        {turnText}
      </span>
      <span className="game-turn-strip-conn">
        <span className="game-turn-strip-dot" aria-hidden="true" />
        {connectionLabel}
      </span>
    </div>
  )
}
