import { useEffect, useRef } from 'react'
import { useEffectsFire } from '../../effects/EffectsProvider'

interface RoundBannerProps {
  round: number;                 // upcoming round number
  totalRounds?: number;
  previousWinnerName?: string | null;
  subline?: string;              // 게임별 커스텀 문구 (필수 — 게임마다 다름)
  headline?: string;             // 예: "새 라운드 시작" · "다음 세트 시작" · "라운드 2 시작"
  onDismiss?: () => void;
  autoDismissMs?: number;
  visual?: 'shuffle' | 'simple'; // shuffle = 3장 카드 애니 (Mosun 등), simple = 텍스트만
}

/**
 * Round transition — spec 시안 §라운드 전환(셔플).
 *
 * Overlapping card silhouettes shuffle behind the round label. Fires a
 * small spark burst on mount. Auto-dismisses after autoDismissMs
 * (default 2600 — chosen so a user can read the message rather than
 * just see a flash).
 */
export function RoundBanner({
  round,
  totalRounds,
  previousWinnerName,
  subline,
  headline,
  onDismiss,
  autoDismissMs = 2600,
  visual = 'simple',
}: RoundBannerProps) {
  const fire = useEffectsFire()
  const onDismissRef = useRef(onDismiss)
  useEffect(() => { onDismissRef.current = onDismiss }, [onDismiss])

  useEffect(() => {
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 2
    fire('spark-burst', { x: cx, y: cy, count: 24, color: '#c7e06a' })
    const t = setTimeout(() => onDismissRef.current?.(), autoDismissMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, autoDismissMs])

  const headlineText = headline
    ?? (totalRounds ? `라운드 ${round} / ${totalRounds} 시작` : `라운드 ${round} 시작`)

  return (
    <div className="round-banner-overlay" aria-live="polite">
      <div className="round-banner-card">
        {visual === 'shuffle' && (
          <div className="round-banner-shuffle" aria-hidden="true">
            <span className="round-banner-shuffle-card round-banner-shuffle-card--back" />
            <span className="round-banner-shuffle-card round-banner-shuffle-card--mid" />
            <span className="round-banner-shuffle-card round-banner-shuffle-card--front">
              <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
                <path d="M4 6h10l4 4v10H4z" />
                <path d="M14 6v4h4" />
                <path d="M8 14l4 4" />
                <path d="M12 14l-4 4" />
              </svg>
            </span>
          </div>
        )}
        <div className="round-banner-headline">{headlineText}</div>
        {previousWinnerName && (
          <div className="round-banner-prev">
            지난 라운드 · <strong>{previousWinnerName}</strong>
          </div>
        )}
        {subline && (
          <div className="round-banner-sub">{subline}</div>
        )}
        {visual === 'shuffle' && (
          <div className="round-banner-pixel">SHUFFLING...</div>
        )}
      </div>
    </div>
  )
}
