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
 * Full-screen guide layer per spec §게임 가이드 오버레이 (상시).
 *
 * Content order:
 *   1. Header (book icon + title + X close)
 *   2. ONE LINE hero card (oneLine, or first legacy step as fallback)
 *   3. Structured sections (rows / sprites / badges)
 *   4. Free-form step rows (legacy fallback list)
 *   5. Warning box (bomb border or accent border)
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
              {it.glyph && <GuideGlyphIcon name={it.glyph} />}
              <span>{it.label}</span>
            </div>
          ))}
        </div>
      )}
      {section.kind === 'sprites' && (
        <div className="game-guide-sprite-grid">
          {section.items.map((it) => (
            <div key={it.label} className="game-guide-sprite">
              <div className="game-guide-sprite-box">{it.glyph && <GuideGlyphIcon name={it.glyph} large />}</div>
              <div className="game-guide-sprite-label">{it.label}</div>
            </div>
          ))}
        </div>
      )}
      {section.kind === 'badges' && (
        <div className="game-guide-badges">
          {section.items.map((it) => (
            <span key={it.label} className={`game-guide-badge game-guide-badge--${it.tone ?? 'muted'}`}>
              {it.label}{it.countBadge && <> {it.countBadge}</>}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function GuideGlyphIcon({ name, large }: { name: GuideGlyph; large?: boolean }) {
  const size = large ? 30 : 13
  const common = {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'square' as const,
    strokeLinejoin: 'miter' as const,
    'aria-hidden': true,
  }
  switch (name) {
    case 'grid':
      return <svg {...common}><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /></svg>
    case 'skip':
      return <svg {...common}><path d="M5 5l7 7-7 7M12 5l7 7-7 7" /></svg>
    case 'target':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>
    case 'check':
      return <svg {...common}><path d="M4 12.5l5 5 11-11" /></svg>
    case 'close':
      return <svg {...common}><path d="M5 5l14 14M19 5L5 19" /></svg>
    case 'sprite-cat':
      return <svg {...common}><path d="M5 15v-4l3-3 2 3h4l2-3 3 3v4M8 7l2 2M16 7l-2 2" /><circle cx="10" cy="13" r="0.7" fill="currentColor" /><circle cx="14" cy="13" r="0.7" fill="currentColor" /></svg>
    case 'sprite-buddy':
      return <svg {...common}><path d="M5 15v-4l3-3 2 3h4l2-3 3 3v4" /><path d="M9 13h6" /></svg>
    case 'sprite-key':
      return <svg {...common}><circle cx="8" cy="12" r="4" /><path d="M12 12h9l-2 3M17 12v3" /></svg>
    case 'sprite-door':
      return <svg {...common}><path d="M6 20V4h12v16" /><circle cx="15" cy="12" r="0.9" fill="currentColor" /></svg>
    case 'sprite-eye':
      return <svg {...common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
    case 'sprite-shield':
      return <svg {...common}><path d="M12 3l7 3v5c0 4-3 8-7 10-4-2-7-6-7-10V6z" /></svg>
    case 'sprite-bolt':
      return <svg {...common}><path d="M13 2L4 14h7l-2 8 11-14h-7z" /></svg>
    case 'sprite-monster':
      return <svg {...common}><path d="M4 18v-8a8 8 0 0 1 16 0v8l-2-2-2 2-2-2-2 2-2-2-2 2-2-2z" /><circle cx="9" cy="11" r="1" fill="currentColor" /><circle cx="15" cy="11" r="1" fill="currentColor" /></svg>
    case 'sprite-crate':
      return <svg {...common}><rect x="4" y="6" width="16" height="14" /><path d="M4 10h16M4 16h16M10 6v14M14 6v14" /></svg>
    case 'sprite-puddle':
      return <svg {...common}><path d="M3 17c2-3 6-3 9-3s7 0 9 3" /><path d="M6 14c1-2 3-2 5-2M13 12c2 0 4 1 5 2" /></svg>
    case 'sprite-plant':
      return <svg {...common}><path d="M8 20h8l-1-6H9z" /><path d="M12 14c-2-2-4-5-2-8M12 14c2-2 4-5 2-8" /></svg>
    case 'sprite-dog':
      return <svg {...common}><path d="M5 15v-2l2-2h10l2 2v2" /><path d="M7 11l1-3 2 2M17 11l-1-3-2 2" /><circle cx="10" cy="13" r="0.7" fill="currentColor" /><circle cx="14" cy="13" r="0.7" fill="currentColor" /></svg>
    case 'sprite-fish':
      return <svg {...common}><path d="M4 12s3-4 8-4 8 4 8 4-3 4-8 4-8-4-8-4z" /><path d="M20 12l3-3v6z" fill="currentColor" /><circle cx="8" cy="12" r="0.9" fill="currentColor" /></svg>
    case 'sprite-yarn':
      return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M6 8c3 2 6 5 10 8M8 6c3 2 6 5 9 8M4 12c3 2 6 5 8 8" /></svg>
    default:
      return <svg {...common}><rect x="4" y="4" width="16" height="16" /></svg>
  }
}
