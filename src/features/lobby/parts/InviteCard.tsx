interface InviteCardProps {
  hostPeerId: string;
  shareUrl: string;
  offlineOffer: string | null;
  showOnline: boolean;
  showOffline: boolean;
  onCopy: (payload: string, label: string) => void;
  onZoomOnline: () => void;
  onZoomOffline: () => void;
  onScanAnswer: () => void;
}

export function InviteCard({
  hostPeerId,
  shareUrl,
  offlineOffer,
  showOnline,
  showOffline,
  onCopy,
  onZoomOnline,
  onZoomOffline,
  onScanAnswer,
}: InviteCardProps) {
  if (!showOnline && !showOffline) return null

  return (
    <>
      <div className="section-heading">초대 코드</div>
      <div className="host-code-card invite-card">
        {showOnline && (
          <div className="invite-section invite-section--online">
            <div className="invite-section-title">온라인 · 즉시 공유</div>
            <div className="host-code-label">방 ID</div>
            <div className="host-code-id">{hostPeerId}</div>
            <div className="invite-actions invite-actions--dual">
              <button
                type="button"
                className="pixel-btn pixel-btn--primary host-code-btn"
                onClick={() => onCopy(hostPeerId, '코드')}
              >
                코드 복사
              </button>
              <button
                type="button"
                className="pixel-btn pixel-btn--secondary host-code-btn"
                onClick={() => onCopy(shareUrl, 'URL')}
              >
                URL 복사
              </button>
            </div>
            <button
              type="button"
              className="pixel-btn pixel-btn--ghost invite-view-btn"
              onClick={onZoomOnline}
            >
              온라인 QR 보기
            </button>
            <div className="host-code-hint">QR 스캔 또는 URL 열기로 자동 참가</div>
          </div>
        )}

        {showOnline && showOffline && <div className="invite-divider" aria-hidden="true" />}

        {showOffline && (
          <div className="invite-section invite-section--offline">
            <div className="invite-section-title">오프라인 · QR 교환</div>
            <div className="host-code-hint invite-section-desc">
              게스트에게 오프라인 QR을 보여주고, 게스트 응답 QR을 스캔해 연결을 마무리해 주세요.
            </div>
            <div className="invite-actions invite-actions--dual">
              <button
                type="button"
                className="pixel-btn pixel-btn--secondary host-code-btn"
                onClick={onZoomOffline}
                disabled={!offlineOffer}
              >
                오프라인 QR 보기
              </button>
              <button
                type="button"
                className="pixel-btn pixel-btn--primary host-code-btn"
                onClick={onScanAnswer}
              >
                오프라인 응답 QR 스캔
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
