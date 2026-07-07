import { useEffect } from 'react'
import { useEffectsFire } from '../../effects/EffectsProvider'

interface ScoreEntry {
  label: string;
  value: string | number;
  highlight?: boolean;
}

interface GameOverModalProps {
  title: string;
  winnerText: string;
  scoreSummary?: ScoreEntry[];
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
  scoreSummary,
  onRestart,
  onLobby,
  onChooseOther,
  onExit,
  restartDisabled = false,
  restartHint,
}: GameOverModalProps) {
  const fire = useEffectsFire()

  useEffect(() => {
    // Kick off the celebration once the modal mounts. Confetti above +
    // sparks around the trophy badge. Petals drift down passively.
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 3
    fire('confetti', { x: cx, y: cy, count: 120 })
    fire('spark-burst', { x: cx, y: cy - 40, count: 30, color: '#c7e06a' })
    fire('petal-fall', { count: 24 })
    const t = setTimeout(() => {
      fire('confetti', { x: cx, y: cy, count: 60 })
    }, 900)
    return () => clearTimeout(t)
  }, [fire])

  return (
    <div className="gameover-overlay">
      <div className="gameover-card">
        <div className="gameover-badge">🏆</div>
        <div className="gameover-title">{title}</div>
        <div className="gameover-winner">{winnerText}</div>

        {scoreSummary && scoreSummary.length > 0 && (
          <div className="gameover-score">
            {scoreSummary.map((entry) => (
              <div
                key={entry.label}
                className={`gameover-score-row ${entry.highlight ? 'gameover-score-row--highlight' : ''}`}
              >
                <span className="gameover-score-label">{entry.label}</span>
                <span className="gameover-score-value">{entry.value}</span>
              </div>
            ))}
          </div>
        )}

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
