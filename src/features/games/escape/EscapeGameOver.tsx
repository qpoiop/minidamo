import { useEffect } from 'react'
import { useEffectsFire } from '../../../effects/EffectsProvider'
import './escape.css'
import { PALETTE } from '../../../styles/palette'

interface EscapeGameOverProps {
  outcome: 'win' | 'timeout';
  timeUsed: string;             // e.g. "1:47"
  onRestart: () => void;
  onLobby: () => void;
  onChooseOther: () => void;
  onExit: () => void;
  restartDisabled?: boolean;
  restartHint?: string;
}

/**
 * 냥탈출 결과 (spec §M4 · 탈출 성공 + 파티클).
 *
 * Full-screen layer. Check-badge for success (or timeout X for fail),
 * "ESCAPE!" pixel eyebrow, "둘 다 탈출 성공" headline (or 실패 copy),
 * time-used metric card, then 다시 / 나가기 CTAs.
 */
export function EscapeGameOver({
  outcome,
  timeUsed,
  onRestart,
  onLobby,
  onChooseOther,
  onExit,
  restartDisabled = false,
  restartHint,
}: EscapeGameOverProps) {
  const fire = useEffectsFire()
  const win = outcome === 'win'

  useEffect(() => {
    if (!win) return
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 3
    fire('confetti', { x: cx, y: cy, count: 90 })
    fire('spark-burst', { x: cx, y: cy - 30, count: 24, color: PALETTE.fgAccent })
  }, [win, fire])

  return (
    <div className={`escape-gameover-overlay ${win ? '' : 'escape-gameover-overlay--fail'}`}>
      <div className="escape-gameover-body">
        <div className="escape-gameover-badge" aria-hidden="true">
          {win ? (
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
              <path d="M4 12.5l5 5 11-11" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          )}
        </div>
        <div className="escape-gameover-eyebrow">{win ? 'ESCAPE!' : 'TIME OUT'}</div>
        <div className="escape-gameover-headline">{win ? '둘 다 탈출 성공' : '탈출 실패'}</div>
        <div className="escape-gameover-metric">
          <div className="escape-gameover-metric-label">
            {win ? '소요 시간' : '남은 시간'}
          </div>
          <div className="escape-gameover-metric-value">{timeUsed}</div>
          {win && (
            <div className="escape-gameover-metric-note">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
                <path d="M8 4h8v4a4 4 0 0 1-8 0z" />
                <path d="M9 12v4h6v-4" />
              </svg>
              팀 협동 성공
            </div>
          )}
        </div>
        <div className="escape-gameover-actions">
          <button type="button" className="escape-gameover-btn escape-gameover-btn--primary" disabled={restartDisabled} onClick={onRestart} title={restartHint}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
              <path d="M4 12a8 8 0 0 1 14-5" />
              <path d="M18 3v6h-6" />
              <path d="M20 12a8 8 0 0 1-14 5" />
              <path d="M6 21v-6h6" />
            </svg>
            다시하기
          </button>
        </div>
        <div className="escape-gameover-secondary-row">
          <button type="button" onClick={onLobby}>대기방</button>
          <button type="button" onClick={onChooseOther}>다른 게임</button>
          <button type="button" onClick={onExit}>나가기</button>
        </div>
        {restartDisabled && restartHint && (
          <div className="escape-gameover-hint">{restartHint}</div>
        )}
      </div>
    </div>
  )
}
