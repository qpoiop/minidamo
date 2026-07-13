interface GameConnectionOverlayProps {
  isOpponentOnline: boolean;
  reconnecting?: boolean;
  onExit: () => void;
}

/**
 * Fallback overlay for the leftover offline case NOT already covered by
 * App's `.reconnect-popup-overlay` (which owns the `RECONNECTING` window
 * with a role-aware retry). Renders only once `reconnecting` has cleared
 * without recovering — e.g. `ERROR` — where a hard reload is the only
 * real escape.
 */
export function GameConnectionOverlay({ isOpponentOnline, reconnecting, onExit }: GameConnectionOverlayProps) {
  if (isOpponentOnline || reconnecting) return null
  return (
    <div className="game-conn-overlay" role="status">
      <div className="game-conn-card">
        <div className="spin-loader" />
        <div className="game-conn-title">상대방 오프라인</div>
        <div className="game-conn-desc">상대방과 데이터 채널이 닫혔어요. 재접속하거나 방을 나가 주세요.</div>
        <div className="game-conn-actions">
          <button
            type="button"
            className="pixel-btn pixel-btn--primary"
            onClick={() => window.location.reload()}
          >
            재접속 시도
          </button>
          <button
            type="button"
            className="pixel-btn pixel-btn--ghost"
            onClick={onExit}
          >
            방 나가기
          </button>
        </div>
      </div>
    </div>
  )
}
