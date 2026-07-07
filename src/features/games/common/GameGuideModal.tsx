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

export function GameGuideModal({ open, onClose, title, steps, extra }: GameGuideModalProps) {
  if (!open) return null
  return (
    <div className="game-guide-overlay" onClick={onClose}>
      <div className="game-guide-card" onClick={(e) => e.stopPropagation()}>
        <div className="game-guide-title">{title}</div>
        <ol className="game-guide-steps">
          {steps.map((s) => (
            <li key={s.title} className="game-guide-step">
              <div className="game-guide-step-title">{s.title}</div>
              <div className="game-guide-step-desc">{s.desc}</div>
            </li>
          ))}
        </ol>
        {extra && <div className="game-guide-extra">{extra}</div>}
        <button type="button" className="pixel-btn pixel-btn--primary game-guide-close" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  )
}
