import './GameGuideModal.css'

interface GuideStep {
  title: string;
  desc: string;
}

interface GameGuideModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  steps: GuideStep[];
  extra?: React.ReactNode;
}

/**
 * Full-screen guide layer per spec §게임 가이드 오버레이 (상시).
 *
 * Layout:
 *   - Book icon + "게임 가이드" title, X close button on the right
 *   - The FIRST step is treated as the "ONE LINE" highlighted card
 *     (dark ink on accent-primary bg with Press-Start-2P eyebrow).
 *   - Remaining steps are lined up as card rows.
 *   - Extra slot at the bottom for game-specific chrome (rule tag row,
 *     warning box, etc.)
 */
export function GameGuideModal({ open, onClose, title, steps, extra }: GameGuideModalProps) {
  if (!open) return null
  const [oneLine, ...rest] = steps
  return (
    <div className="game-guide-overlay" onClick={onClose}>
      <div className="game-guide-layer" onClick={(e) => e.stopPropagation()}>
        <div className="game-guide-header">
          <div className="game-guide-header-title">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
              <path d="M4 5v14a2 2 0 0 0 2 2h14V3H6a2 2 0 0 0-2 2z" />
              <path d="M8 3v18" />
            </svg>
            <span>{title}</span>
          </div>
          <button type="button" className="game-guide-close" onClick={onClose} aria-label="닫기">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter">
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        </div>

        {oneLine && (
          <div className="game-guide-oneline">
            <div className="game-guide-oneline-eyebrow">ONE LINE</div>
            <div className="game-guide-oneline-body">{oneLine.desc}</div>
          </div>
        )}

        <div className="game-guide-steps">
          {rest.map((s) => (
            <div key={s.title} className="game-guide-step">
              <div className="game-guide-step-title">{s.title}</div>
              <div className="game-guide-step-desc">{s.desc}</div>
            </div>
          ))}
        </div>

        {extra && <div className="game-guide-extra">{extra}</div>}
      </div>
    </div>
  )
}
