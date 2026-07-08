import { useEffect } from 'react'
import { useEffectsFire } from '../../../effects/EffectsProvider'
import './wudada.css'
import { PALETTE } from '../../../styles/palette'

interface WudadaGameOverProps {
  outcome: 'win' | 'lose' | 'draw';
  myDist: number;
  oppDist: number;
  myName: string;
  opponentName: string;
  onRestart: () => void;
  onLobby: () => void;
  onChooseOther: () => void;
  onExit: () => void;
  restartDisabled?: boolean;
  restartHint?: string;
}

/**
 * 우다다 매치 결과 (spec §R4 매치 결과 · 승리 파티클).
 *
 * Full-screen layer. Trophy badge for the winner, "YOU WIN!"/"YOU LOSE"
 * pixel text, distance breakdown as spec-styled rows (highlighted for
 * winner side), plus 다시 / 나가기 CTA row.
 */
export function WudadaGameOver({
  outcome,
  myDist,
  oppDist,
  myName,
  opponentName,
  onRestart,
  onLobby,
  onChooseOther,
  onExit,
  restartDisabled = false,
  restartHint,
}: WudadaGameOverProps) {
  const fire = useEffectsFire()
  const win = outcome === 'win'

  useEffect(() => {
    if (!win) return
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 3
    fire('confetti', { x: cx, y: cy, count: 90 })
    fire('spark-burst', { x: cx, y: cy - 30, count: 24, color: PALETTE.fgAccent })
  }, [win, fire])

  const statusLabel = outcome === 'draw' ? 'DRAW' : win ? 'YOU WIN!' : 'YOU LOSE'

  return (
    <div className="wudada-gameover-overlay">
      <div className="wudada-gameover-body">
        <div className="wudada-gameover-trophy" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
            <path d="M8 4h8v4a4 4 0 0 1-8 0z" />
            <path d="M6 4H4v3a3 3 0 0 0 3 3M18 4h2v3a3 3 0 0 1-3 3" />
            <path d="M10 12v4h4v-4" />
            <rect x="7" y="16" width="10" height="3" />
          </svg>
        </div>
        <div className="wudada-gameover-status">{statusLabel}</div>
        <div className="wudada-gameover-score">
          {win ? '내가 더 멀리 달렸어요' : outcome === 'draw' ? '무승부' : `${opponentName}이(가) 더 멀리 달렸어요`}
        </div>

        <div className="wudada-gameover-eyebrow">거리 기록</div>
        <div className="wudada-gameover-rows">
          <div className={`wudada-gameover-row ${myDist >= oppDist ? 'is-winner' : ''}`}>
            <span className="wudada-gameover-row-tag">ME</span>
            <span className="wudada-gameover-row-name">{myName}</span>
            <span className="wudada-gameover-row-value">{myDist}m</span>
          </div>
          <div className={`wudada-gameover-row ${oppDist >= myDist ? 'is-winner' : ''}`}>
            <span className="wudada-gameover-row-tag">OPP</span>
            <span className="wudada-gameover-row-name">{opponentName}</span>
            <span className="wudada-gameover-row-value">{oppDist}m</span>
          </div>
        </div>

        <div className="wudada-gameover-actions">
          <button type="button" className="wudada-gameover-btn wudada-gameover-btn--primary" disabled={restartDisabled} onClick={onRestart} title={restartHint}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
              <path d="M4 12a8 8 0 0 1 14-5" />
              <path d="M18 3v6h-6" />
              <path d="M20 12a8 8 0 0 1-14 5" />
              <path d="M6 21v-6h6" />
            </svg>
            다시하기
          </button>
        </div>
        <div className="wudada-gameover-secondary-row">
          <button type="button" onClick={onLobby}>대기방</button>
          <button type="button" onClick={onChooseOther}>다른 게임</button>
          <button type="button" onClick={onExit}>나가기</button>
        </div>
        {restartDisabled && restartHint && (
          <div className="wudada-gameover-hint">{restartHint}</div>
        )}
      </div>
    </div>
  )
}
