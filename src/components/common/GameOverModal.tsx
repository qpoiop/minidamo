import { useEffect } from 'react'
import { useEffectsFire } from '../../effects/EffectsProvider'
import './GameOverModal.css'
import { PALETTE } from '../../styles/palette'

interface ScoreEntry {
  label: string;
  value: string | number;
  highlight?: boolean;
}

interface GameOverModalProps {
  title: string;
  winnerText: string;
  scoreSummary?: ScoreEntry[];
  /** Optional narrative line explaining WHY the match ended — e.g.
   * "정답 선언 실패로 즉시 패배". Rendered under the score summary in
   * a low-key panel so users understand the outcome, not just the winner. */
  note?: string;
  /** Outcome the local player experienced. Drives the badge glyph +
   * card palette (lime for win/draw, bomb-red for defeat). */
  outcome?: 'win' | 'lose' | 'draw';
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
  note,
  outcome = 'win',
  onRestart,
  onLobby,
  onChooseOther,
  onExit,
  restartDisabled = false,
  restartHint,
}: GameOverModalProps) {
  const fire = useEffectsFire()

  useEffect(() => {
    // Effects vary by outcome. Wins get the full celebration; draws
    // get a light spark; defeat gets a sombre red-tint spark only —
    // no confetti / petal shower, that would feel mocking.
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 3
    if (outcome === 'win') {
      fire('confetti', { x: cx, y: cy, count: 120 })
      fire('spark-burst', { x: cx, y: cy - 40, count: 30, color: PALETTE.fgAccent })
      fire('petal-fall', { count: 24 })
      const t = setTimeout(() => {
        fire('confetti', { x: cx, y: cy, count: 60 })
      }, 900)
      return () => clearTimeout(t)
    }
    if (outcome === 'lose') {
      fire('spark-burst', { x: cx, y: cy - 40, count: 18, color: '#c2331f' })
      return
    }
    // draw
    fire('spark-burst', { x: cx, y: cy - 40, count: 20, color: '#8bac0f' })
  }, [fire, outcome])

  const badge = outcome === 'win' ? '🏆' : outcome === 'lose' ? '💀' : '🤝'

  return (
    <div className={`gameover-overlay gameover-overlay--${outcome}`}>
      <div className={`gameover-card gameover-card--${outcome}`}>
        <div className="gameover-badge" aria-hidden="true">{badge}</div>
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

        {note && <div className="gameover-note">{note}</div>}

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
