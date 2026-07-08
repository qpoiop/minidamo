import { ChatButton } from '../../../chat/ChatButton'
import { DiagButton } from '../../../components/common/DiagButton'

interface GameHeaderProps {
  code: string;               // arcade-style short label e.g. 'TICTACTOE'
  playerCount?: number;
  onHelp?: () => void;
  onLog?: () => void;         // optional per-game log button (spec: 채팅 아이콘 옆)
  logCount?: number;          // total entries — surfaced as badge
  onExit?: () => void;        // red exit chip on the far right (replaces rule tag)
  /** @deprecated Rule tag was purely decorative and confused players. Kept
   *  as an optional accessor so existing callers compile — value is ignored. */
  ruleTag?: string;
}

export function GameHeader({ code, playerCount = 2, onHelp, onLog, logCount, onExit }: GameHeaderProps) {
  return (
    <div className="game-shared-header">
      <div className="game-shared-header-chips">
        <span className="game-shared-code">{code}</span>
        <span className="game-shared-chip">
          <span className="game-shared-chip-icon" aria-hidden="true">◉</span>
          {playerCount}인
        </span>
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
        {onExit && (
          <button
            type="button"
            className="game-shared-exit"
            onClick={onExit}
            aria-label="게임 나가기"
            title="게임 나가기"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
              <path d="M14 5l-7 7 7 7" />
              <path d="M20 12H8" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
