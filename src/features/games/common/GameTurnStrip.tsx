interface GameTurnStripProps {
  turnText: string;                   // "내 턴 · O" / "SERVE 2초"
  connectionLabel: string;            // "연결됨 · 1 : 0" / "14ms"
  variant?: 'default' | 'serve' | 'idle';
}

export function GameTurnStrip({ turnText, connectionLabel, variant = 'default' }: GameTurnStripProps) {
  return (
    <div className={`game-turn-strip game-turn-strip--${variant}`}>
      <span className="game-turn-strip-turn">{turnText}</span>
      <span className="game-turn-strip-conn">
        <span className="game-turn-strip-dot" aria-hidden="true" />
        {connectionLabel}
      </span>
    </div>
  )
}
