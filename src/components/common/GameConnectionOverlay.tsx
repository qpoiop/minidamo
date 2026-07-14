interface GameConnectionOverlayProps {
  isOpponentOnline: boolean;
  reconnecting?: boolean;
  /** peerState.error at the moment reconnecting cleared — e.g. the reconnect
   * countdown expiring ("상대방과 재연결할 수 없어요."). Shown in place of the
   * generic fallback text so the message matches what actually happened
   * instead of reading like a fresh, untried disconnect. */
  reason?: string | null;
  onExit: () => void;
}

/**
 * Fallback overlay for the leftover offline case NOT already covered by
 * App's `.reconnect-popup-overlay` (which owns the `RECONNECTING` window
 * with a role-aware retry). Renders once `reconnecting` has cleared without
 * recovering — in practice this is only reached via the reconnect countdown
 * running out (connectionStatus RECONNECTING → IDLE), where a hard reload
 * is the only real escape.
 */
export function GameConnectionOverlay({ isOpponentOnline, reconnecting, reason, onExit }: GameConnectionOverlayProps) {
  if (isOpponentOnline || reconnecting) return null
  const desc = reason
    ? `${reason} 재접속하거나 방을 나가 주세요.`
    : '상대방과 데이터 채널이 닫혔어요. 재접속하거나 방을 나가 주세요.'
  return (
    <div className="game-conn-overlay" role="status">
      <div className="game-conn-card">
        <div className="spin-loader" />
        <div className="game-conn-title">상대방 오프라인</div>
        <div className="game-conn-desc">{desc}</div>
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
