import { useEffect } from 'react'
import { useEffectsFire } from '../../effects/EffectsProvider'

interface RoundBannerProps {
  round: number;                 // upcoming round number
  totalRounds?: number;          // optional "라운드 X / Y"
  previousWinnerName?: string | null;
  subline?: string;              // e.g. "다음 라운드 시작"
  onDismiss?: () => void;
  autoDismissMs?: number;
}

/**
 * Full-screen banner shown between rounds/points across games. Fires a
 * small spark burst so the transition doesn't feel dead. Auto-dismisses
 * after autoDismissMs (default 1400) — parent can also trigger dismiss.
 */
export function RoundBanner({
  round,
  totalRounds,
  previousWinnerName,
  subline,
  onDismiss,
  autoDismissMs = 1400,
}: RoundBannerProps) {
  const fire = useEffectsFire()

  useEffect(() => {
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 2
    fire('spark-burst', { x: cx, y: cy, count: 20, color: '#c7e06a' })
    const t = setTimeout(() => onDismiss?.(), autoDismissMs)
    return () => clearTimeout(t)
  }, [round, fire, onDismiss, autoDismissMs])

  return (
    <div className="round-banner-overlay" aria-live="polite">
      <div className="round-banner-card">
        <div className="round-banner-eyebrow">
          {totalRounds ? `ROUND ${round} / ${totalRounds}` : `ROUND ${round}`}
        </div>
        {previousWinnerName && (
          <div className="round-banner-prev">
            지난 라운드 승자 · <strong>{previousWinnerName}</strong>
          </div>
        )}
        <div className="round-banner-headline">{subline ?? '다음 라운드 시작'}</div>
        <div className="round-banner-marquee" aria-hidden="true">
          <span>◆ ◆ ◆</span>
        </div>
      </div>
    </div>
  )
}
