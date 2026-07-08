import { ChatButton } from '../../../chat/ChatButton'
import { DiagButton } from '../../../components/common/DiagButton'

interface GameHeaderProps {
  code: string;               // arcade-style short label e.g. 'TICTACTOE'
  playerCount?: number;
  ruleTag?: string;           // "3판 2선승" / "선제 5점"
  onHelp?: () => void;
  onLog?: () => void;         // optional per-game log button (spec: 채팅 아이콘 옆)
  logCount?: number;          // total entries — surfaced as badge
}

export function GameHeader({ code, playerCount = 2, ruleTag, onHelp, onLog, logCount }: GameHeaderProps) {
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
      <div className="game-shared-header-actions">
        <ChatButton />
        <DiagButton />
        {onLog && (
          <button
            type="button"
            className="game-shared-log"
            onClick={onLog}
            aria-label="규칙 히스토리"
          >
            {/* Scroll glyph so this reads as "규칙 히스토리" — the diag
             * button next door already uses the clock glyph, and users
             * were confusing the two. */}
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
              <path d="M5 4h11l3 3v13H5z" />
              <path d="M16 4v3h3" />
              <path d="M8 11h8M8 14h8M8 17h5" />
            </svg>
            {typeof logCount === 'number' && logCount > 0 && (
              <span className="game-shared-log-badge">{logCount > 9 ? '9+' : logCount}</span>
            )}
          </button>
        )}
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
    </div>
  )
}
