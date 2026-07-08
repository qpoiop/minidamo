import './mosun.css'

interface MosunBombConfirmProps {
  cellNumber: number;   // 1-indexed display number
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 폭탄 지목 확인 (spec §폭탄 찾기 확인).
 *
 * Blocks the bomb-guess dispatch until the player commits — the guess
 * is irreversible so a re-confirm is required. Full-screen layer with
 * red conic tint + red inner card.
 */
export function MosunBombConfirm({ cellNumber, onConfirm, onCancel }: MosunBombConfirmProps) {
  return (
    <div className="mosun-bomb-confirm-overlay" onClick={onCancel}>
      <div className="mosun-bomb-confirm-card" onClick={(e) => e.stopPropagation()}>
        <div className="mosun-bomb-confirm-eyebrow">DECLARE BOMB</div>
        <div className="mosun-bomb-confirm-cell">
          <span className="mosun-bomb-confirm-cell-num">{cellNumber}</span>
          <span className="mosun-bomb-confirm-cell-badge" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" fill="currentColor" />
            </svg>
          </span>
        </div>
        <div className="mosun-bomb-confirm-headline">정말 {cellNumber}번 카드가 폭탄?</div>
        <p className="mosun-bomb-confirm-body">
          맞으면 <b className="mosun-bomb-confirm-win">즉시 승리</b>, 틀리면 <b className="mosun-bomb-confirm-lose">즉시 패배</b>.<br />
          돌이킬 수 없어요.
        </p>
        <button type="button" className="mosun-bomb-confirm-cta" onClick={onConfirm}>
          이 카드로 지목
        </button>
        <button type="button" className="mosun-bomb-confirm-cancel" onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  )
}
