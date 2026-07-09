import { useEffect } from 'react'
import { useEffectsFire } from '../../../effects/EffectsProvider'
import { PALETTE } from '../../../styles/palette'
import './bombhunt.css'

interface BombHuntGameOverProps {
  outcome: 'win-guess' | 'win-opp-bomb' | 'lose-bomb' | 'lose-guess';
  winnerName: string;
  loserName?: string;
  bombIndex: number;             // 0..(boardSize-1)
  /** Board side (3/4/5). Drives the mini-board grid so 4×4 / 5×5
   * results actually reveal the bomb in the right cell. */
  boardSide?: 3 | 4 | 5;
  onRestart: () => void;
  onLobby: () => void;
  /** Kept for backwards-compat with call sites that still spread the
   * shared game-props shape. Gameover UI no longer surfaces a separate
   * "다른 게임" button — 옵션 · 게임 변경 routes to the same lobby. */
  onChooseOther?: () => void;
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
export function BombHuntGameOver({
  outcome,
  winnerName,
  loserName,
  bombIndex,
  boardSide = 3,
  onRestart,
  onLobby,
  onExit,
  restartDisabled = false,
  restartHint,
}: BombHuntGameOverProps) {
  const cellCount = boardSide * boardSide
  const fire = useEffectsFire()
  // Wrong-guess loss also renders the defeat variant, not the trophy
  // layout — user reported the loss screen for a bad bomb pick looked
  // suspiciously celebratory (trophy visible) because it fell through
  // to the win branch.
  const isDefeat = outcome === 'lose-bomb' || outcome === 'lose-guess'

  useEffect(() => {
    if (isDefeat) return
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 3
    fire('confetti', { x: cx, y: cy, count: 90 })
    fire('spark-burst', { x: cx, y: cy - 20, count: 24, color: PALETTE.fgAccent })
  }, [isDefeat, fire])

  const narrative = narrativeFor(outcome, winnerName, loserName, bombIndex)

  if (isDefeat) {
    const boomStyle = outcome === 'lose-bomb'
    const headline = boomStyle ? '폭탄을 열었어요…' : '폭탄을 잘못 지목했어요…'
    const eyebrow  = boomStyle ? '☠ BOOM ☠' : '✗ MISS ✗'
    return (
      <div className="bombhunt-gameover-overlay bombhunt-gameover-overlay--boom">
        <div className="bombhunt-gameover-conic bombhunt-gameover-conic--boom" aria-hidden="true" />
        <div className="bombhunt-gameover-body">
          <div className="bombhunt-gameover-eyebrow bombhunt-gameover-eyebrow--boom">{eyebrow}</div>
          <div className="bombhunt-gameover-card bombhunt-gameover-card--bomb">
            <svg viewBox="0 0 24 24" width="52" height="52" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="16" r="6" />
              <path d="M14 8l2-2 3 1-1 3-2 2z" />
              <path d="M16 4l1-2 2 1-1 2z" />
            </svg>
            <span className="bombhunt-gameover-card-label">BOMB</span>
          </div>
          <div className="bombhunt-gameover-headline bombhunt-gameover-headline--boom">{headline}</div>
          <div className="bombhunt-gameover-status bombhunt-gameover-status--boom">YOU LOSE</div>
          <div className="bombhunt-gameover-note">{narrative}</div>
          <BombHuntGameOverActions
            restartDisabled={restartDisabled}
            restartHint={restartHint}
            onRestart={onRestart}
            onLobby={onLobby}
            onExit={onExit}
            variant="boom"
            primaryLabel="같은 게임 다시"
          />
        </div>
      </div>
    )
  }

  // Win / other loss — spec §결과 (승/패, 폭탄 공개).
  const win = outcome.startsWith('win')
  return (
    <div className="bombhunt-gameover-overlay">
      <div className="bombhunt-gameover-body">
        <div className="bombhunt-gameover-trophy" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
            <path d="M8 4h8v4a4 4 0 0 1-8 0z" />
            <path d="M6 4h2M16 4h2" />
            <path d="M6 4a2 2 0 0 0 2 2M18 4a2 2 0 0 1-2 2" />
            <path d="M9 12v4h6v-4" />
            <rect x="7" y="16" width="10" height="3" />
          </svg>
        </div>
        <div className="bombhunt-gameover-status">{win ? 'YOU WIN!' : 'YOU LOSE'}</div>
        <div className="bombhunt-gameover-headline">{winnerName} 승리</div>
        <div className="bombhunt-gameover-note">{narrative}</div>
        <div className="bombhunt-gameover-note bombhunt-gameover-note--sub">폭탄 위치 공개</div>
        <div
          className={`bombhunt-gameover-mini-board bombhunt-gameover-mini-board--side-${boardSide}`}
          style={{ gridTemplateColumns: `repeat(${boardSide}, 1fr)`, gridTemplateRows: `repeat(${boardSide}, 1fr)` }}
          aria-label="폭탄 위치 미니 보드"
        >
          {Array.from({ length: cellCount }).map((_, i) => (
            <div
              key={i}
              className={`bombhunt-gameover-mini-cell ${i === bombIndex ? 'is-bomb' : ''}`}
            >
              {i === bombIndex && (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <circle cx="12" cy="16" r="6" />
                  <path d="M14 8l2-2 3 1-1 3-2 2z" />
                </svg>
              )}
            </div>
          ))}
        </div>
        {loserName && (
          <div className="bombhunt-gameover-loser">패배 · {loserName}</div>
        )}
        <BombHuntGameOverActions
          restartDisabled={restartDisabled}
          restartHint={restartHint}
          onRestart={onRestart}
          onLobby={onLobby}
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
  onExit: () => void;
  variant?: 'win' | 'boom';
  primaryLabel?: string;
}

function BombHuntGameOverActions({
  restartDisabled,
  restartHint,
  onRestart,
  onLobby,
  onExit,
  variant = 'win',
  primaryLabel,
}: ActionsProps) {
  return (
    <div className="bombhunt-gameover-actions">
      <button
        type="button"
        className={`bombhunt-gameover-primary bombhunt-gameover-primary--${variant}`}
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
        {primaryLabel ?? '같은 게임 다시'}
      </button>
      <div className="bombhunt-gameover-secondary-row">
        <button type="button" onClick={onLobby}>옵션 · 게임 변경</button>
        <button type="button" className="bombhunt-gameover-exit" onClick={onExit}>나가기</button>
      </div>
      {restartDisabled && restartHint && (
        <div className="bombhunt-gameover-hint">{restartHint}</div>
      )}
    </div>
  )
}

/**
 * Context sentence explaining WHY the round ended. Not just a
 * scoreboard — spec §결과 wants a beat of story.
 */
function narrativeFor(
  outcome: 'win-guess' | 'win-opp-bomb' | 'lose-bomb' | 'lose-guess',
  _winnerName: string,
  loserName: string | undefined,
  bombIndex: number,
): string {
  const pos = `${bombIndex + 1}번 카드`
  switch (outcome) {
    case 'win-guess':
      return `${pos}가 폭탄이었어요. 정확히 짚었어요.`
    case 'win-opp-bomb':
      return `${loserName ?? '상대'}가 ${pos}(폭탄)를 뒤집었어요.`
    case 'lose-bomb':
      return `${pos}가 폭탄이었어요. 규칙을 더 캐서 좁혔어야 했어요.`
    case 'lose-guess':
      // Was worded as if the winner had guessed — but in this branch
      // the LOSER (viewer) picked wrong. Correct the beat.
      return `당신이 짚은 카드는 폭탄이 아니었어요. 실제 폭탄은 ${pos}였어요.`
    default:
      return `${pos}가 폭탄이었어요.`
  }
}
