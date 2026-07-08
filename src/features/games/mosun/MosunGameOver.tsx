import { useEffect } from 'react'
import { useEffectsFire } from '../../../effects/EffectsProvider'
import './mosun.css'

interface MosunGameOverProps {
  outcome: 'win-guess' | 'win-opp-bomb' | 'lose-bomb' | 'lose-guess';
  winnerName: string;
  loserName?: string;
  bombIndex: number;             // 0..8
  onRestart: () => void;
  onLobby: () => void;
  onChooseOther: () => void;
  onExit: () => void;
  restartDisabled?: boolean;
  restartHint?: string;
}

/**
 * 모순 전용 결과 화면 (spec §카드 오픈 · 폭탄, §결과 (승/패, 폭탄 공개)).
 *
 * Two visual variants:
 *   - Loss because I revealed the bomb (`lose-bomb`) — red overlay,
 *     "BOOM" pixel eyebrow, big bomb card, "폭탄을 열었어요…" copy.
 *   - Win / other loss — green overlay, trophy badge, "YOU WIN!" or
 *     "YOU LOSE" eyebrow, mini 3×3 board revealing bomb position.
 */
export function MosunGameOver({
  outcome,
  winnerName,
  loserName,
  bombIndex,
  onRestart,
  onLobby,
  onChooseOther,
  onExit,
  restartDisabled = false,
  restartHint,
}: MosunGameOverProps) {
  const fire = useEffectsFire()
  const isBoomLoss = outcome === 'lose-bomb'

  useEffect(() => {
    if (isBoomLoss) return
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 3
    fire('confetti', { x: cx, y: cy, count: 90 })
    fire('spark-burst', { x: cx, y: cy - 20, count: 24, color: '#c7e06a' })
  }, [isBoomLoss, fire])

  if (isBoomLoss) {
    return (
      <div className="mosun-gameover-overlay mosun-gameover-overlay--boom">
        <div className="mosun-gameover-conic mosun-gameover-conic--boom" aria-hidden="true" />
        <div className="mosun-gameover-body">
          <div className="mosun-gameover-eyebrow mosun-gameover-eyebrow--boom">☠ BOOM ☠</div>
          <div className="mosun-gameover-card mosun-gameover-card--bomb">
            <svg viewBox="0 0 24 24" width="52" height="52" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="16" r="6" />
              <path d="M14 8l2-2 3 1-1 3-2 2z" />
              <path d="M16 4l1-2 2 1-1 2z" />
            </svg>
            <span className="mosun-gameover-card-label">BOMB</span>
          </div>
          <div className="mosun-gameover-headline mosun-gameover-headline--boom">폭탄을 열었어요…</div>
          <div className="mosun-gameover-status mosun-gameover-status--boom">YOU LOSE</div>
          <div className="mosun-gameover-note">
            {bombIndex + 1}번 카드가 폭탄이었어요.<br />
            규칙을 더 캐서 좁혔어야 했어요.
          </div>
          <MosunGameOverActions
            restartDisabled={restartDisabled}
            restartHint={restartHint}
            onRestart={onRestart}
            onLobby={onLobby}
            onChooseOther={onChooseOther}
            onExit={onExit}
            variant="boom"
            primaryLabel="결과 보기"
          />
        </div>
      </div>
    )
  }

  // Win / other loss — spec §결과 (승/패, 폭탄 공개).
  const win = outcome.startsWith('win')
  return (
    <div className="mosun-gameover-overlay">
      <div className="mosun-gameover-body">
        <div className="mosun-gameover-trophy" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
            <path d="M8 4h8v4a4 4 0 0 1-8 0z" />
            <path d="M6 4h2M16 4h2" />
            <path d="M6 4a2 2 0 0 0 2 2M18 4a2 2 0 0 1-2 2" />
            <path d="M9 12v4h6v-4" />
            <rect x="7" y="16" width="10" height="3" />
          </svg>
        </div>
        <div className="mosun-gameover-status">{win ? 'YOU WIN!' : 'YOU LOSE'}</div>
        <div className="mosun-gameover-headline">{winnerName} 승리</div>
        <div className="mosun-gameover-note">폭탄 위치 공개</div>
        <div className="mosun-gameover-mini-board" aria-label="폭탄 위치 미니 보드">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className={`mosun-gameover-mini-cell ${i === bombIndex ? 'is-bomb' : ''}`}
            >
              {i === bombIndex && (
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
                  <circle cx="12" cy="16" r="6" />
                  <path d="M14 8l2-2 3 1-1 3-2 2z" />
                </svg>
              )}
            </div>
          ))}
        </div>
        {loserName && (
          <div className="mosun-gameover-loser">패배 · {loserName}</div>
        )}
        <MosunGameOverActions
          restartDisabled={restartDisabled}
          restartHint={restartHint}
          onRestart={onRestart}
          onLobby={onLobby}
          onChooseOther={onChooseOther}
          onExit={onExit}
        />
      </div>
    </div>
  )
}

interface ActionsProps {
  restartDisabled: boolean;
  restartHint?: string;
  onRestart: () => void;
  onLobby: () => void;
  onChooseOther: () => void;
  onExit: () => void;
  variant?: 'win' | 'boom';
  primaryLabel?: string;
}

function MosunGameOverActions({
  restartDisabled,
  restartHint,
  onRestart,
  onLobby,
  onChooseOther,
  onExit,
  variant = 'win',
  primaryLabel,
}: ActionsProps) {
  return (
    <div className="mosun-gameover-actions">
      <button
        type="button"
        className={`mosun-gameover-primary mosun-gameover-primary--${variant}`}
        onClick={onRestart}
        disabled={restartDisabled}
        title={restartHint}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
          <path d="M4 12a8 8 0 0 1 14-5" />
          <path d="M18 3v6h-6" />
          <path d="M20 12a8 8 0 0 1-14 5" />
          <path d="M6 21v-6h6" />
        </svg>
        {primaryLabel ?? '다시하기'}
      </button>
      <div className="mosun-gameover-secondary-row">
        <button type="button" onClick={onLobby}>대기방</button>
        <button type="button" onClick={onChooseOther}>다른 게임</button>
        <button type="button" className="mosun-gameover-exit" onClick={onExit}>나가기</button>
      </div>
      {restartDisabled && restartHint && (
        <div className="mosun-gameover-hint">{restartHint}</div>
      )}
    </div>
  )
}
