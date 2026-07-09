import type { GameGuideStep, GuideGlyph, GuideSection, GuideWarning } from '../../../games/registry'
import './GameGuideModal.css'

interface GameGuideModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  oneLine?: string;
  sections?: GuideSection[];
  steps?: GameGuideStep[];
  warning?: GuideWarning;
}

/**
 * Full-screen guide layer (spec §게임 가이드 오버레이).
 * Content order:
 *   1. Header (book icon + title + X close)
 *   2. ONE LINE hero card
 *   3. Structured sections (rows / sprites / badges)
 *   4. Legacy step rows
 *   5. Warning card
 */
export function GameGuideModal({ open, onClose, title, oneLine, sections, steps, warning }: GameGuideModalProps) {
  if (!open) return null
  const legacySteps = steps ?? []
  const [legacyLead, ...restSteps] = legacySteps
  const heroLine = oneLine ?? legacyLead?.desc
  const listSteps = oneLine ? legacySteps : restSteps
  return (
    <div className="game-guide-overlay" onClick={onClose}>
      <div className="game-guide-layer" onClick={(e) => e.stopPropagation()}>
        <div className="game-guide-header">
          <div className="game-guide-header-title">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
              <path d="M4 3h7v18H6a2 2 0 0 1-2-2z" opacity="0.7" />
              <path d="M13 3h7v16a2 2 0 0 0-2 2h-5z" />
              <path d="M6 6h4v1H6zM6 9h4v1H6zM15 6h4v1h-4zM15 9h4v1h-4z" fill="var(--bg-app)" />
            </svg>
            <span>{title}</span>
          </div>
          <button type="button" className="game-guide-close" onClick={onClose} aria-label="닫기">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
              <path d="M6 4l14 14-2 2L4 6z M18 4L4 18l2 2 14-14z" />
            </svg>
          </button>
        </div>

        {heroLine && (
          <div className="game-guide-oneline">
            <div className="game-guide-oneline-eyebrow">ONE LINE</div>
            <div className="game-guide-oneline-body">{heroLine}</div>
          </div>
        )}

        {sections?.map((s) => (
          <GuideSectionBlock key={s.title} section={s} />
        ))}

        {listSteps.length > 0 && (
          <div className="game-guide-steps">
            {listSteps.map((s) => (
              <div key={s.title} className="game-guide-step">
                <div className="game-guide-step-title">{s.title}</div>
                <div className="game-guide-step-desc">{s.desc}</div>
              </div>
            ))}
          </div>
        )}

        {warning && (
          <div className={`game-guide-warning game-guide-warning--${warning.tone ?? 'accent'}`}>
            {warning.text}
          </div>
        )}
      </div>
    </div>
  )
}

