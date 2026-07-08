import { useState } from 'react'
import { ChatButton } from '../../../chat/ChatButton'
import { DiagButton } from '../../../components/common/DiagButton'
import { ConfirmModal } from '../../../components/common/ConfirmModal'

interface GameHeaderProps {
  code: string;               // arcade-style short label e.g. 'TICTACTOE'
  playerCount?: number;       // reserved for future >2-player games; unused in header
  onHelp?: () => void;
  onLog?: () => void;         // optional per-game log button (spec: 채팅 아이콘 옆)
  logCount?: number;          // total entries — surfaced as badge
  onExit?: () => void;        // red exit chip — sits where the 참가자 badge used to
  onRestart?: () => void;     // host-only "restart match" chip — always available so the
                              //   host can recover from a stuck state (spec: 방장 언제나 리셋)
  isHost?: boolean;           // gates the restart chip visibility
  /** @deprecated Rule tag was purely decorative and confused players. */
  ruleTag?: string;
}

/**
 * Shared arcade header. The exit + restart chips go through the same
 * ConfirmModal (used by useAppNavigation for back gestures) so the two
 * flows look identical to the user.
 */
export function GameHeader({
  code, onHelp, onLog, logCount, onExit, onRestart, isHost,
}: GameHeaderProps) {
  const [confirmKind, setConfirmKind] = useState<'exit' | 'restart' | null>(null)
  const closeConfirm = () => setConfirmKind(null)

  return (
    <div className="game-shared-header">
      <div className="game-shared-header-chips">
        <span className="game-shared-code">{code}</span>
        {isHost && onRestart && (
          <button
            type="button"
            className="game-shared-restart"
            onClick={() => setConfirmKind('restart')}
            aria-label="매치 다시 시작"
            title="매치 다시 시작"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
              <path d="M4 12a8 8 0 0 1 14-5" />
              <path d="M18 3v6h-6" />
              <path d="M20 12a8 8 0 0 1-14 5" />
              <path d="M6 21v-6h6" />
            </svg>
            다시
          </button>
        )}
        {onExit && (
          <button
            type="button"
            className="game-shared-exit"
            onClick={() => setConfirmKind('exit')}
            aria-label="게임 나가기"
            title="게임 나가기"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
              <path d="M14 5l-7 7 7 7" />
              <path d="M20 12H8" />
            </svg>
            나가기
          </button>
        )}
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
      </div>

      <ConfirmModal
        open={confirmKind === 'exit'}
        message={'게임을 나가시겠어요?\n상대방과의 연결이 끊어져요.'}
        okLabel="게임 나가기"
        tone="danger"
        onOk={() => { closeConfirm(); onExit?.() }}
        onCancel={closeConfirm}
      />
      <ConfirmModal
        open={confirmKind === 'restart'}
        message={'매치를 처음부터 다시 시작할까요?\n현재 진행 상황은 전부 사라져요.'}
        okLabel="다시 시작"
        onOk={() => { closeConfirm(); onRestart?.() }}
        onCancel={closeConfirm}
      />
    </div>
  )
}
