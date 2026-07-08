import { useEffect } from 'react'
import './ConfirmModal.css'

interface ConfirmModalProps {
  open: boolean;
  message: string;
  okLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  onOk: () => void;
  onCancel: () => void;
}

/**
 * Full-screen aricade-style confirm dialog. Replaces window.confirm so
 * the "앱 종료 / 대기방 나가기 / 게임 나가기" prompts don't render as
 * an unstyled OS chrome popup.
 */
export function ConfirmModal({
  open, message,
  okLabel = '나가기',
  cancelLabel = '취소',
  tone = 'default',
  onOk, onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      else if (e.key === 'Enter') onOk()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOk, onCancel])

  if (!open) return null
  return (
    <div className="confirm-modal-overlay" onClick={onCancel} role="dialog" aria-modal="true">
      <div className={`confirm-modal-card confirm-modal-card--${tone}`} onClick={(e) => e.stopPropagation()}>
        <div className="confirm-modal-eyebrow">CONFIRM</div>
        <div className="confirm-modal-message">{message}</div>
        <div className="confirm-modal-actions">
          <button type="button" className="confirm-modal-btn confirm-modal-btn--cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={`confirm-modal-btn confirm-modal-btn--ok confirm-modal-btn--${tone}`} onClick={onOk} autoFocus>
            {okLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