function GuideSectionBlock({ section }: { section: GuideSection }) {
  return (
    <div className={`game-guide-section game-guide-section--${section.kind}`}>
      <div className="game-guide-section-title">{section.title}</div>
      {section.kind === 'rows' && (
        <div className="game-guide-rows">
          {section.items.map((it) => (
            <div key={it.label} className={`game-guide-row game-guide-row--${it.tone ?? 'muted'}`}>
              {it.glyph && (
                <span className="game-guide-row-icon">
                  <GuideGlyphIcon name={it.glyph} size={20} tone={it.tone ?? 'muted'} />
                </span>
              )}
              <div className="game-guide-row-body">
                <span className="game-guide-row-label">{it.label}</span>
                {it.desc && <span className="game-guide-row-desc">{it.desc}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {section.kind === 'sprites' && (
        <div className="game-guide-sprite-grid">
          {section.items.map((it) => (
            <div key={it.label} className="game-guide-sprite">
              <div className="game-guide-sprite-box">
                {it.glyph && <GuideGlyphIcon name={it.glyph} size={32} tone={it.tone ?? 'accent'} />}
              </div>
              <div className="game-guide-sprite-label">{it.label}</div>
              {it.desc && <div className="game-guide-sprite-desc">{it.desc}</div>}
            </div>
          ))}
        </div>
      )}
      {section.kind === 'badges' && (
        <div className="game-guide-badges">
          {section.items.map((it) => (
            <span key={it.label} className={`game-guide-badge game-guide-badge--${it.tone ?? 'muted'}`}>
              {it.label}{it.countBadge && <span className="game-guide-badge-count">{it.countBadge}</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Redrawn glyph set — filled shapes, distinct silhouettes so each icon
 * reads at 20px. Colour picks up the `tone` so accent/danger rows tint
 * the icon too.
 */
function GuideGlyphIcon({ name, size = 20, tone = 'muted' }: { name: GuideGlyph; size?: number; tone?: 'accent' | 'bomb' | 'muted' }) {
  const cls = `guide-glyph guide-glyph--${tone}`
  const common = { viewBox: '0 0 24 24', width: size, height: size, className: cls, 'aria-hidden': true }
  switch (name) {
    case 'grid':
      // 3×3 grid with cell 5 highlighted — reads as "flip a card".
      return (
        <svg {...common}>
          <path fill="currentColor" opacity="0.35" d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h6v6h-6z" />
          <path fill="currentColor" opacity="0.35" d="M10 3h4v6h-4zM3 10h6v4H3zM15 10h6v4h-6zM10 15h4v6h-4z" />
          <path fill="currentColor" d="M10 10h4v4h-4z" />
        </svg>
      )
    case 'skip':
      // Forward-forward with vertical bar — reads as "pass turn".
      return (
        <svg {...common}>
          <path fill="currentColor" d="M4 5l7 7-7 7zM11 5l7 7-7 7zM19 5h2v14h-2z" />
        </svg>
      )
    case 'target':
      // Crosshair + red pip — reads as "declare bomb".
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="2.5" fill="#c2331f" />
          <path stroke="currentColor" strokeWidth="2" d="M12 1v3M12 20v3M1 12h3M20 12h3" />
        </svg>
      )
    case 'check':
      // Bold check on rounded chip.
      return (
        <svg {...common}>
          <rect x="2" y="2" width="20" height="20" rx="3" fill="currentColor" opacity="0.25" />
          <path fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" d="M6 12.5l4 4 8-9" />
        </svg>
      )
    case 'close':
      return (
        <svg {...common}>
          <rect x="2" y="2" width="20" height="20" rx="3" fill="currentColor" opacity="0.25" />
          <path fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" d="M7 7l10 10M17 7L7 17" />
        </svg>
      )

    // Sprite bank — filled illustrations. Each drawn to be recognisable
    // at 32px (sprite tile size) without labels.
    case 'sprite-cat':
      return (
        <svg {...common}>
          <path fill="currentColor" d="M6 10l2-3 2 3h4l2-3 2 3v7a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" />
          <path fill="var(--bg-app)" d="M9 13.5h1.5V15H9zM13.5 13.5H15V15h-1.5z" />
          <path fill="var(--bg-app)" d="M10.5 17h3v.6h-3z" />
        </svg>
      )
    case 'sprite-buddy':
      // Two cats close together.
      return (
        <svg {...common}>
          <path fill="currentColor" opacity="0.5" d="M2 12l1.5-2 1.5 2h2l1.5-2 1.5 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" />
          <path fill="currentColor" d="M13 12l1.5-2 1.5 2h2l1.5-2 1.5 2v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z" />
        </svg>
      )
    case 'sprite-key':
      return (
        <svg {...common}>
          <circle cx="7" cy="12" r="4" fill="currentColor" />
          <circle cx="7" cy="12" r="1.6" fill="var(--bg-app)" />
          <path fill="currentColor" d="M11 11h11v2h-4v3h-2v-3h-2v3h-2v-3h-1z" />
        </svg>
      )
    case 'sprite-door':
      return (
        <svg {...common}>
          <path fill="currentColor" d="M4 3h16v18H4z" />
          <path fill="var(--bg-app)" d="M6 5h12v14H6z" />
          <path fill="currentColor" d="M16 11h1.5v2H16z" />
          <path fill="currentColor" d="M6 3h12v2H6zM6 21h12v.5H6z" />
        </svg>
      )
    case 'sprite-eye':
      return (
        <svg {...common}>
          <path fill="currentColor" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="4" fill="var(--bg-app)" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
        </svg>
      )
    case 'sprite-shield':
      return (
        <svg {...common}>
          <path fill="currentColor" d="M12 2l9 3v6c0 5-4 10-9 12-5-2-9-7-9-12V5z" />
          <path fill="var(--bg-app)" d="M8 11l3 3 5-5" stroke="var(--bg-app)" strokeWidth="0" />
          <path fill="none" stroke="var(--bg-app)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M8 12l3 3 5-6" />
        </svg>
      )
    case 'sprite-bolt':
      return (
        <svg {...common}>
          <path fill="currentColor" d="M14 2L4 14h6l-2 8 12-14h-7z" />
        </svg>
      )
    case 'sprite-monster':
      return (
        <svg {...common}>
          <path fill="currentColor" d="M4 18v-7a8 8 0 0 1 16 0v7l-2-2-2 2-2-2-2 2-2-2-2 2-2-2z" />
          <circle cx="9" cy="11" r="1.8" fill="var(--bg-app)" />
          <circle cx="15" cy="11" r="1.8" fill="var(--bg-app)" />
          <path fill="none" stroke="var(--bg-app)" strokeWidth="1.4" strokeLinecap="round" d="M9 15h6" />
        </svg>
      )
    default:
      return <svg {...common}><rect x="4" y="4" width="16" height="16" fill="currentColor" opacity="0.35" /></svg>
  }
}
