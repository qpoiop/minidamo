interface GameHeaderProps {
  code: string;               // arcade-style short label e.g. 'TICTACTOE'
  playerCount?: number;
  ruleTag?: string;           // "3판 2선승" / "선제 5점"
  onHelp?: () => void;
}

export function GameHeader({ code, playerCount = 2, ruleTag, onHelp }: GameHeaderProps) {
  return (
    <div className="game-shared-header">
      <div className="game-shared-header-chips">
        <span className="game-shared-code">{code}</span>
        <span className="game-shared-chip">
          <span className="game-shared-chip-icon" aria-hidden="true">◉</span>
          {playerCount}인
        </span>
        {ruleTag && <span className="game-shared-chip game-shared-chip--rule">{ruleTag}</span>}
      </div>
      {onHelp && (
        <button
          type="button"
          className="game-shared-help"
          onClick={onHelp}
          aria-label="게임 가이드 열기"
        >
          ?
        </button>
      )}
    </div>
  )
}
