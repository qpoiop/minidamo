interface GameOverModalProps {
  title: string;
  winnerText: string;
  onRestart: () => void;
  onLobby: () => void;
  onChooseOther: () => void;
  onExit: () => void;
  restartDisabled?: boolean;
  restartHint?: string;
}

export function GameOverModal({
  title,
  winnerText,
  onRestart,
  onLobby,
  onChooseOther,
  onExit,
  restartDisabled = false,
  restartHint,
}: GameOverModalProps) {
  return (
    <div className="gameover-overlay">
      <div className="gameover-card">
        <div className="gameover-badge">🏆</div>
        <div className="gameover-title">{title}</div>
        <div className="gameover-winner">{winnerText}</div>

        <div className="modal-action-list">
          <button
            type="button"
            className="pixel-btn pixel-btn--primary"
            onClick={onRestart}
            disabled={restartDisabled}
            title={restartHint}
          >
            다시하기
          </button>
          <button type="button" className="pixel-btn pixel-btn--secondary" onClick={onLobby}>
            대기방으로
          </button>
          <button type="button" className="pixel-btn pixel-btn--secondary" onClick={onChooseOther}>
            다른 게임 선택
          </button>
          <button type="button" className="pixel-btn pixel-btn--ghost" onClick={onExit}>
            나가기
          </button>
        </div>

        {restartDisabled && restartHint && <div className="gameover-hint">{restartHint}</div>}
      </div>
    </div>
  )
}
